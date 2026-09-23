/**
 * CROSS-DEVICE SYNC ENGINE
 * ------------------------
 * The shop runs on several devices at once — customer phones, the counter
 * till, the kitchen display, the driver app, the owner's laptop. Every store
 * in this app is local-first (instant, works offline); this module keeps them
 * in step through Supabase.
 *
 *  - Documents   whole JSON blobs, last write wins: the menu, prices, sold-out
 *                flags, store hours, the online-ordering switch, kitchen pause,
 *                promo codes, drivers, the staff roster.
 *  - Stock       one count per product, changed by deltas so two tills selling
 *                the same item at once both count.
 *  - Records     append/update streams: till shifts (Z-reports), timecards,
 *                the audit log.
 *  - Orders      pushed through an outbox that survives reloads and retries
 *                until the network is back, so a sale is never lost.
 *
 * Who writes what: customer devices only push their own orders and the stock
 * those orders use; everything else is published by staff devices (a device
 * where a staff PIN has been used). Customer devices never download other
 * people's orders.
 *
 * "Start trading fresh" publishes a new epoch: every device drops the orders,
 * shifts, timecards and audit entries from before it, so pre-launch test data
 * disappears everywhere without deleting anything server-side.
 */
import type { Order } from './orderStore'
import type { KvRow, RemoteBackend, StockRow } from './sync/backend'
import { isSupabaseConfigured } from './supabaseConfig'

const STORE_ID: string = (import.meta as { env?: Record<string, string> }).env?.VITE_STORE_ID || 'just_spuds'
export const DOC_PREFIX = `${STORE_ID}::doc::`
export const PRIVATE_DOC_PREFIX = `${STORE_ID}::priv::`
export const RECORD_PREFIX = `${STORE_ID}::rec::`
const EPOCH_DOC = 'system.epoch'

const META_KEY = 'just_spuds_sync_meta_v1'
const STAFF_DEVICE_KEY = 'just_spuds_staff_device_v1'
const DEVICE_ID_KEY = 'just_spuds_device_id_v1'
const EPOCH_KEY = 'just_spuds_sync_epoch_v1'
const ORDER_OUTBOX_KEY = 'just_spuds_order_outbox_v1'
const STOCK_OUTBOX_KEY = 'just_spuds_stock_outbox_v1'
const RECORD_OUTBOX_KEY = 'just_spuds_record_outbox_v1'

const STAFF_FULL_ORDER_WINDOW_MS = 45 * 24 * 60 * 60 * 1000
const STAFF_POLL_ORDER_WINDOW_MS = 12 * 60 * 60 * 1000
const POLL_MS = 20_000

// ---------------------------------------------------------------------------
// Small storage helpers
// ---------------------------------------------------------------------------

const hasStorage = () => typeof localStorage !== 'undefined'

function readJSON<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  if (!hasStorage()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('[sync] storage write failed', err)
  }
}

let lastStamp = 0
/** Strictly increasing ISO timestamps from this device, so two edits in the same millisecond still order. */
function stamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return new Date(lastStamp).toISOString()
}

