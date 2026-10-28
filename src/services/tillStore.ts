/**
 * TILL & CASH DRAWER SHIFT MANAGEMENT STORE
 * ------------------------------------------
 * Handles:
 * 1. Register shift lifecycles: Opening Float & Closing Z-Report.
 * 2. Real-time cash tracking (Cash In, Cash Out, No-Sale drawer pops).
 * 3. Cash counting denomination calculator & discrepancy reconciliation.
 * 4. Till settings (Auto-print, Drawer kick on cash, Looping siren alerts).
 * 5. Cross-tab synchronization via BroadcastChannel & LocalStorage persistence.
 */

import { kickCashDrawer, setTouchSoundsEnabled } from './printerBridge'
import { setAlertSoundsEnabled } from './alertSoundBus'
import { logAuditEvent } from './auditStore'
import { markRecordChanged, registerEpochHandler, registerRecords } from './cloudSync'
import type { EndOfDayReport } from './endOfDayReport'

export interface CashDenominations {
  note50: number // £50
  note20: number // £20
  note10: number // £10
  note5: number // £5
  coin2: number // £2
  coin1: number // £1
  coin50p: number // 50p
  coin20p: number // 20p
  coin10p: number // 10p
  coin5p: number // 5p
  coin2p: number // 2p
  coin1p: number // 1p
}

export const EMPTY_DENOMINATIONS: CashDenominations = {
  note50: 0,
  note20: 0,
  note10: 0,
  note5: 0,
  coin2: 0,
  coin1: 0,
  coin50p: 0,
  coin20p: 0,
  coin10p: 0,
  coin5p: 0,
  coin2p: 0,
  coin1p: 0,
}

/**
 * What a pay-in / pay-out was for, so the end-of-day report can show them on
 * separate lines like EPOS: float top-ups and bank drops, petty cash spent on
 * supplies, and tips paid out to staff. Older movements have no kind:
 * a pay-in counts as float, a pay-out as petty cash.
 */
export type CashMovementKind = 'float' | 'petty' | 'tip_out'

export interface CashMovement {
  id: string
  timestamp: string
  type: 'open_shift' | 'sale_cash' | 'pay_in' | 'pay_out' | 'no_sale_pop' | 'close_shift' | 'refund_cash' | 'refund_card'
  amount: number // in pence (0 for no-sale)
  reason: string
  staffName: string
  orderId?: string
  kind?: CashMovementKind
}

export const movementKind = (m: Pick<CashMovement, 'type' | 'kind'>): CashMovementKind =>
  m.kind || (m.type === 'pay_in' ? 'float' : 'petty')

/** One sale taken on this till during the shift — the end-of-day report is built from these. */
export interface TillSaleRecord {
  /** Order id (orderStore `Order.id`). */
  orderId: string
  shortId: string
  at: string
  /** Cashier who took the money. */
  staff: string
  /** Everything taken, including any tip (pence). */
  total: number
  tip: number
  discount: number
  cash: number
  card: number
  /** Payment link / online portion of a split tender. */
  other: number
}

/** An item or ticket removed after it was rung up — shown under "Voids" on the report. */
export interface TillVoidRecord {
  id: string
  at: string
  kind: 'line' | 'ticket' | 'check'
  /** Cashier at the till. */
  staff: string
  /** Manager whose PIN approved it. */
  approvedBy: string
  item: string
  qty: number
  /** Value removed (pence). */
  value: number
  reason: string
  orderShortId?: string
}

