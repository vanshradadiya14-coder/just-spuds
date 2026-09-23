/**
 * AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) STORE
 * --------------------------------------------------------
 * Manages user sessions, role-based permissions, PIN verification for Kitchen Staff & Admin,
 * and persistent auth state across tabs.
 */

import { getDocSyncState, isCloudSyncConfigured, markStaffDevice, setAccessProbe } from './cloudSync'
import { matchStaffPin, pinFingerprint, subscribeRoster, getRoster, type StaffMember } from './staffRoster'
import { findDriverByPin, getDrivers, isDriverPinTaken, subscribeDrivers } from './driverStore'

// Firebase is only needed for Google sign-in, so it is loaded on demand rather
// than shipped in the main bundle that every visitor downloads for the homepage.
const loadFirebase = () => import('./firebase')

export type Role =
  | 'CUSTOMER'
  | 'CASHIER'
  | 'KITCHEN_STAFF'
  | 'STAFF'
  | 'SUPERVISOR'
  | 'STORE_MANAGER'
  | 'MANAGER'
  | 'DRIVER'
  | 'ADMIN'
  | 'SUPER_ADMIN'

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED'

export interface AuthUser {
  id: string
  name: string
  email: string
  phone?: string
  photoURL?: string
  role: Role
  status: UserStatus
  storeId?: string
  storeName?: string
  extraPermissions?: string[]
  deniedPermissions?: string[]
  /** Fingerprint of the PIN this session was opened with — a PIN change ends the session. */
  pinFp?: string
}

const AUTH_STORAGE_KEY = 'just_spuds_auth_user_v1'

/**
 * Role groups. Every portal gate should use one of these instead of spelling out
 * role lists inline — when CASHIER / KITCHEN_STAFF / SUPERVISOR were added, the
 * gates that listed 'STAFF' by hand quietly locked the new PINs out of the till.
 */
export const MANAGEMENT_ROLES: Role[] = ['SUPERVISOR', 'STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']
/** Anyone who works the shop floor: till, kitchen, and their managers. */
export const SHOP_FLOOR_ROLES: Role[] = ['STAFF', 'CASHIER', 'KITCHEN_STAFF', ...MANAGEMENT_ROLES]
/** Every non-customer account. */
export const INTERNAL_ROLES: Role[] = [...SHOP_FLOOR_ROLES, 'DRIVER']

export function isManagerOrAdmin(role?: Role): boolean {
  return !!role && MANAGEMENT_ROLES.includes(role)
}

/** Where a freshly signed-in account should land. */
export function homePortalForRole(role?: Role): string | null {
  switch (role) {
    case 'CASHIER':
      return '/pos'
    case 'STAFF':
    case 'KITCHEN_STAFF':
      return '/staff'
    case 'SUPERVISOR':
    case 'STORE_MANAGER':
    case 'MANAGER':
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return '/admin'
    case 'DRIVER':
      return '/driver'
    default:
      return null
  }
}

/**
 * PIN brute-force lockout. Four-digit PINs have 10,000 combinations, so every
 * PIN prompt (sign-in, manager authorisation, time clock) shares one counter:
 * five wrong PINs lock the device for 30 s, doubling each time up to 5 minutes.
 */
const PIN_LOCK_KEY = 'just_spuds_pin_lock_v1'
const PIN_MAX_ATTEMPTS = 5
const PIN_LOCK_BASE_MS = 30_000
const PIN_LOCK_MAX_MS = 5 * 60_000

function readPinLock(): { fails: number; until: number } {
  if (typeof window === 'undefined') return { fails: 0, until: 0 }
  try {
    const raw = localStorage.getItem(PIN_LOCK_KEY)
    return raw ? JSON.parse(raw) : { fails: 0, until: 0 }
  } catch {
    return { fails: 0, until: 0 }
  }
}

function writePinLock(lock: { fails: number; until: number }) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PIN_LOCK_KEY, JSON.stringify(lock))
  } catch {
    // ignore
  }
}

/** Milliseconds until PIN entry is allowed again (0 = not locked). */
export function getPinLockRemainingMs(now = Date.now()): number {
  return Math.max(0, readPinLock().until - now)
}

