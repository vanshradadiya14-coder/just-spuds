/**
 * AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) STORE
 * --------------------------------------------------------
 * Manages user sessions, role-based permissions, PIN verification for Kitchen Staff & Admin,
 * and persistent auth state across tabs.
 */

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
}

const AUTH_STORAGE_KEY = 'just_spuds_auth_user_v1'

// Authorized Store Staff Profiles for Role-Based Access Control
export const STAFF_ROSTER: Record<string, AuthUser> = {
  owner: {
    id: 'usr-owner-1',
    name: 'Sunny (Store Owner)',
    email: 'sunny@justspuds.uk',
    phone: '07700 900103',
    role: 'STORE_MANAGER',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  manager: {
    id: 'usr-mgr-1',
    name: 'Elena Rostova (Store Manager)',
    email: 'manager@justspuds.uk',
    phone: '07700 900102',
    role: 'STORE_MANAGER',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  supervisor: {
    id: 'usr-sup-1',
    name: 'Marcus Bell (Shift Supervisor)',
    email: 'marcus@justspuds.uk',
    phone: '07700 900105',
    role: 'SUPERVISOR',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  cashier: {
    id: 'usr-cashier-1',
    name: 'Chloe Smith (Till Cashier)',
    email: 'chloe@justspuds.uk',
    phone: '07700 900106',
    role: 'CASHIER',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  staff: {
    id: 'usr-staff-1',
    name: 'Jack Davies (Kitchen Chef)',
    email: 'kitchen@justspuds.uk',
    phone: '07700 900101',
    role: 'KITCHEN_STAFF',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  admin: {
    id: 'usr-admin-1',
    name: 'Vansh (System Admin)',
    email: 'admin@justspuds.uk',
    phone: '07700 900100',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
}

export const DEMO_USERS = STAFF_ROSTER

// Staff PIN credentials
const PIN_MAP: Record<string, AuthUser> = {
  '2468': STAFF_ROSTER.owner,
  '5555': STAFF_ROSTER.manager,
  '3333': STAFF_ROSTER.supervisor,
  '1111': STAFF_ROSTER.cashier,
  '1234': STAFF_ROSTER.staff,
  '8888': STAFF_ROSTER.admin,
  '0000': STAFF_ROSTER.owner,
}

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
  const remaining = getPinLockRemainingMs()
  if (remaining > 0) return { ok: false, message: pinLockMessage(remaining) }
  const user = PIN_MAP[pin.trim()]
  if (user && isManagerOrAdmin(user.role)) {
    clearPinFailures()
    return { ok: true, managerName: user.name, role: user.role }
  }
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

/**
 * Resolves a PIN to a staff/courier account without starting a session — the
 * time clock and manager overrides need to identify someone who is not the
 * cashier currently signed in.
 */
export function findUserByPin(pin: string): AuthUser | undefined {
  const cleanPin = pin.trim()
  const match = PIN_MAP[cleanPin]
  if (match) return match

  // Dynamic Driver PIN verification from driver store
  try {
    const rawDrivers = localStorage.getItem('just_spuds_drivers_v1')
    if (rawDrivers) {
      const drivers = JSON.parse(rawDrivers)
      const driverMatch = drivers.find((d: { pin: string; status: string }) => d.pin === cleanPin && d.status === 'ACTIVE')
      if (driverMatch) {
        return {
          id: driverMatch.id,
          name: driverMatch.name,
          email: driverMatch.email,
          phone: driverMatch.phone,
          role: 'DRIVER',
          status: driverMatch.status,
          storeId: 'store-aylesbury-1',
          storeName: 'Market Square Aylesbury',
        }
      }
    }
  } catch {
    // Fallthrough to seed check
  }

  // Fallback seed driver PIN check
  if (cleanPin === '7777') {
    return {
      id: 'usr-driver-1',
      name: 'Liam Walker',
      email: 'liam.walker@justspuds.uk',
      phone: '07700 900201',
      role: 'DRIVER',
      status: 'ACTIVE',
      storeId: 'store-aylesbury-1',
      storeName: 'Market Square Aylesbury',
    }
  }
  return undefined
}

export function loginWithPin(pin: string, allowedRoles?: Role[]): { ok: boolean; user?: AuthUser; message: string } {
  const remaining = getPinLockRemainingMs()
  if (remaining > 0) return { ok: false, message: pinLockMessage(remaining) }
  const user = findUserByPin(pin)
  if (!user) {
    recordPinFailure()
    return { ok: false, message: 'Invalid PIN. Please enter an authorized staff or courier PIN.' }
  }
  if (allowedRoles && !hasRole(user, allowedRoles)) {
    recordPinFailure()
    return { ok: false, message: 'That PIN does not have access to this area.' }
  }
  clearPinFailures()
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