export interface TillShift {
  id: string
  shiftNumber: number
  status: 'open' | 'closed'
  openedAt: string
  openedBy: string
  startingFloat: number // pence, e.g. 10000 = £100.00
  closedAt?: string
  closedBy?: string
  expectedCash: number // in pence
  countedCash?: number // in pence
  discrepancy?: number // in pence (counted - expected)
  cashSalesTotal: number // pence
  cardSalesTotal: number // pence
  onlineOrdersTotal: number // pence
  totalDiscountGiven: number // pence
  /** Money handed back during the shift (cash refunds also reduce expectedCash). */
  refundsTotal: number // pence
  inStoreOrdersCount: number
  onlineOrdersCount: number
  /** Web orders already counted, so an order seen twice (placed here, then synced back) counts once. */
  onlineOrderIds?: string[]
  movements: CashMovement[]
  closingDenominations?: CashDenominations
  notes?: string
  /** Last change — the admin console keeps the newest copy of each shift. */
  updatedAt?: string
  /** Till this shift ran on (Till settings → till name). */
  tillName?: string
  /** Every sale taken on this till during the shift. */
  sales?: TillSaleRecord[]
  voids?: TillVoidRecord[]
  /** Tips included in the takings (pence). */
  tipsTotal?: number
  /** Payment-link / online portions of split tenders taken at the till (pence). */
  otherTenderTotal?: number
  /** Card machine end-of-day total entered at close (pence). */
  countedCard?: number
  /** Payment-link total confirmed at close (pence). */
  countedOther?: number
  /** The printed end-of-day report, frozen when the till was closed. */
  report?: EndOfDayReport
}

export interface TillSettings {
  autoPrintOnline: boolean
  autoPrintTillReceipt: boolean
  kickDrawerOnCash: boolean
  soundAlerts: boolean
  defaultFloatPence: number
  blindShiftClose: boolean
  touchSounds: boolean
  /** Ask for a gratuity before a card payment (off by default — UK takeaway). */
  tipPrompt: boolean
  /** Lock the till after this many idle minutes (0 = never). The shift and open ticket are kept. */
  autoLockMinutes: number
  /** Lock the till after every completed sale, so each cashier signs their own sales. */
  lockAfterSale: boolean
  /** Name of this till on screen, receipts and the end-of-day report. */
  tillName: string
}

const STORAGE_ACTIVE_SHIFT = 'just_spuds_till_active_shift_v1'
const STORAGE_PAST_SHIFTS = 'just_spuds_till_past_shifts_v1'
const STORAGE_TILL_SETTINGS = 'just_spuds_till_settings_v1'
const STORAGE_LAST_TILL_ORDER = 'just_spuds_till_last_order_v1'
/** Persistent active cart/ticket so even if tab closes, till reopens right where sale was */
const STORAGE_ACTIVE_TILL_TICKET = 'just_spuds_till_active_ticket_v1'
/** Shifts run on other devices (the till), kept for reporting only — never rung up on here. */
const STORAGE_REMOTE_SHIFTS = 'just_spuds_till_remote_shifts_v1'

export interface PersistentTillTicket {
  cartLines: any[]
  customerName: string
  buzzerNumber: string
  tableNumber: string
  orderType: 'takeaway' | 'eat_in' | 'phone'
  discountPercent: number
  discountFixedPence: number
  discountReason: string
  tipPence: number
  selectedLineId?: string | null
  updatedAt: string
}

export function getActiveTillTicket(): PersistentTillTicket | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_TILL_TICKET)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveActiveTillTicket(ticket: PersistentTillTicket | null): void {
  if (typeof window === 'undefined') return
  try {
    if (ticket && ticket.cartLines && ticket.cartLines.length > 0) {
      localStorage.setItem(STORAGE_ACTIVE_TILL_TICKET, JSON.stringify(ticket))
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_TILL_TICKET)
    }
  } catch {}
}

export function clearActiveTillTicket(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_ACTIVE_TILL_TICKET)
  } catch {}
}

export function getLastCompletedTillOrder(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_LAST_TILL_ORDER)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setLastCompletedTillOrder(order: any): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_LAST_TILL_ORDER, JSON.stringify(order))
  } catch {}
}

const DEFAULT_SETTINGS: TillSettings = {
  autoPrintOnline: true,
  autoPrintTillReceipt: true,
  kickDrawerOnCash: true,
  soundAlerts: true,
  defaultFloatPence: 10000, // £100.00
  blindShiftClose: false,
  touchSounds: true,
  tipPrompt: false,
  autoLockMinutes: 5,
  lockAfterSale: false,
  tillName: 'Till 1',
}

let activeShift: TillShift | null = null
let pastShifts: TillShift[] = []
let tillSettings: TillSettings = DEFAULT_SETTINGS

const shiftListeners = new Set<(shift: TillShift | null) => void>()
const settingsListeners = new Set<(settings: TillSettings) => void>()

