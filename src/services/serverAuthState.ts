/**
 * SERVER SIGN-IN STATE
 * --------------------
 * Shared by the sync engine and the auth store, and import-free so neither has
 * to depend on the other.
 *
 *  'server'   the shop's database checks PINs and pairs devices
 *             (supabase/migrations/20261028_staff_security.sql has been run).
 *             PINs and PIN hashes never live in this browser.
 *  'legacy'   the database has no sign-in functions yet: PINs are checked
 *             against the synced staff list, as before.
 *  'unknown'  not asked yet (first start, or offline since this browser met the shop).
 *
 * Once a device has seen 'server' it never goes back to 'legacy'.
 *
 * A paired device holds a secret token from the server. Every PIN attempt and
 * every private read or write sends it, so a browser that was never paired by
 * a manager cannot even try a PIN.
 */

export type ServerAuthMode = 'server' | 'legacy' | 'unknown'

export interface PairedDevice {
  id: string
  name: string
  pairedAt: string
  pairedBy?: string
}

const MODE_KEY = 'just_spuds_server_auth_v1'
const TOKEN_KEY = 'just_spuds_device_token_v1'
const DEVICE_KEY = 'just_spuds_device_pairing_v1'

const hasStorage = () => typeof localStorage !== 'undefined'
const listeners = new Set<() => void>()

function read(key: string): string | null {
  if (!hasStorage()) return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  if (!hasStorage()) return
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage full / blocked: the device simply stays unpaired
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

export function getServerAuthMode(): ServerAuthMode {
  const v = read(MODE_KEY)
  return v === 'server' || v === 'legacy' ? v : 'unknown'
}

export function isServerAuth(): boolean {
  return getServerAuthMode() === 'server'
}

export function setServerAuthMode(mode: ServerAuthMode) {
  const current = getServerAuthMode()
  if (current === mode || (current === 'server' && mode !== 'server')) return
  write(MODE_KEY, mode === 'unknown' ? null : mode)
  notify()
}

export function getDeviceToken(): string | null {
  return read(TOKEN_KEY)
}

export function getPairedDevice(): PairedDevice | null {
  if (!getDeviceToken()) return null
  try {
    const raw = read(DEVICE_KEY)
    return raw ? (JSON.parse(raw) as PairedDevice) : null
  } catch {
    return null
  }
}

export function isDevicePaired(): boolean {
  return Boolean(getDeviceToken())
}

export function setDevicePairing(token: string, device: PairedDevice) {
  write(TOKEN_KEY, token)
  write(DEVICE_KEY, JSON.stringify(device))
  notify()
}

export function clearDevicePairing() {
  if (!getDeviceToken() && !read(DEVICE_KEY)) return
  write(TOKEN_KEY, null)
  write(DEVICE_KEY, null)
  notify()
}

export function subscribeServerAuth(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Test hook: forget everything (a fresh browser). */
export function resetServerAuthState() {
  write(MODE_KEY, null)
  write(TOKEN_KEY, null)
  write(DEVICE_KEY, null)
  notify()
}