export function getDeviceId(): string {
  let id = hasStorage() ? localStorage.getItem(DEVICE_ID_KEY) : null
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`
    if (hasStorage()) localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// ---------------------------------------------------------------------------
// Who is this device?
// ---------------------------------------------------------------------------

type AccessProbe = () => { staff: boolean; management: boolean }
let accessProbe: AccessProbe = () => ({ staff: false, management: false })

/** authStore tells us who is signed in (kept as a callback to avoid an import cycle). */
export function setAccessProbe(probe: AccessProbe) {
  accessProbe = probe
}

/** A device where any staff PIN has been used. It stays a staff device after the PIN screen locks. */
export function isStaffDevice(): boolean {
  if (accessProbe().staff) return true
  return hasStorage() && localStorage.getItem(STAFF_DEVICE_KEY) === '1'
}

export function markStaffDevice() {
  if (!hasStorage()) return
  const was = localStorage.getItem(STAFF_DEVICE_KEY) === '1'
  localStorage.setItem(STAFF_DEVICE_KEY, '1')
  if (!was && started) {
    // Became a staff device: pull the shop-wide data and widen the order feed.
    resubscribe()
    void syncNow({ fullOrders: true })
  }
}

const canPublish = () => isStaffDevice()
/** Only a signed-in manager may create a shop-wide document that does not exist yet. */
const canSeed = () => accessProbe().management

// ---------------------------------------------------------------------------
// Status for the UI
// ---------------------------------------------------------------------------

export interface SyncStatus {
  /** 'off' = no backend configured (local only). */
  state: 'off' | 'connecting' | 'synced' | 'offline'
  lastSyncAt?: string
  pending: number
  lastError?: string
  staffDevice: boolean
}

let status: SyncStatus = { state: 'off', pending: 0, staffDevice: false }
const statusListeners = new Set<(s: SyncStatus) => void>()

function countPending(): number {
  const meta = readJSON<Record<string, DocMeta>>(META_KEY, {})
  const dirtyDocs = Object.values(meta).filter((m) => m.dirty).length
  return (
    dirtyDocs +
    readJSON<string[]>(ORDER_OUTBOX_KEY, []).length +
    readJSON<StockOp[]>(STOCK_OUTBOX_KEY, []).length +
    readJSON<string[]>(RECORD_OUTBOX_KEY, []).length
  )
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch, pending: countPending(), staffDevice: isStaffDevice() }
  const snap = { ...status }
  statusListeners.forEach((l) => l(snap))
}

export function getSyncStatus(): SyncStatus {
  return { ...status, pending: countPending(), staffDevice: isStaffDevice() }
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn)
  fn(getSyncStatus())
  return () => statusListeners.delete(fn)
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface DocSpec {
  name: string
  storageKey: string
  /** Staff-only documents (PIN hashes, driver details) — customer devices never fetch them. */
  private?: boolean
  /** Strip device-local parts before publishing (e.g. stock counts, which sync separately). */
  toRemote?: (local: unknown) => unknown
  /** Merge the published copy into this device's copy. */
  fromRemote?: (remote: unknown, local: unknown) => unknown
  /** Tell the owning store its data changed underneath it. */
  notify: () => void
}

interface DocMeta {
  dirty?: boolean
  localAt?: string
  remoteAt?: string
}

interface DocEnvelope {
  data: unknown
  at: string
  by?: string
}

const docs = new Map<string, DocSpec>()

export function registerDoc(spec: DocSpec) {
  docs.set(spec.name, spec)
}

const docKey = (spec: DocSpec) => `${spec.private ? PRIVATE_DOC_PREFIX : DOC_PREFIX}${spec.name}`

/** Call after a store writes a synced document locally. Customer devices never publish. */
export function markDocChanged(name: string) {
  if (!docs.has(name) || !canPublish()) return
  const meta = readJSON<Record<string, DocMeta>>(META_KEY, {})
  meta[name] = { ...meta[name], dirty: true, localAt: stamp() }
  writeJSON(META_KEY, meta)
  scheduleFlush()
}

/** Manual override from the admin sync panel: this device's copy becomes everyone's. */
export async function publishAllDocs(): Promise<boolean> {
  if (!canPublish()) return false
  const meta = readJSON<Record<string, DocMeta>>(META_KEY, {})
  docs.forEach((spec) => {
    if (hasStorage() && localStorage.getItem(spec.storageKey) != null) meta[spec.name] = { ...meta[spec.name], dirty: true, localAt: stamp() }
  })
  writeJSON(META_KEY, meta)
  return flushDocs()
}

async function flushDocs(): Promise<boolean> {
  if (!backend) return false
  const meta = readJSON<Record<string, DocMeta>>(META_KEY, {})
  const rows: KvRow[] = []
  const sent: Record<string, string> = {}
  for (const [name, m] of Object.entries(meta)) {
    const spec = docs.get(name)
    if (!m.dirty || !spec || !m.localAt) continue
    const raw = hasStorage() ? localStorage.getItem(spec.storageKey) : null
    if (raw == null) continue
    let local: unknown
    try {
      local = JSON.parse(raw)
    } catch {
      continue
    }
    const envelope: DocEnvelope = { data: spec.toRemote ? spec.toRemote(local) : local, at: m.localAt, by: getDeviceId() }
    rows.push({ key: docKey(spec), value: envelope, updatedAt: m.localAt })
    sent[name] = m.localAt
  }
  if (rows.length === 0) return true
  const ok = await backend.putKv(rows)
  if (ok) {
    const after = readJSON<Record<string, DocMeta>>(META_KEY, {})
    Object.entries(sent).forEach(([name, at]) => {
      // Only clear it if nothing changed while the request was in flight.
      if (after[name]?.localAt === at) after[name] = { dirty: false, localAt: at, remoteAt: at }
    })
    writeJSON(META_KEY, after)
  }
  return ok
}

function applyDocRow(row: KvRow): void {
  let name: string
  if (row.key.startsWith(DOC_PREFIX)) name = row.key.slice(DOC_PREFIX.length)
  else if (row.key.startsWith(PRIVATE_DOC_PREFIX)) name = row.key.slice(PRIVATE_DOC_PREFIX.length)
  else return

  const env = row.value as DocEnvelope | null
  if (!env || typeof env !== 'object' || typeof env.at !== 'string') return

  if (name === EPOCH_DOC) {
    applyEpoch(env.data as Epoch)
    return
  }

  const spec = docs.get(name)
  if (!spec) return
  if (spec.private && !isStaffDevice()) return

  const meta = readJSON<Record<string, DocMeta>>(META_KEY, {})
  const m = meta[name] || {}
  if (m.remoteAt === env.at && !m.dirty) return
  if (m.dirty && m.localAt && m.localAt > env.at) return // ours is newer; it is on its way up

  const local = readJSON<unknown>(spec.storageKey, null)
  const next = spec.fromRemote ? spec.fromRemote(env.data, local) : env.data
  writeJSON(spec.storageKey, next)
  meta[name] = { dirty: false, localAt: env.at, remoteAt: env.at }
  writeJSON(META_KEY, meta)
  spec.notify()
}

const LAST_PULL_KEY = 'just_spuds_sync_last_pull_v1'

/**
 * What this device knows about a shared document: 'remote' (it has the shop's
 * copy), 'absent' (it asked the server and there is none yet) or 'unknown'
 * (it has never managed to ask — e.g. a fresh, offline browser).
 */
export function getDocSyncState(name: string): 'remote' | 'absent' | 'unknown' {
  const meta = readJSON<Record<string, DocMeta>>(META_KEY, {})
  if (meta[name]?.remoteAt) return 'remote'
  const last = readJSON<{ at: string; present: string[] } | null>(LAST_PULL_KEY, null)
  if (!last) return 'unknown'
  return last.present.includes(name) ? 'remote' : 'absent'
}

async function pullDocs(): Promise<boolean> {
  if (!backend) return false
  const lists = await Promise.all([
    backend.listKv(DOC_PREFIX),
    isStaffDevice() ? backend.listKv(PRIVATE_DOC_PREFIX) : Promise.resolve([] as KvRow[]),
  ])
  if (lists.some((l) => l === null)) return false
  const rows = ([] as KvRow[]).concat(...(lists as KvRow[][]))
  // The epoch goes first: it decides what the rest of this pull may keep.
  rows.sort((a, b) => (a.key.endsWith(EPOCH_DOC) ? -1 : b.key.endsWith(EPOCH_DOC) ? 1 : 0))
  rows.forEach(applyDocRow)
  writeJSON(LAST_PULL_KEY, {
    at: new Date().toISOString(),
    present: rows.map((r) => r.key.slice(r.key.startsWith(DOC_PREFIX) ? DOC_PREFIX.length : PRIVATE_DOC_PREFIX.length)),
  })

  if (canSeed()) {
    const present = new Set(rows.map((r) => r.key))
    docs.forEach((spec) => {
      if (!present.has(docKey(spec)) && hasStorage() && localStorage.getItem(spec.storageKey) != null) markDocChanged(spec.name)
    })
  }
  return true
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

interface StockOp {
  id: string
  delta?: number
  set?: number
}

interface StockSpec {
  /** Write counts that came from another device into the local menu. */
  apply(rows: StockRow[]): void
  /** This device's current counts. */
  levels(): StockRow[]
}

let stockSpec: StockSpec | null = null

export function registerStock(spec: StockSpec) {
  stockSpec = spec
}

/** Any device, customers included: an order changes stock wherever it is placed. */
export function queueStockDelta(id: string, delta: number) {
  if (!delta) return
  pushStockOp({ id, delta })
}

export function queueStockSet(id: string, qty: number) {
  pushStockOp({ id, set: Math.max(0, Math.round(qty)) })
}

function pushStockOp(op: StockOp) {
  const ops = readJSON<StockOp[]>(STOCK_OUTBOX_KEY, [])
  ops.push(op)
  writeJSON(STOCK_OUTBOX_KEY, ops.slice(-500))
  scheduleFlush()
}

async function flushStock(): Promise<boolean> {
  if (!backend || !stockSpec) return false
  const ops = readJSON<StockOp[]>(STOCK_OUTBOX_KEY, [])
  if (ops.length === 0) return true
  const remote = await backend.listStock()
  if (!remote) return false
  const counts = new Map(remote.map((r) => [r.id, r.qty]))
  const local = new Map(stockSpec.levels().map((r) => [r.id, r.qty]))
  const touched = new Set<string>()
  for (const op of ops) {
    touched.add(op.id)
    if (typeof op.set === 'number') counts.set(op.id, op.set)
    else if (counts.has(op.id)) counts.set(op.id, Math.max(0, (counts.get(op.id) || 0) + (op.delta || 0)))
    // No shared count yet: this device's count (which already includes the change) becomes it.
    else counts.set(op.id, local.get(op.id) ?? 0)
  }
  const rows = [...touched].map((id) => ({ id, qty: counts.get(id) ?? 0 }))
  const ok = await backend.putStock(rows)
  if (ok) {
    const remaining = readJSON<StockOp[]>(STOCK_OUTBOX_KEY, []).slice(ops.length)
    writeJSON(STOCK_OUTBOX_KEY, remaining)
    const stillPending = new Set(remaining.map((o) => o.id))
    stockSpec.apply(rows.filter((r) => !stillPending.has(r.id)))
  }
  return ok
}

function applyStockRows(rows: StockRow[]) {
  if (!stockSpec || rows.length === 0) return
  const pending = new Set(readJSON<StockOp[]>(STOCK_OUTBOX_KEY, []).map((o) => o.id))
  const fresh = rows.filter((r) => !pending.has(r.id))
  if (fresh.length) stockSpec.apply(fresh)
}

async function pullStock(): Promise<boolean> {
  if (!backend || !stockSpec) return false
  const rows = await backend.listStock()
  if (!rows) return false
  applyStockRows(rows)
  if (canSeed()) {
    const have = new Set(rows.map((r) => r.id))
    stockSpec.levels().forEach((r) => {
      if (!have.has(r.id)) queueStockSet(r.id, r.qty)
    })
  }
  return true
}

// ---------------------------------------------------------------------------
// Records (shifts, timecards, audit log)
// ---------------------------------------------------------------------------

export interface RecordSpec {
  collection: string
  /** The current local copy of a record, for publishing. */
  get(id: string): ({ updatedAt?: string } & object) | undefined
  /** Merge records published by other devices (the store decides last-write-wins). */
  apply(items: unknown[]): void
  /** How many of the newest records to fetch. */
  limit?: number
}

const records = new Map<string, RecordSpec>()

export function registerRecords(spec: RecordSpec) {
  records.set(spec.collection, spec)
}

export function markRecordChanged(collection: string, id: string) {
  if (!records.has(collection) || !canPublish()) return
  const outbox = readJSON<string[]>(RECORD_OUTBOX_KEY, [])
  const key = `${collection}::${id}`
  if (!outbox.includes(key)) outbox.push(key)
  writeJSON(RECORD_OUTBOX_KEY, outbox.slice(-2000))
  scheduleFlush()
}

async function flushRecords(): Promise<boolean> {
  if (!backend) return false
  const outbox = readJSON<string[]>(RECORD_OUTBOX_KEY, [])
  if (outbox.length === 0) return true
  const rows: KvRow[] = []
  const now = stamp()
  outbox.forEach((key) => {
    const sep = key.indexOf('::')
    const spec = records.get(key.slice(0, sep))
    const item = spec?.get(key.slice(sep + 2))
    if (item) rows.push({ key: `${RECORD_PREFIX}${key}`, value: item, updatedAt: item.updatedAt || now })
  })
  const ok = rows.length === 0 ? true : await backend.putKv(rows)
  if (ok) {
    const after = readJSON<string[]>(RECORD_OUTBOX_KEY, [])
    writeJSON(RECORD_OUTBOX_KEY, after.filter((k) => !outbox.includes(k)))
  }
  return ok
}

async function pullRecords(): Promise<boolean> {
  if (!backend || !isStaffDevice()) return true
  const since = getEpochAt()
  const results = await Promise.all(
    [...records.values()].map(async (spec) => {
      const rows = await backend!.listKv(`${RECORD_PREFIX}${spec.collection}::`, { limit: spec.limit || 300, since })
      if (!rows) return false
      if (rows.length) spec.apply(rows.map((r) => r.value))
      return true
    }),
  )
  return results.every(Boolean)
}

function applyRecordRow(row: KvRow) {
  if (!isStaffDevice()) return
  const rest = row.key.slice(RECORD_PREFIX.length)
  const spec = records.get(rest.slice(0, rest.indexOf('::')))
  if (!spec) return
  const since = getEpochAt()
  if (since && row.updatedAt && row.updatedAt < since) return
  spec.apply([row.value])
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

interface OrderSpec {
  get(id: string): Order | undefined
  /** Merge orders from other devices; the store keeps the newer copy of each. */
  apply(orders: Order[]): void
  /** Orders this browser placed as a customer (for customer devices). */
  customerIds(): string[]
  /** Customer devices keep only their own orders. */
  pruneToCustomer(ids: string[]): void
  /** Drop everything created before this time (new epoch). */
  wipeBefore(iso: string): void
}

let orderSpec: OrderSpec | null = null

export function registerOrders(spec: OrderSpec) {
  orderSpec = spec
}

/** Any device: queue orders for upload. They stay queued until the server has them. */
export function markOrdersChanged(ids: string[]) {
  if (ids.length === 0) return
  const outbox = readJSON<string[]>(ORDER_OUTBOX_KEY, [])
  let widened = false
  ids.forEach((id) => {
    if (!outbox.includes(id)) outbox.push(id)
    if (!isStaffDevice() && !subscribedOrderIds.includes(id)) widened = true
  })
  writeJSON(ORDER_OUTBOX_KEY, outbox)
  scheduleFlush(120)
  if (widened && started) resubscribe()
}

async function flushOrders(): Promise<boolean> {
  if (!backend || !orderSpec) return false
  const outbox = readJSON<string[]>(ORDER_OUTBOX_KEY, [])
  if (outbox.length === 0) return true
  const orders = outbox.map((id) => orderSpec!.get(id)).filter((o): o is Order => Boolean(o))
  const sentAt = new Map(orders.map((o) => [o.id, o.updatedAt]))
  const ok = orders.length === 0 ? true : await backend.upsertOrders(orders)
  if (ok) {
    const after = readJSON<string[]>(ORDER_OUTBOX_KEY, [])
    writeJSON(
      ORDER_OUTBOX_KEY,
      after.filter((id) => {
        if (!outbox.includes(id)) return true
        const current = orderSpec!.get(id)
        // Keep it queued if it changed again while this upload was in flight.
        return current ? current.updatedAt !== sentAt.get(id) : false
      }),
    )
  }
  return ok
}

function applyRemoteOrders(list: Order[]) {
  if (!orderSpec || list.length === 0) return
  const pending = new Set(readJSON<string[]>(ORDER_OUTBOX_KEY, []))
  const since = getEpochAt()
  const fresh = list.filter((o) => !pending.has(o.id) && (!since || o.createdAt >= since))
  if (!isStaffDevice()) {
    const mine = new Set(orderSpec.customerIds())
    const own = fresh.filter((o) => mine.has(o.id))
    if (own.length) orderSpec.apply(own)
    return
  }
  if (fresh.length) orderSpec.apply(fresh)
}

async function pullOrders(full: boolean): Promise<boolean> {
  if (!backend || !orderSpec) return false
  if (isStaffDevice()) {
    const window = full ? STAFF_FULL_ORDER_WINDOW_MS : STAFF_POLL_ORDER_WINDOW_MS
    let since = new Date(Date.now() - window).toISOString()
    const epochAt = getEpochAt()
    if (epochAt && epochAt > since) since = epochAt
    const list = await backend.fetchOrders({ since, limit: full ? 1500 : 400 })
    if (!list) return false
    applyRemoteOrders(list)
    return true
  }
  const ids = orderSpec.customerIds()
  orderSpec.pruneToCustomer(ids)
  if (ids.length === 0) return true
  const list = await backend.fetchOrders({ ids })
  if (!list) return false
  applyRemoteOrders(list)
  return true
}

/** Customer tracking page: an order this device has not seen (e.g. link opened on another phone). */
export async function fetchOrderById(id: string): Promise<Order | null> {
  if (!backend || !orderSpec) return null
  const list = await backend.fetchOrders({ ids: [id] })
  const found = list?.[0]
  if (!found) return null
  const pending = new Set(readJSON<string[]>(ORDER_OUTBOX_KEY, []))
  if (!pending.has(found.id)) orderSpec.apply([found])
  return orderSpec.get(found.id) || found
}

// ---------------------------------------------------------------------------
// Epoch — "start trading fresh"
// ---------------------------------------------------------------------------

export interface Epoch {
  id: string
  at: string
  by?: string
}

const epochHandlers = new Set<(atIso: string) => void>()

export function registerEpochHandler(fn: (atIso: string) => void) {
  epochHandlers.add(fn)
}

export function getEpoch(): Epoch | null {
  return readJSON<Epoch | null>(EPOCH_KEY, null)
}

export function getEpochAt(): string | undefined {
  return getEpoch()?.at
}

function applyEpoch(epoch: Epoch | null) {
  if (!epoch || typeof epoch.id !== 'string' || typeof epoch.at !== 'string') return
  if (getEpoch()?.id === epoch.id) return
  writeJSON(EPOCH_KEY, epoch)
  orderSpec?.wipeBefore(epoch.at)
  epochHandlers.forEach((fn) => fn(epoch.at))
  // Anything still queued from before the reset is test data too.
  const keepOrders = readJSON<string[]>(ORDER_OUTBOX_KEY, []).filter((id) => {
    const o = orderSpec?.get(id)
    return o ? o.createdAt >= epoch.at : false
  })
  writeJSON(ORDER_OUTBOX_KEY, keepOrders)
  writeJSON(RECORD_OUTBOX_KEY, [])
  setStatus({})
}

/**
 * Publishes a new epoch. Needs the network: a reset that only one device knew
 * about would leave the others showing the old data.
 */
export async function startFresh(actor: string): Promise<{ ok: boolean; message: string }> {
  if (!backend) return { ok: false, message: 'Cloud sync is not configured, so there is nothing to reset across devices.' }
  const epoch: Epoch = { id: `ep-${Math.random().toString(36).slice(2, 10)}`, at: stamp(), by: actor }
  const ok = await backend.putKv([
    { key: `${DOC_PREFIX}${EPOCH_DOC}`, value: { data: epoch, at: epoch.at, by: getDeviceId() } satisfies DocEnvelope, updatedAt: epoch.at },
  ])
  if (!ok) return { ok: false, message: 'Could not reach the server. Check the internet connection and try again.' }
  applyEpoch(epoch)
  return { ok: true, message: 'Fresh start published. Every device clears its old orders, shifts, timecards and audit entries as it syncs.' }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

let backend: RemoteBackend | null = null
let started = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeRealtime: (() => void) | null = null
let subscribedOrderIds: string[] = []
let useTimers = true
let tick = 0
let flushing: Promise<boolean> | null = null

function scheduleFlush(delay = 400) {
  if (!started || !useTimers) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushAll()
  }, delay)
}

async function flushAll(): Promise<boolean> {
  if (!backend) return false
  if (flushing) return flushing
  flushing = (async () => {
    const results = await Promise.all([flushOrders(), flushDocs(), flushStock(), flushRecords()])
    return results.every(Boolean)
  })()
  try {
    const ok = await flushing
    setStatus(ok ? {} : { state: 'offline', lastError: 'Could not reach the server — changes are saved on this device and will upload automatically.' })
    return ok
  } finally {
    flushing = null
  }
}

/** Push everything pending, then pull. Resolves true when the server answered every call. */
export async function syncNow(opts: { fullOrders?: boolean } = {}): Promise<boolean> {
  if (!backend) return false
  const pushed = await flushAll()
  const staff = isStaffDevice()
  tick += 1
  const pulls = await Promise.all([
    pullDocs(),
    opts.fullOrders || tick % 2 === 1 ? pullStock() : Promise.resolve(true),
    pullOrders(Boolean(opts.fullOrders)),
    staff && (opts.fullOrders || tick % 3 === 1) ? pullRecords() : Promise.resolve(true),
  ])
  // Seeding may have queued new work.
  const seeded = countPending() > 0 ? await flushAll() : true
  const ok = pushed && pulls.every(Boolean) && seeded
  setStatus(
    ok
      ? { state: 'synced', lastSyncAt: new Date().toISOString(), lastError: undefined }
      : { state: 'offline', lastError: 'Could not reach the server — changes are saved on this device and will upload automatically.' },
  )
  return ok
}

function resubscribe() {
  if (!backend) return
  unsubscribeRealtime?.()
  const staff = isStaffDevice()
  subscribedOrderIds = staff ? [] : orderSpec?.customerIds() || []
  unsubscribeRealtime = backend.subscribe(
    {
      // Realtime cannot filter by key prefix, so a subscriber receives every
      // row — audit entries and timecards included. Only staff devices
      // subscribe; customer browsers pick up menu/settings changes by polling.
      kv: staff
        ? (row) => {
            if (row.key.startsWith(RECORD_PREFIX)) applyRecordRow(row)
            else applyDocRow(row)
          }
        : undefined,
      stock: (row) => applyStockRows([row]),
      order: (o) => applyRemoteOrders([o]),
    },
    staff ? 'all' : subscribedOrderIds.length ? subscribedOrderIds : null,
  )
}

export interface StartOptions {
  backend: RemoteBackend | null
  /** Tests drive syncNow() by hand. */
  timers?: boolean
}

let startedWithoutBackend = false

export async function startCloudSync(opts: StartOptions): Promise<void> {
  stopCloudSync()
  backend = opts.backend
  useTimers = opts.timers !== false
  startedWithoutBackend = !backend
  if (!backend) {
    setStatus({ state: 'off' })
    return
  }
  started = true
  setStatus({ state: 'connecting' })
  resubscribe()
  if (useTimers && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    pollTimer = setInterval(() => {
      // A background customer tab has nothing to show; staff screens keep polling
      // as the backstop for realtime (a kitchen tablet may sit behind another app).
      if (!isStaffDevice() && typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void syncNow()
    }, POLL_MS)
    window.addEventListener('online', onOnline)
    document.addEventListener?.('visibilitychange', onVisible)
  }
  await syncNow({ fullOrders: true })
}

export function stopCloudSync() {
  started = false
  if (flushTimer) clearTimeout(flushTimer)
  if (pollTimer) clearInterval(pollTimer)
  flushTimer = null
  pollTimer = null
  unsubscribeRealtime?.()
  unsubscribeRealtime = null
  if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('online', onOnline)
    document.removeEventListener?.('visibilitychange', onVisible)
  }
}

function onOnline() {
  void syncNow()
}

function onVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') void syncNow()
}

/**
 * True once a backend is running — or, before start-up finishes, whenever
 * Supabase is configured for this build. Answering "no" during the first
 * second would let a fresh browser accept the published starter PINs.
 */
export function isCloudSyncConfigured(): boolean {
  if (backend !== null) return true
  return !startedWithoutBackend && isSupabaseConfigured
}