let channel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel('just_spuds_till_bus')
  channel.onmessage = (event) => {
    if (event.data?.type === 'SHIFT_UPDATED') {
      reloadFromStorage()
      notifyShift()
    } else if (event.data?.type === 'SETTINGS_UPDATED') {
      reloadFromStorage()
      notifySettings()
    }
  }
}

function reloadFromStorage() {
  if (typeof window === 'undefined') return
  try {
    const rawShift = localStorage.getItem(STORAGE_ACTIVE_SHIFT)
    activeShift = rawShift ? JSON.parse(rawShift) : null

    const rawPast = localStorage.getItem(STORAGE_PAST_SHIFTS)
    pastShifts = rawPast ? JSON.parse(rawPast) : []

    const rawSettings = localStorage.getItem(STORAGE_TILL_SETTINGS)
    tillSettings = rawSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) } : DEFAULT_SETTINGS
  } catch (err) {
    console.error('Failed reading till store from localStorage:', err)
  }
  applySoundSettings()
}

/** The sound modules can't import this store (it imports them), so push the flags down. */
function applySoundSettings() {
  setTouchSoundsEnabled(tillSettings.touchSounds)
  setAlertSoundsEnabled(tillSettings.soundAlerts)
}

function saveActiveShift() {
  if (typeof window === 'undefined') return
  if (activeShift) {
    activeShift.updatedAt = new Date().toISOString()
    localStorage.setItem(STORAGE_ACTIVE_SHIFT, JSON.stringify(activeShift))
    markRecordChanged('shifts', activeShift.id)
  } else {
    localStorage.removeItem(STORAGE_ACTIVE_SHIFT)
  }
  channel?.postMessage({ type: 'SHIFT_UPDATED' })
  notifyShift()
}

function savePastShifts() {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_PAST_SHIFTS, JSON.stringify(pastShifts))
  if (pastShifts[0]) markRecordChanged('shifts', pastShifts[0].id)
}

function readRemoteShifts(): TillShift[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_REMOTE_SHIFTS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Shifts open right now on other devices (live X-read for the admin console). */
export function getRemoteOpenShifts(): TillShift[] {
  return readRemoteShifts().filter((s) => s.status === 'open')
}

function notifyShift() {
  shiftListeners.forEach((l) => l(activeShift ? { ...activeShift } : null))
}

function notifySettings() {
  settingsListeners.forEach((l) => l({ ...tillSettings }))
}

// Initial load
reloadFromStorage()

export function getCurrentShift(): TillShift | null {
  return activeShift ? { ...activeShift } : null
}

/** Closed shifts from this device and every other till, newest first. */
export function getPastZReports(): TillShift[] {
  const byId = new Map<string, TillShift>()
  readRemoteShifts()
    .filter((s) => s.status === 'closed')
    .forEach((s) => byId.set(s.id, s))
  pastShifts.forEach((s) => byId.set(s.id, s))
  return [...byId.values()].sort((a, b) => (b.closedAt || b.openedAt).localeCompare(a.closedAt || a.openedAt))
}

export function getTillSettings(): TillSettings {
  return { ...tillSettings }
}

export function updateTillSettings(patch: Partial<TillSettings>, actor = 'Manager'): TillSettings {
  const changed = (Object.keys(patch) as (keyof TillSettings)[]).filter((k) => tillSettings[k] !== patch[k])
  tillSettings = { ...tillSettings, ...patch }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_TILL_SETTINGS, JSON.stringify(tillSettings))
  }
  applySoundSettings()
  channel?.postMessage({ type: 'SETTINGS_UPDATED' })
  notifySettings()
  if (changed.length > 0) {
    logAuditEvent(actor, 'till.settings_updated', 'Till Settings', changed.map((k) => `${k}=${String(tillSettings[k])}`).join(', '))
  }
  return tillSettings
}

export function subscribeShift(listener: (shift: TillShift | null) => void): () => void {
  shiftListeners.add(listener)
  listener(activeShift ? { ...activeShift } : null)
  return () => shiftListeners.delete(listener)
}

export function subscribeTillSettings(listener: (settings: TillSettings) => void): () => void {
  settingsListeners.add(listener)
  listener({ ...tillSettings })
  return () => settingsListeners.delete(listener)
}


/**
 * Calculate the total value in pence of counted denominations
 */