export function pinLockMessage(remainingMs: number): string {
  const secs = Math.ceil(remainingMs / 1000)
  return `Too many wrong PINs. Try again in ${secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`}.`
}

function recordPinFailure() {
  const lock = readPinLock()
  const fails = lock.fails + 1
  let until = lock.until
  if (fails >= PIN_MAX_ATTEMPTS) {
    const escalation = fails - PIN_MAX_ATTEMPTS
    until = Date.now() + Math.min(PIN_LOCK_MAX_MS, PIN_LOCK_BASE_MS * 2 ** escalation)
  }
  writePinLock({ fails, until })
}

function clearPinFailures() {
  writePinLock({ fails: 0, until: 0 })
}

export function verifyManagerPin(pin: string): { ok: boolean; managerName?: string; role?: Role; message?: string } {
  const res = checkPin(pin)
  if (!res.ok) return { ok: false, message: res.message }
  if (isManagerOrAdmin(res.user.role)) return { ok: true, managerName: res.user.name, role: res.user.role }
  recordPinFailure()
  return { ok: false, message: 'That PIN is not a supervisor or manager PIN.' }
}

type AuthListener = (user: AuthUser | null) => void
const listeners = new Set<AuthListener>()

export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setCurrentUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
      if (INTERNAL_ROLES.includes(user.role)) markStaffDevice()
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
    listeners.forEach((fn) => fn(user))
  } catch {
    // Ignore storage issues
  }
}

export function subscribeAuth(fn: AuthListener): () => void {
  listeners.add(fn)
  fn(getCurrentUser())

  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_STORAGE_KEY) {
      fn(getCurrentUser())
    }
  }

  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', handleStorage)
  }
}

const STORE_FIELDS = { storeId: 'store-aylesbury-1', storeName: 'Market Square Aylesbury' }

function memberToUser(m: StaffMember): AuthUser {
  return {
    id: m.id,
    name: m.name,
    email: m.email || '',
    phone: m.phone,
    role: m.role,
    status: m.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED',
    pinFp: pinFingerprint(m),
    ...STORE_FIELDS,
  }
}

type PinCheck = { ok: true; user: AuthUser } | { ok: false; message: string }

/**
 * The one place a PIN is checked: lockout, staff roster, then drivers.
 * Every wrong PIN counts towards the lockout, whichever screen it was typed on.
 */
export function checkPin(pin: string): PinCheck {
  const remaining = getPinLockRemainingMs()
  if (remaining > 0) return { ok: false, message: pinLockMessage(remaining) }
  const clean = pin.trim()

  const staff = matchStaffPin(clean)
  if (staff && 'blocked' in staff) return { ok: false, message: staff.blocked }
  if (staff && staff.member.status === 'ACTIVE') {
    clearPinFailures()
    return { ok: true, user: memberToUser(staff.member) }
  }

  const driver = findDriverByPin(clean)
  if (driver) {
    // Same rule as staff: a starter PIN only counts once the server confirmed there is no real list.
    const trusted = !driver.defaultPin || !isCloudSyncConfigured() || getDocSyncState('drivers') !== 'unknown'
    if (!trusted) return { ok: false, message: 'Checking the driver list with the server — try again in a few seconds.' }
    clearPinFailures()
    return {
      ok: true,
      user: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        role: 'DRIVER',
        status: 'ACTIVE',
        pinFp: (driver.pinHash || '').slice(-12),
        ...STORE_FIELDS,
      },
    }
  }

  recordPinFailure()
  return { ok: false, message: 'Invalid PIN. Please enter an authorized staff or courier PIN.' }
}

/**
 * Resolves a PIN to a staff/courier account without starting a session — the
 * time clock and manager overrides need to identify someone who is not the
 * cashier currently signed in. No lockout accounting; use checkPin for prompts.
 */
export function findUserByPin(pin: string): AuthUser | undefined {
  const staff = matchStaffPin(pin)
  if (staff && 'member' in staff && staff.member.status === 'ACTIVE') return memberToUser(staff.member)
  const driver = findDriverByPin(pin)
  if (driver) return { id: driver.id, name: driver.name, email: driver.email, phone: driver.phone, role: 'DRIVER', status: 'ACTIVE', ...STORE_FIELDS }
  return undefined
}

/** Is this PIN used by anyone (staff or driver) other than `exceptId`? */
export function isPinTaken(pin: string, exceptId?: string): boolean {
  const staff = matchStaffPin(pin)
  if (staff && 'member' in staff && staff.member.id !== exceptId) return true
  return isDriverPinTaken(pin, exceptId)
}

export function loginWithPin(pin: string, allowedRoles?: Role[]): { ok: boolean; user?: AuthUser; message: string } {
  const res = checkPin(pin)
  if (!res.ok) return { ok: false, message: res.message }
  const user = res.user
  if (allowedRoles && !hasRole(user, allowedRoles)) {
    recordPinFailure()
    return { ok: false, message: 'That PIN does not have access to this area.' }
  }
  setCurrentUser(user)
  return {
    ok: true,
    user,
    message: user.role === 'DRIVER' ? `Welcome back, Courier ${user.name}!` : `Welcome back, ${user.name}!`,
  }
}

export async function loginWithGoogle(): Promise<{ ok: boolean; user?: AuthUser; message: string }> {
  const firebase = await loadFirebase()
  if (firebase.isFirebaseConfigured()) {
    const res = await firebase.signInWithGoogle()
    if (res.ok && res.user) {
      const cust: AuthUser = {
        id: res.user.uid,
        name: res.user.displayName,
        email: res.user.email,
        photoURL: res.user.photoURL,
        role: 'CUSTOMER',
        status: 'ACTIVE',
      }
      setCurrentUser(cust)
      return { ok: true, user: cust, message: `Welcome, ${cust.name}!` }
    }
    return { ok: false, message: res.message || 'Google sign in failed.' }
  }

  // Graceful fallback for local development if Firebase env is pending
  const cust: AuthUser = {
    id: `usr-google-${Date.now()}`,
    name: 'Google Customer',
    email: 'customer@gmail.com',
    role: 'CUSTOMER',
    status: 'ACTIVE',
  }
  setCurrentUser(cust)
  return { ok: true, user: cust, message: 'Logged in with Google successfully.' }
}

export function logout(): void {
  loadFirebase()
    .then((firebase) => firebase.signOutFromFirebase())
    .catch(() => {})
  setCurrentUser(null)
}

/**
 * Gate a portal on role. Status is checked first: a SUSPENDED or DISABLED account
 * must lose access even though it still holds a stored session, and that applies to
 * SUPER_ADMIN too — the role bypass below must never outrank a revoked account.
 *
 * NOTE: this is presentation only. It hides screens; it does not secure them. Anyone
 * can edit the stored user in devtools. Real enforcement has to happen server-side
 * once an API exists — see JUST_SPUDS_IMPLEMENTATION_PLAN.md, Part E.4.
 */
export function hasRole(user: AuthUser | null, allowedRoles: Role[]): boolean {
  if (!user) return false
  if (user.status !== 'ACTIVE') return false
  if (user.role === 'SUPER_ADMIN') return true
  return allowedRoles.includes(user.role)
}

/**
 * A session opened with a PIN ends when that PIN changes, the account is
 * disabled or removed — on this device and every other one, as the roster syncs.
 * Sessions from before PIN fingerprints existed are ended once, so nobody stays
 * signed in on a published starter PIN.
 */
function validateSession() {
  const user = getCurrentUser()
  if (!user || user.role === 'CUSTOMER') return
  if (user.role === 'DRIVER') {
    const driver = getDrivers().find((d) => d.id === user.id)
    if (!driver || driver.status !== 'ACTIVE' || (driver.pinHash || '').slice(-12) !== user.pinFp) setCurrentUser(null)
    return
  }
  const member = getRoster().find((m) => m.id === user.id)
  if (!member || member.status !== 'ACTIVE' || pinFingerprint(member) !== user.pinFp) setCurrentUser(null)
}

if (typeof window !== 'undefined') {
  setAccessProbe(() => {
    const user = getCurrentUser()
    const active = !!user && user.status === 'ACTIVE'
    return {
      staff: active && INTERNAL_ROLES.includes(user!.role),
      management: active && (user!.role === 'SUPER_ADMIN' || MANAGEMENT_ROLES.includes(user!.role)),
    }
  })
  subscribeRoster(() => validateSession())
  subscribeDrivers(() => validateSession())
}
