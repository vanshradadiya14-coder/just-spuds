/**
 * SERVER-CHECKED STAFF SIGN-IN
 * ----------------------------
 * Thin client for the database functions in
 * supabase/migrations/20261028_staff_security.sql. The server holds the PINs
 * (keyed hashes in a schema the public key can't read), pairs devices, counts
 * wrong PINs per device and hands out sessions; this module only calls it.
 *
 * Offline: a till must keep trading when the internet drops. After someone
 * signs in on a paired device, a slow salted hash (PBKDF2, 150k rounds) of
 * their PIN is kept on that device for 7 days, so they can sign in there
 * while the server is unreachable. Nobody else's PIN is ever on the device.
 */
import type { Role } from './authStore'
import { callServer } from './cloudSync'
import { clearDevicePairing, getDeviceToken, setDevicePairing, type PairedDevice } from './serverAuthState'
import type { RpcResult } from './sync/backend'

export interface ServerPerson {
  id: string
  kind: 'staff' | 'driver'
  name: string
  role: Role
  active: boolean
  email: string
  hasPin: boolean
  mustChange: boolean
  pinSetAt: string | null
}

export type ServerFailure = {
  ok: false
  /** invalid | locked | blocked | device | must_change | forbidden | session | network | missing | … */
  error: string
  message: string
  retryAfter?: number
}

export type PinCheckResult =
  | { ok: true; person: ServerPerson; mustChange: boolean; session: { token: string; expiresAt: string } | null }
  | ServerFailure

const NETWORK_MESSAGE = "Can't reach the shop server. Check the internet connection and try again."

function failure(res: Extract<RpcResult, { ok: false }>): ServerFailure {
  if (res.kind === 'network') return { ok: false, error: 'network', message: NETWORK_MESSAGE }
  if (res.kind === 'missing') return { ok: false, error: 'missing', message: 'The shop server has not been set up for server sign-in yet.' }
  return { ok: false, error: res.kind, message: 'The shop server refused the request. Try again in a moment.' }
}

/** Call a sign-in function that answers `{ ok, … }` JSON. */
async function call<T extends object>(fn: string, args: Record<string, unknown>): Promise<({ ok: true } & T) | ServerFailure> {
  const res = await callServer(fn, args)
  if (!res.ok) return failure(res)
  const data = res.data as ({ ok?: boolean; error?: string; message?: string; retryAfter?: number } & T) | null
  if (!data || typeof data !== 'object') return { ok: false, error: 'error', message: 'Unexpected answer from the shop server.' }
  if (data.ok) return data as { ok: true } & T
  if (data.error === 'device') clearDevicePairing()
  return { ok: false, error: data.error || 'error', message: data.message || 'Not allowed.', retryAfter: data.retryAfter }
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export async function pairThisDevice(code: string, deviceId: string, name: string): Promise<{ ok: true; device: PairedDevice } | ServerFailure> {
  const res = await call<{ token: string; device: { id: string; name: string }; pairedBy?: string }>('jsp_pair_device', {
    p_code: code,
    p_device_id: deviceId,
    p_name: name,
  })
  if (!res.ok) return res
  const device: PairedDevice = { id: res.device.id, name: res.device.name, pairedAt: new Date().toISOString(), pairedBy: res.pairedBy }
  setDevicePairing(res.token, device)
  return { ok: true, device }
}

// ---------------------------------------------------------------------------
// PINs and sessions
// ---------------------------------------------------------------------------

/** Sign in (openSession) or just identify someone (manager approval, time clock). */
export async function serverCheckPin(pin: string, openSession: boolean): Promise<PinCheckResult> {
  const token = getDeviceToken()
  if (!token) return { ok: false, error: 'device', message: "This device isn't paired with the shop yet. Ask a manager for a pairing code." }
  return call<{ person: ServerPerson; mustChange: boolean; session: { token: string; expiresAt: string } | null }>('jsp_check_pin', {
    p_device: token,
    p_pin: pin.trim(),
    p_open_session: openSession,
  })
}

export function serverSession(sessionToken: string) {
  return call<{ person: ServerPerson; mustChange: boolean }>('jsp_session', { p_session: sessionToken })
}

export function serverSignOut(sessionToken: string) {
  return call<object>('jsp_sign_out', { p_session: sessionToken })
}

export function serverChangeMyPin(sessionToken: string, newPin: string) {
  return call<{ message: string }>('jsp_change_my_pin', { p_session: sessionToken, p_new_pin: newPin.trim() })
}

// ---------------------------------------------------------------------------
// Owner / manager tools
// ---------------------------------------------------------------------------

export interface ServerDevice {
  id: string
  name: string
  pairedAt: string
  pairedBy: string | null
  lastSeenAt: string | null
  revoked: boolean
  blocked: boolean
  locked: boolean
  failStreak: number
}

export interface ServerEvent {
  at: string
  kind: string
  ok: boolean
  person: string | null
  device: string | null
  ip: string | null
  detail: string | null
}

export const adminPeople = (session: string) => call<{ people: ServerPerson[] }>('jsp_admin_people', { p_session: session })

export const adminSavePerson = (
  session: string,
  person: { id?: string; kind: 'staff' | 'driver'; name?: string; role?: Role; active?: boolean; email?: string },
) => call<{ id: string; message: string }>('jsp_admin_save_person', { p_session: session, p_person: person })

export const adminSetPin = (session: string, personId: string, pin: string) =>
  call<{ message: string }>('jsp_admin_set_pin', { p_session: session, p_person_id: personId, p_pin: pin.trim() })

export const adminPairingCode = (session: string) => call<{ code: string; expiresAt: string }>('jsp_admin_pairing_code', { p_session: session })

export const adminDevices = (session: string) => call<{ devices: ServerDevice[] }>('jsp_admin_devices', { p_session: session })

export const adminDevice = (session: string, deviceId: string, action: 'revoke' | 'unblock' | 'rename', name?: string) =>
  call<{ message: string }>('jsp_admin_device', { p_session: session, p_device_id: deviceId, p_action: action, p_name: name ?? null })

export const adminEvents = (session: string, limit = 50) => call<{ events: ServerEvent[] }>('jsp_admin_events', { p_session: session, p_limit: limit })

// ---------------------------------------------------------------------------
// Offline sign-in on a paired device
// ---------------------------------------------------------------------------

const OFFLINE_KEY = 'just_spuds_offline_pins_v1'
const OFFLINE_DAYS = 7
const PBKDF2_ROUNDS = 150_000

interface OfflineEntry {
  id: string
  name: string
  role: Role
  kind: 'staff' | 'driver'
  hash: string
  pinSetAt: string | null
  savedAt: string
}

interface OfflineStore {
  salt: string
  entries: OfflineEntry[]
}

function readOffline(): OfflineStore | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(OFFLINE_KEY)
    return raw ? (JSON.parse(raw) as OfflineStore) : null
  } catch {
    return null
  }
}