export function calculateDenominationsTotal(d: CashDenominations): number {
  return (
    d.note50 * 5000 +
    d.note20 * 2000 +
    d.note10 * 1000 +
    d.note5 * 500 +
    d.coin2 * 200 +
    d.coin1 * 100 +
    d.coin50p * 50 +
    d.coin20p * 20 +
    d.coin10p * 10 +
    d.coin5p * 5 +
    d.coin2p * 2 +
    d.coin1p * 1
  )
}

/**
 * Open Register Shift with starting float
 */
export function openTillShift(openedBy: string, startingFloatPence: number): TillShift {
  const shiftNumber = pastShifts.length + 1
  const newShift: TillShift = {
    id: `shift-${Date.now()}`,
    shiftNumber,
    status: 'open',
    openedAt: new Date().toISOString(),
    openedBy,
    startingFloat: startingFloatPence,
    expectedCash: startingFloatPence,
    cashSalesTotal: 0,
    cardSalesTotal: 0,
    onlineOrdersTotal: 0,
    totalDiscountGiven: 0,
    refundsTotal: 0,
    inStoreOrdersCount: 0,
    onlineOrdersCount: 0,
    tillName: tillSettings.tillName || DEFAULT_SETTINGS.tillName,
    sales: [],
    voids: [],
    tipsTotal: 0,
    otherTenderTotal: 0,
    movements: [
      {
        id: `mov-${Date.now()}-open`,
        timestamp: new Date().toISOString(),
        type: 'open_shift',
        amount: startingFloatPence,
        reason: 'Shift Open Float',
        staffName: openedBy,
      },
    ],
  }

  activeShift = newShift
  saveActiveShift()

  logAuditEvent(
    openedBy,
    'till.shift_opened',
    `Till Shift #${shiftNumber}`,
    `Starting float £${(startingFloatPence / 100).toFixed(2)}`
  )

  // Open the drawer so staff can place the cash float inside
  kickCashDrawer()

  return { ...newShift }
}

/**
 * Record a transaction processed at the Till
 */
export function recordTillSale(params: {
  paymentMethod: 'cash' | 'card' | 'in_store' | 'split'
  totalPence: number
  discountPence?: number
  /** Short order number (shown on the report and in the drawer log). */
  orderId: string
  /** Full order id — lets the end-of-day report list what was sold. */
  orderUuid?: string
  staffName: string
  splitCashPence?: number
  splitCardPence?: number
  splitOnlinePence?: number
  /** Tip included in totalPence. */
  tipPence?: number
}) {
  if (!activeShift || activeShift.status !== 'open') return

  let cash = 0
  let card = 0
  let other = 0
  if (params.paymentMethod === 'split') {
    cash = params.splitCashPence || 0
    card = params.splitCardPence || 0
    other = params.splitOnlinePence || 0
  } else if (params.paymentMethod === 'cash' || params.paymentMethod === 'in_store') {
    cash = params.totalPence
  } else {
    card = params.totalPence
  }

  if (cash > 0) {
    activeShift.cashSalesTotal += cash
    activeShift.expectedCash += cash
    activeShift.movements.push({
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'sale_cash',
      amount: cash,
      reason: params.paymentMethod === 'split' ? `Split Tender (Cash Portion) Order #${params.orderId}` : `Cash Sale Order #${params.orderId}`,
      staffName: params.staffName,
      orderId: params.orderId,
    })
    if (tillSettings.kickDrawerOnCash) kickCashDrawer()
  }
  if (card > 0) activeShift.cardSalesTotal += card
  // A payment link taken at the till is not a website order — keep it apart.
  if (other > 0) activeShift.otherTenderTotal = (activeShift.otherTenderTotal || 0) + other

  if (params.discountPence) {
    activeShift.totalDiscountGiven += params.discountPence
  }
  const tip = Math.max(0, params.tipPence || 0)
  if (tip > 0) activeShift.tipsTotal = (activeShift.tipsTotal || 0) + tip

  activeShift.sales = [
    ...(activeShift.sales || []),
    {
      orderId: params.orderUuid || params.orderId,
      shortId: params.orderId,
      at: new Date().toISOString(),
      staff: params.staffName,
      total: cash + card + other,
      tip,
      discount: params.discountPence || 0,
      cash,
      card,
      other,
    },
  ]

  activeShift.inStoreOrdersCount += 1
  saveActiveShift()
}

