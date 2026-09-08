/**
 * AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) STORE
 * --------------------------------------------------------
 * Manages user sessions, role-based permissions, PIN verification for Kitchen Staff & Admin,
 * and persistent auth state across tabs.
 */

import { signInWithGoogle as firebaseGoogleLogin, signOutFromFirebase, isFirebaseConfigured } from './firebase'

export type Role =
  | 'CUSTOMER'
  | 'STAFF'
  | 'STORE_MANAGER'
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
  staff: {
    id: 'usr-staff-1',
    name: 'Jack Davies',
    email: 'kitchen@justspuds.uk',
    phone: '07700 900101',
    role: 'STAFF',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  manager: {
    id: 'usr-mgr-1',
    name: 'Elena Rostova',
    email: 'manager@justspuds.uk',
    phone: '07700 900102',
    role: 'STORE_MANAGER',
    status: 'ACTIVE',
    storeId: 'store-aylesbury-1',
    storeName: 'Market Square Aylesbury',
  },
  admin: {
    id: 'usr-admin-1',
    name: 'Vansh',
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
  '1234': STAFF_ROSTER.staff,
  '5555': STAFF_ROSTER.manager,
  '8888': STAFF_ROSTER.admin,
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

export function loginWithPin(pin: string): { ok: boolean; user?: AuthUser; message: string } {
  const cleanPin = pin.trim()
  const match = PIN_MAP[cleanPin]
  if (match) {
    setCurrentUser(match)
    return { ok: true, user: match, message: `Welcome back, ${match.name}!` }
  }

  // Dynamic Driver PIN verification from driver store
  try {
    const rawDrivers = localStorage.getItem('just_spuds_drivers_v1')
    if (rawDrivers) {
      const drivers = JSON.parse(rawDrivers)
      const driverMatch = drivers.find((d: { pin: string; status: string }) => d.pin === cleanPin && d.status === 'ACTIVE')
      if (driverMatch) {
        const driverAuth: AuthUser = {
          id: driverMatch.id,
          name: driverMatch.name,
          email: driverMatch.email,
          phone: driverMatch.phone,
          role: 'DRIVER',
          status: driverMatch.status,
          storeId: 'store-aylesbury-1',
          storeName: 'Market Square Aylesbury',
        }
        setCurrentUser(driverAuth)
        return { ok: true, user: driverAuth, message: `Welcome back, Courier ${driverMatch.name}!` }
      }
    }
  } catch {
    // Fallthrough to seed check
  }

  // Fallback seed driver PIN check
  if (cleanPin === '7777') {
    const driver1: AuthUser = {
      id: 'usr-driver-1',
      name: 'Liam Walker',
      email: 'liam.walker@justspuds.uk',
      phone: '07700 900201',
      role: 'DRIVER',
      status: 'ACTIVE',
      storeId: 'store-aylesbury-1',
      storeName: 'Market Square Aylesbury',
    }
    setCurrentUser(driver1)
    return { ok: true, user: driver1, message: 'Welcome back, Courier Liam Walker!' }
  }

  return { ok: false, message: 'Invalid PIN. Please enter an authorized staff or courier PIN.' }
}

/**
 * ⚠️ DEMO LOGIN — NOT AUTHENTICATION. DO NOT SHIP TO A PUBLIC URL AS-IS.
 *
 * The password argument is ignored entirely, and any address containing "admin"
 * is granted SUPER_ADMIN. That is intentional so the portals can be demonstrated
 * without a backend, but it means /login currently hands full admin access to
 * anyone who opens it.
 *
 * Replace with a real POST /api/auth/login before this is reachable by the public:
 * see JUST_SPUDS_IMPLEMENTATION_PLAN.md, Phase 1.
 */
export function loginWithCredentials(email: string, _pass: string): { ok: boolean; user?: AuthUser; message: string } {
  const clean = email.toLowerCase().trim()
  if (clean.includes('admin')) {
    setCurrentUser(DEMO_USERS.admin)
    return { ok: true, user: DEMO_USERS.admin, message: 'Admin authenticated successfully.' }
  }
  if (clean.includes('staff') || clean.includes('kitchen')) {
    setCurrentUser(DEMO_USERS.staff)
    return { ok: true, user: DEMO_USERS.staff, message: 'Staff authenticated successfully.' }
  }
  // Default to customer
  const cust: AuthUser = {
    id: `usr-cust-${Date.now()}`,
    name: email.split('@')[0] || 'Valued Customer',
    email: clean,
    role: 'CUSTOMER',
    status: 'ACTIVE',
  }
  setCurrentUser(cust)
  return { ok: true, user: cust, message: 'Customer logged in.' }
}

export async function loginWithGoogle(): Promise<{ ok: boolean; user?: AuthUser; message: string }> {
  if (isFirebaseConfigured()) {
    const res = await firebaseGoogleLogin()
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
  signOutFromFirebase().catch(() => {})
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