function writeOffline(store: OfflineStore | null) {
  if (typeof localStorage === 'undefined') return
  try {
    if (store) localStorage.setItem(OFFLINE_KEY, JSON.stringify(store))
    else localStorage.removeItem(OFFLINE_KEY)
  } catch {
    // no offline sign-in then
  }
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

async function slowHash(pin: string, salt: string): Promise<string | null> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (!subtle) return null
  try {
    const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ROUNDS }, key, 256)
    return toHex(bits)
  } catch {
    return null
  }
}

function newSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes.buffer)
}

const pendingSaves = new Set<Promise<void>>()

/** Resolves once every offline copy started so far is written (tests, and before going offline on purpose). */
export async function whenOfflinePinsSaved(): Promise<void> {
  await Promise.all([...pendingSaves])
}

/** After a successful server sign-in: let this person sign in here while offline. */
export function rememberOfflinePin(person: ServerPerson, pin: string): Promise<void> {
  const job = saveOfflinePin(person, pin).finally(() => pendingSaves.delete(job))
  pendingSaves.add(job)
  return job
}

async function saveOfflinePin(person: ServerPerson, pin: string): Promise<void> {
  if (!getDeviceToken() || person.mustChange) return
  // The salt is fixed before any await, so two sign-ins in quick succession hash
  // with the same salt; the entry is merged into a fresh read when it's done.
  let salt = readOffline()?.salt
  if (!salt) {
    salt = newSalt()
    writeOffline({ salt, entries: [] })
  }
  const hash = await slowHash(pin.trim(), salt)
  if (!hash) return
  const store = readOffline()
  if (!store || store.salt !== salt) return
  const entry: OfflineEntry = {
    id: person.id,
    name: person.name,
    role: person.role,
    kind: person.kind,
    hash,
    pinSetAt: person.pinSetAt,
    savedAt: new Date().toISOString(),
  }
  // One entry per person, and no stale copy of a PIN someone else now has.
  writeOffline({ ...store, entries: [entry, ...store.entries.filter((e) => e.id !== person.id && e.hash !== hash)].slice(0, 40) })
}

export function forgetOfflinePin(personId: string) {
  const store = readOffline()
  if (!store) return
  writeOffline({ ...store, entries: store.entries.filter((e) => e.id !== personId) })
}

export function forgetAllOfflinePins() {
  writeOffline(null)
}

/** Drop offline entries for people who were disabled or whose PIN changed elsewhere. */
export function pruneOfflinePins(keep: (entry: { id: string; pinSetAt: string | null }) => boolean) {
  const store = readOffline()
  if (!store) return
  const entries = store.entries.filter(keep)
  if (entries.length !== store.entries.length) writeOffline({ ...store, entries })
}

export async function matchOfflinePin(pin: string): Promise<Omit<OfflineEntry, 'hash'> | null> {
  if (!getDeviceToken()) return null
  const store = readOffline()
  if (!store || store.entries.length === 0) return null
  const hash = await slowHash(pin.trim(), store.salt)
  if (!hash) return null
  const cutoff = Date.now() - OFFLINE_DAYS * 24 * 60 * 60 * 1000
  const found = store.entries.find((e) => e.hash === hash && Date.parse(e.savedAt) >= cutoff)
  if (!found) return null
  const { hash: _omit, ...rest } = found
  void _omit
  return rest
}