/**
 * Something rung up and then taken off — a line, a whole ticket, or an open
 * check that went to the kitchen. Recorded for the "Voids" section of the
 * end-of-day report (EPOS shows the same).
 */
export function recordTillVoid(params: Omit<TillVoidRecord, 'id' | 'at'>) {
  if (!activeShift || activeShift.status !== 'open') return
  activeShift.voids = [
    ...(activeShift.voids || []),
    { ...params, id: `void-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() },
  ]
  saveActiveShift()
}

/**
 * Record a refund given during the shift. Cash comes out of the drawer, so the
 * expected cash drops; card refunds only show on the report.
 */
export function recordTillRefund(params: { orderId: string; amountPence: number; method: string; staffName: string; reason: string }) {
  if (!activeShift || activeShift.status !== 'open') return
  const amount = Math.max(0, Math.round(params.amountPence))
  if (amount === 0) return
  const isCash = params.method === 'cash' || params.method === 'in_store'
  activeShift.refundsTotal = (activeShift.refundsTotal || 0) + amount
  if (isCash) {
    activeShift.expectedCash -= amount
    if (tillSettings.kickDrawerOnCash) kickCashDrawer()
  }
  activeShift.movements.push({
    id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type: isCash ? 'refund_cash' : 'refund_card',
    amount,
    reason: `Refund Order #${params.orderId}: ${params.reason}`,
    staffName: params.staffName,
    orderId: params.orderId,
  })
  saveActiveShift()
}

/**
 * Record an online order that arrived during the shift
 */
export function recordOnlineOrderInShift(orderId: string, totalPence: number) {
  if (!activeShift || activeShift.status !== 'open') return
  const seen = activeShift.onlineOrderIds || []
  if (seen.includes(orderId)) return
  activeShift.onlineOrderIds = [...seen, orderId]
  activeShift.onlineOrdersTotal += totalPence
  activeShift.onlineOrdersCount += 1
  saveActiveShift()
}

/**
 * Cash Drawer "No Sale / Pop Till" Action
 * Opens the cash drawer with staff name and mandatory audit reason
 */
export function performNoSaleDrawerKick(staffName: string, reason: string = 'Making change') {
  kickCashDrawer()

  if (activeShift && activeShift.status === 'open') {
    activeShift.movements.push({
      id: `mov-${Date.now()}-nosale`,
      timestamp: new Date().toISOString(),
      type: 'no_sale_pop',
      amount: 0,
      reason: reason.trim() || 'No Sale (Making Change)',
      staffName,
    })
    saveActiveShift()
  }

  logAuditEvent(
    staffName,
    'till.no_sale_pop',
    'Cash Drawer',
    `Reason: ${reason}`
  )
}

/**
 * Pay In / Pay Out (e.g. Petty Cash, Milk/Supplies, Bank Drop)
 */
export function recordCashFloatAdjustment(
  type: 'pay_in' | 'pay_out',
  amountPence: number,
  reason: string,
  staffName: string,
  kind?: CashMovementKind,
) {
  if (!activeShift || activeShift.status !== 'open') return
  const amount = Math.max(0, Math.round(amountPence))
  if (amount === 0) return
  // Only a float adjustment can put money in; petty cash and tip-outs always come out.
  const resolvedKind: CashMovementKind = kind || (type === 'pay_in' ? 'float' : 'petty')
  const resolvedType = resolvedKind === 'float' ? type : 'pay_out'

  const delta = resolvedType === 'pay_in' ? amount : -amount
  activeShift.expectedCash += delta

  activeShift.movements.push({
    id: `mov-${Date.now()}-${resolvedType}`,
    timestamp: new Date().toISOString(),
    type: resolvedType,
    amount,
    reason,
    staffName,
    kind: resolvedKind,
  })

  saveActiveShift()
  kickCashDrawer()

  logAuditEvent(
    staffName,
    resolvedKind === 'tip_out' ? 'till.tip_out' : resolvedKind === 'petty' ? 'till.petty_cash' : resolvedType === 'pay_in' ? 'till.pay_in' : 'till.pay_out',
    'Cash Drawer',
    `Amount £${(amount / 100).toFixed(2)}. Reason: ${reason}`
  )
}

/**
 * Close Shift and generate End of Day Z-Report
 */
export function closeTillShift(
  closedBy: string,
  countedDenominations: CashDenominations,
  notes?: string,
  extra: {
    /** Card machine end-of-day total, if the cashier entered it. */
    countedCard?: number
    countedOther?: number
    /** Builds the printed end-of-day report from the closed shift (it needs the orders, which this store cannot import). */
    buildReport?: (closed: TillShift) => EndOfDayReport
  } = {},
): { closedShift: TillShift; discrepancy: number } {
  if (!activeShift || activeShift.status !== 'open') {
    throw new Error('No active shift to close.')
  }

  const countedCash = calculateDenominationsTotal(countedDenominations)
  const discrepancy = countedCash - activeShift.expectedCash

  const closedShift: TillShift = {
    ...activeShift,
    status: 'closed',
    closedAt: new Date().toISOString(),
    closedBy,
    countedCash,
    discrepancy,
    countedCard: typeof extra.countedCard === 'number' ? Math.max(0, Math.round(extra.countedCard)) : undefined,
    countedOther: typeof extra.countedOther === 'number' ? Math.max(0, Math.round(extra.countedOther)) : undefined,
    closingDenominations: countedDenominations,
    notes: notes?.trim() || undefined,
    movements: [
      ...activeShift.movements,
      {
        id: `mov-${Date.now()}-close`,
        timestamp: new Date().toISOString(),
        type: 'close_shift',
        amount: countedCash,
        reason: `Shift Closed. Expected £${(activeShift.expectedCash / 100).toFixed(2)}, Counted £${(countedCash / 100).toFixed(2)}`,
        staffName: closedBy,
      },
    ],
  }

  if (extra.buildReport) {
    try {
      closedShift.report = extra.buildReport(closedShift)
    } catch (err) {
      // A report failure must never stop the drawer from closing; the admin can rebuild it.
      console.error('End-of-day report failed to build:', err)
    }
  }

  // Save to past shifts
  closedShift.updatedAt = new Date().toISOString()
  pastShifts = [closedShift, ...pastShifts]
  savePastShifts()

  // Reset active shift
  activeShift = null
  saveActiveShift()

  // Pop drawer for final cash removal
  kickCashDrawer()

  logAuditEvent(
    closedBy,
    'till.shift_closed',
    `Till Shift #${closedShift.shiftNumber}`,
    `Cash Counted: £${(countedCash / 100).toFixed(2)}, Variance: £${(discrepancy / 100).toFixed(2)}`
  )

  return { closedShift, discrepancy }
}

if (typeof window !== 'undefined') {
  registerRecords({
    collection: 'shifts',
    limit: 120,
    get: (id) => (activeShift?.id === id ? activeShift : pastShifts.find((s) => s.id === id)),
    apply: (items) => {
      const ownIds = new Set([...(activeShift ? [activeShift.id] : []), ...pastShifts.map((s) => s.id)])
      const remote = new Map(readRemoteShifts().map((s) => [s.id, s]))
      let changed = false
      ;(items as TillShift[]).forEach((s) => {
        if (!s || !s.id || ownIds.has(s.id)) return
        const prev = remote.get(s.id)
        if (!prev || (s.updatedAt || '') >= (prev.updatedAt || '')) {
          remote.set(s.id, s)
          changed = true
        }
      })
      if (!changed) return
      localStorage.setItem(STORAGE_REMOTE_SHIFTS, JSON.stringify([...remote.values()].slice(-200)))
      channel?.postMessage({ type: 'SHIFT_UPDATED' })
      notifyShift()
    },
  })

  // "Start trading fresh": pre-launch shifts disappear from every device.
  registerEpochHandler((at) => {
    pastShifts = pastShifts.filter((s) => s.openedAt >= at)
    localStorage.setItem(STORAGE_PAST_SHIFTS, JSON.stringify(pastShifts))
    localStorage.setItem(STORAGE_REMOTE_SHIFTS, JSON.stringify(readRemoteShifts().filter((s) => s.openedAt >= at)))
    if (activeShift && activeShift.openedAt < at) {
      activeShift = null
      localStorage.removeItem(STORAGE_ACTIVE_SHIFT)
    }
    channel?.postMessage({ type: 'SHIFT_UPDATED' })
    notifyShift()
  })
}
