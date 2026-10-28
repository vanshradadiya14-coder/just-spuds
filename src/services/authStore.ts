/**
 * AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) STORE
 * --------------------------------------------------------
 * Manages user sessions, role-based permissions, PIN verification for Kitchen Staff & Admin,
 * and persistent auth state across tabs.
 */

import { callServer, getDocSyncState, isCloudSyncConfigured, markStaffDevice, setAccessProbe, syncNow } from './cloudSync'
import { matchStaffPin, pinFingerprint, subscribeRoster, getRoster, getPinSalt, type StaffMember } from './staffRoster'
import { findDriverByPin, getDrivers, isDriverPinTaken, subscribeDrivers } from './driverStore'
import { hasAdminPasskey, verifyAdminPasskey } from './terminalLockStore'
import { getServerAuthMode, isDevicePaired, isServerAuth, setServerAuthMode, subscribeServerAuth } from './serverAuthState'
import {
  matchOfflinePin,
  pruneOfflinePins,
  rememberOfflinePin,
  serverChangeMyPin,
  serverCheckPin,
  serverSession,
  serverSignOut,
  type ServerPerson,
} from './staffAuth'
import { sha256Hex } from '../utils/sha256'

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
  /** Cryptographic HMAC-style session signature preventing DevTools localStorage tampering. */
  sessionSig?: string
  /**
   * How the PIN was checked: 'server' = by the shop's database (serverToken is
   * the session), 'offline' = on this paired device while the server was
   * unreachable. Unset = the old in-browser check.
   */
  authMode?: 'server' | 'offline'
  serverToken?: string
  /** Signed in with a temporary PIN: must choose their own before doing anything else. */
  mustChangePin?: boolean
  kind?: 'staff' | 'driver'
}

const AUTH_STORAGE_KEY = 'just_spuds_auth_user_v1'
const ADMIN_VAULT_KEY = 'just_spuds_admin_vault_v1'
/** Admin console auto-locks after 15 minutes of inactivity. */
export const ADMIN_VAULT_IDLE_MS = 15 * 60 * 1000

/**
 * Role groups.
 * - ADMIN_CONSOLE_ROLES: Strictly Owner / Store Manager / Admin — the ONLY roles allowed into /admin.
 * - MANAGEMENT_ROLES: Includes Shift Supervisors so they can approve voids/discounts on the shop floor.
 */
export const ADMIN_CONSOLE_ROLES: Role[] = ['STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']
export const MANAGEMENT_ROLES: Role[] = ['SUPERVISOR', ...ADMIN_CONSOLE_ROLES]
/** Anyone who works the shop floor: till, kitchen, and their managers. */
export const SHOP_FLOOR_ROLES: Role[] = ['STAFF', 'CASHIER', 'KITCHEN_STAFF', ...MANAGEMENT_ROLES]
/** Every non-customer account. */
export const INTERNAL_ROLES: Role[] = [...SHOP_FLOOR_ROLES, 'DRIVER']

export function isAdminConsoleRole(role?: Role): boolean {
  return !!role && ADMIN_CONSOLE_ROLES.includes(role)
}

export function isManagerOrAdmin(role?: Role): boolean {
  return !!role && MANAGEMENT_ROLES.includes(role)
}

/** Where a freshly signed-in account should land. */
export function homePortalForRole(role?: Role): string | null {
  switch (role) {
    case 'CASHIER':
    case 'SUPERVISOR':
      return '/pos'
    case 'STAFF':
    case 'KITCHEN_STAFF':
      return '/staff'
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

function computeSessionSig(id: string, role: Role, status: UserStatus, pinFp: string): string {
  return sha256Hex(`${getPinSalt()}::session_v1::${id}::${role}::${status}::${pinFp}`)
}

function computeAdminVaultSig(userId: string, role: Role, pinFp: string): string {
  return sha256Hex(`${getPinSalt()}::admin_vault_v1::${userId}::${role}::${pinFp}`)
}

interface AdminVaultState {
  userId: string
  role: Role
  unlockedAt: number
  lastActiveAt: number
  sig: string
}

function getVaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    if (typeof sessionStorage !== 'undefined' && typeof sessionStorage.getItem === 'function') {
      return sessionStorage
    }
  } catch {
    // Fallback to localStorage in headless test shims
  }
  return typeof localStorage !== 'undefined' ? localStorage : null
}

export function unlockAdminVault(user: AuthUser): boolean {
  if (!user || user.status !== 'ACTIVE' || !isAdminConsoleRole(user.role) || !user.pinFp) return false
  const storage = getVaultStorage()
  if (!storage) return false
  const now = Date.now()
  const state: AdminVaultState = {
    userId: user.id,
    role: user.role,
    unlockedAt: now,
    lastActiveAt: now,
    sig: computeAdminVaultSig(user.id, user.role, user.pinFp),
  }
  try {
    storage.setItem(ADMIN_VAULT_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function touchAdminVault(): void {
  const storage = getVaultStorage()
  if (!storage) return
  try {
    const raw = storage.getItem(ADMIN_VAULT_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as AdminVaultState
    parsed.lastActiveAt = Date.now()
    storage.setItem(ADMIN_VAULT_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

export function lockAdminVault(): void {
  const storage = getVaultStorage()
  try {
    storage?.removeItem(ADMIN_VAULT_KEY)
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ADMIN_VAULT_KEY)
  } catch {
    // ignore
  }
  const current = getCurrentUser()
  listeners.forEach((fn) => fn(current))
}

export function isAdminVaultUnlocked(user: AuthUser | null = getCurrentUser(), now = Date.now()): boolean {
  if (!user || user.status !== 'ACTIVE' || !isAdminConsoleRole(user.role) || !user.pinFp) return false
  const storage = getVaultStorage()
  if (!storage) return false
  try {
    const raw = storage.getItem(ADMIN_VAULT_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as AdminVaultState
    if (!parsed || parsed.userId !== user.id || parsed.role !== user.role) return false
    if (parsed.sig !== computeAdminVaultSig(user.id, user.role, user.pinFp)) {
      storage.removeItem(ADMIN_VAULT_KEY)
      return false
    }
    if (now - parsed.lastActiveAt > ADMIN_VAULT_IDLE_MS) {
      storage.removeItem(ADMIN_VAULT_KEY)
      return false
    }
    return true
  } catch {
    return false
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
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.role) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    if (parsed.role === 'CUSTOMER') {
      return parsed
    }
    if (parsed.authMode) {
      // Checked by the server: valid on a paired device, for someone the shop
      // still lists as active in that role. The session check below catches the rest.
      if (!isServerAuth() || !isDevicePaired() || (parsed.authMode === 'server' && !parsed.serverToken) || !stillListed(parsed)) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        return null
      }
      return parsed
    }
    // A PIN session from before the shop switched to server sign-in.
    if (isServerAuth()) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    // Cryptographic & live-roster verification for every internal role (prevents DevTools tampering)
    if (parsed.role === 'DRIVER') {
      const driver = getDrivers().find((d) => d.id === parsed.id)
      const fp = (driver?.pinHash || '').slice(-12)
      const expectedSig = computeSessionSig(parsed.id, 'DRIVER', 'ACTIVE', fp)
      if (!driver || driver.status !== 'ACTIVE' || parsed.pinFp !== fp || parsed.sessionSig !== expectedSig) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        return null
      }
      return parsed
    }
    const member = getRoster().find((m) => m.id === parsed.id)
    if (!member || member.status !== 'ACTIVE' || member.role !== parsed.role) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    const fp = pinFingerprint(member)
    const expectedSig = computeSessionSig(member.id, member.role, 'ACTIVE', fp)
    if (parsed.pinFp !== fp || parsed.sessionSig !== expectedSig) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return parsed
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
      const storage = getVaultStorage()
      storage?.removeItem(ADMIN_VAULT_KEY)
      localStorage.removeItem(ADMIN_VAULT_KEY)
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
  const fp = pinFingerprint(m)
  const status: UserStatus = m.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED'
  return {
    id: m.id,
    name: m.name,
    email: m.email || '',
    phone: m.phone,
    role: m.role,
    status,
    pinFp: fp,
    sessionSig: computeSessionSig(m.id, m.role, status, fp),
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
    const fp = (driver.pinHash || '').slice(-12)
    return {
      ok: true,
      user: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        role: 'DRIVER',
        status: 'ACTIVE',
        pinFp: fp,
        sessionSig: computeSessionSig(driver.id, 'DRIVER', 'ACTIVE', fp),
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
  if (driver) {
    const fp = (driver.pinHash || '').slice(-12)
    return {
      id: driver.id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      role: 'DRIVER',
      status: 'ACTIVE',
      pinFp: fp,
      sessionSig: computeSessionSig(driver.id, 'DRIVER', 'ACTIVE', fp),
      ...STORE_FIELDS,
    }
  }
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
  // Only unlock the Admin Vault when signing into a management/admin-only gate;
  // signing into the counter till (/pos) keeps the Admin Console locked!
  const isAdminGate =
    allowedRoles &&
    allowedRoles.length > 0 &&
    allowedRoles.every((r) => MANAGEMENT_ROLES.includes(r))
  if (isAdminGate && isAdminConsoleRole(user.role)) {
    unlockAdminVault(user)
  } else {
    lockAdminVault()
  }
  return {
    ok: true,
    user,
    message: user.role === 'DRIVER' ? `Welcome back, Courier ${user.name}!` : `Welcome back, ${user.name}!`,
  }
}

/**
 * Dedicated strict Admin Console authentication.
 * Only admits ADMIN_CONSOLE_ROLES (Owner / Store Manager / Admin — never Cashiers, Kitchen Staff, Drivers, or Supervisors),
 * enforces the optional Secondary Admin Master Passkey if configured, and unlocks the time-bounded Admin Vault.
 */
export function loginAdminConsole(
  pin: string,
  passkey?: string,
): { ok: boolean; user?: AuthUser; message: string } {
  const res = checkPin(pin)
  if (!res.ok) return { ok: false, message: res.message }
  const user = res.user
  if (!isAdminConsoleRole(user.role)) {
    recordPinFailure()
    return {
      ok: false,
      message: '🚫 Restricted: Only the Store Admin / Owner can access the Admin Console.',
    }
  }
  if (hasAdminPasskey() && !verifyAdminPasskey(passkey || '')) {
    recordPinFailure()
    return {
      ok: false,
      message: '🔑 Invalid Admin Master Passkey. Both Admin PIN and Master Passkey are required.',
    }
  }
  setCurrentUser(user)
  unlockAdminVault(user)
  return {
    ok: true,
    user,
    message: `Admin Console unlocked for ${user.name}.`,
  }
}

/**
 * Admin sign-in that also checks the shop's security settings on the server.
 *
 * A browser that has never synced holds no copy of the terminal registry, so
 * `loginAdminConsole` alone cannot know an Admin master passkey exists and
 * would let the PIN through on its own. This signs in, fetches the shop's
 * private documents, then re-checks the passkey — and refuses if the server
 * can't be reached, rather than trusting an empty local copy.
 */
export async function loginAdminConsoleVerified(
  pin: string,
  passkey?: string,
): Promise<{ ok: boolean; user?: AuthUser; message: string; needPasskey?: boolean }> {
  if (await usingServerSignIn()) {
    const signed = await signInWithPin(pin)
    if (!signed.ok || !signed.user) return signed
    if (!isAdminConsoleRole(signed.user.role)) {
      logout()
      return { ok: false, message: '🚫 Restricted: Only the Store Admin / Owner can access the Admin Console.' }
    }
    await syncNow().catch(() => false)
    if (getDocSyncState('terminal.registry') === 'unknown') {
      logout()
      return { ok: false, message: "Couldn't reach the server to check this shop's security settings. Check the internet connection and try again." }
    }
    if (hasAdminPasskey() && !verifyAdminPasskey(passkey || '')) {
      logout()
      recordPinFailure()
      return { ok: false, needPasskey: true, message: '🔑 This shop uses an Admin master passkey — enter it as well as the PIN.' }
    }
    unlockAdminVault(signed.user)
    return { ok: true, user: signed.user, message: `Admin Console unlocked for ${signed.user.name}.` }
  }
  const res = loginAdminConsole(pin, passkey)
  if (!res.ok || !isCloudSyncConfigured()) return res
  await syncNow().catch(() => false)
  if (getDocSyncState('terminal.registry') === 'unknown') {
    logout()
    return { ok: false, message: "Couldn't reach the server to check this shop's security settings. Check the internet connection and try again." }
  }
  if (hasAdminPasskey() && !verifyAdminPasskey(passkey || '')) {
    logout()
    recordPinFailure()
    return { ok: false, needPasskey: true, message: '🔑 This shop uses an Admin master passkey — enter it as well as the PIN.' }
  }
  return res
}

// ---------------------------------------------------------------------------
// Server sign-in (supabase/migrations/20261028_staff_security.sql)
// ---------------------------------------------------------------------------

export interface SignInResult {
  ok: boolean
  user?: AuthUser
  message: string
  /** Signed in with a temporary PIN — the portal asks for a new one first. */
  mustChangePin?: boolean
}

/** Is the shop's database checking PINs? Asks it once if this browser doesn't know yet. */
export async function usingServerSignIn(): Promise<boolean> {
  if (getServerAuthMode() === 'unknown' && isCloudSyncConfigured()) {
    const res = await callServer('jsp_auth_status', {})
    if (res.ok && (res.data as { enabled?: boolean } | null)?.enabled) setServerAuthMode('server')
    else if (!res.ok && res.kind === 'missing') setServerAuthMode('legacy')
  }
  return isServerAuth()
}

function serverUser(person: Pick<ServerPerson, 'id' | 'name' | 'role' | 'kind'> & { email?: string }, mode: 'server' | 'offline', token?: string, mustChange = false): AuthUser {
  return {
    id: person.id,
    name: person.name,
    email: person.email || '',
    role: person.role,
    status: 'ACTIVE',
    kind: person.kind,
    authMode: mode,
    serverToken: token,
    mustChangePin: mustChange,
    // Ties the admin vault to this session.
    pinFp: sha256Hex(`${mode}:${token || person.id}`).slice(0, 12),
    ...STORE_FIELDS,
  }
}

/** Is a server-checked account still listed as active in that role on this device? */
function stillListed(user: AuthUser): boolean {
  if (user.role === 'DRIVER' || user.kind === 'driver') {
    if (getDocSyncState('drivers') !== 'remote') return true
    const driver = getDrivers().find((d) => d.id === user.id)
    return !driver || driver.status === 'ACTIVE'
  }
  if (getDocSyncState('staff.roster') !== 'remote') return true
  const member = getRoster().find((m) => m.id === user.id)
  // Someone added since this device last synced isn't listed yet; the server session check covers them.
  return !member || (member.status === 'ACTIVE' && member.role === user.role)
}

function mirrorServerLock(retryAfterSeconds: number) {
  writePinLock({ fails: PIN_MAX_ATTEMPTS, until: Date.now() + retryAfterSeconds * 1000 })
}

const OFFLINE_HINT = 'Only people who have signed in on this device in the last 7 days can sign in while it is offline.'

/** Identify someone by PIN without opening a session (manager approval, time clock). */
export async function verifyPinAsync(pin: string): Promise<PinCheck> {
  if (!(await usingServerSignIn())) return checkPin(pin)
  const remaining = getPinLockRemainingMs()
  if (remaining > 0) return { ok: false, message: pinLockMessage(remaining) }
  const res = await serverCheckPin(pin, false)
  if (res.ok) {
    clearPinFailures()
    void rememberOfflinePin(res.person, pin)
    return { ok: true, user: serverUser(res.person, 'server', undefined, res.mustChange) }
  }
  if (res.error === 'network') {
    const offline = await matchOfflinePin(pin)
    if (offline) {
      clearPinFailures()
      return { ok: true, user: serverUser(offline, 'offline') }
    }
    recordPinFailure()
    return { ok: false, message: `${res.message} ${OFFLINE_HINT}` }
  }
  if (res.error === 'locked' && res.retryAfter) mirrorServerLock(res.retryAfter)
  return { ok: false, message: res.message }
}

export async function verifyManagerPinAsync(pin: string): Promise<{ ok: boolean; managerName?: string; role?: Role; message?: string }> {
  if (!(await usingServerSignIn())) return verifyManagerPin(pin)
  const res = await verifyPinAsync(pin)
  if (!res.ok) return { ok: false, message: res.message }
  if (isManagerOrAdmin(res.user.role)) return { ok: true, managerName: res.user.name, role: res.user.role }
  return { ok: false, message: 'That PIN is not a supervisor or manager PIN.' }
}

/**
 * Sign in with a PIN. On a shop whose database checks PINs this asks the
 * server (from a paired device); otherwise it is the old in-browser check.
 */
export async function signInWithPin(pin: string, allowedRoles?: Role[]): Promise<SignInResult> {
  if (!(await usingServerSignIn())) return loginWithPin(pin, allowedRoles)
  const remaining = getPinLockRemainingMs()
  if (remaining > 0) return { ok: false, message: pinLockMessage(remaining) }

  const res = await serverCheckPin(pin, true)
  let user: AuthUser
  if (res.ok && res.session) {
    clearPinFailures()
    user = serverUser(res.person, 'server', res.session.token, res.mustChange)
    void rememberOfflinePin(res.person, pin)
  } else if (!res.ok && res.error === 'network') {
    const offline = await matchOfflinePin(pin)
    if (!offline) {
      recordPinFailure()
      return { ok: false, message: `${res.message} ${OFFLINE_HINT}` }
    }
    clearPinFailures()
    user = serverUser(offline, 'offline')
  } else {
    if (!res.ok && res.error === 'locked' && res.retryAfter) mirrorServerLock(res.retryAfter)
    return { ok: false, message: res.ok ? 'Sign-in failed. Try again.' : res.message }
  }

  if (allowedRoles && !hasRole(user, allowedRoles)) {
    if (user.serverToken) void serverSignOut(user.serverToken)
    return { ok: false, message: 'That PIN does not have access to this area.' }
  }
  // Someone added since this device last synced: fetch the staff list first.
  if (!getRoster().some((m) => m.id === user.id) && user.kind !== 'driver') await syncNow().catch(() => false)
  const previous = getCurrentUser()
  if (previous?.serverToken && previous.serverToken !== user.serverToken) void serverSignOut(previous.serverToken)
  setCurrentUser(user)
  const isAdminGate = allowedRoles && allowedRoles.length > 0 && allowedRoles.every((r) => MANAGEMENT_ROLES.includes(r))
  if (isAdminGate && isAdminConsoleRole(user.role) && !user.mustChangePin) unlockAdminVault(user)
  else lockAdminVault()
  return {
    ok: true,
    user,
    mustChangePin: user.mustChangePin,
    message:
      user.authMode === 'offline'
        ? `Signed in offline as ${user.name}. Changes upload when the connection is back.`
        : user.role === 'DRIVER'
        ? `Welcome back, Courier ${user.name}!`
        : `Welcome back, ${user.name}!`,
  }
}

/** Choose your own PIN (required after a temporary one). Other devices you were signed in on are signed out. */
export async function changeMyPin(newPin: string): Promise<{ ok: boolean; message: string }> {
  const user = getCurrentUser()
  if (!user?.serverToken) return { ok: false, message: 'Sign in again (online) to change your PIN.' }
  const res = await serverChangeMyPin(user.serverToken, newPin)
  if (!res.ok) {
    if (res.error === 'session') logout()
    return { ok: false, message: res.message }
  }
  setCurrentUser({ ...user, mustChangePin: false })
  const fresh = await serverSession(user.serverToken)
  if (fresh.ok) void rememberOfflinePin(fresh.person, newPin)
  void syncNow().catch(() => false)
  return { ok: true, message: res.message }
}

/** The signed-in person's server session, for the owner tools in Admin. */
export function currentSessionToken(): string | null {
  return getCurrentUser()?.serverToken || null
}

/** Ask the server whether this session is still good (PIN changed, disabled, device unpaired …). */
export async function checkServerSession(): Promise<void> {
  const user = getCurrentUser()
  if (!user || user.authMode !== 'server' || !user.serverToken) return
  const res = await serverSession(user.serverToken)
  if (res.ok) {
    if (res.mustChange !== Boolean(user.mustChangePin) || res.person.name !== user.name) {
      setCurrentUser({ ...user, mustChangePin: res.mustChange, name: res.person.name })
    }
  } else if (res.error === 'session' || res.error === 'device') {
    logout()
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
  const token = getCurrentUser()?.serverToken
  if (token) void serverSignOut(token)
  loadFirebase()
    .then((firebase) => firebase.signOutFromFirebase())
    .catch(() => {})
  lockAdminVault()
  setCurrentUser(null)
}

/**
 * Gate a portal on role. Status is checked first: a SUSPENDED or DISABLED account
 * must lose access even though it still holds a stored session, and that applies to
 * SUPER_ADMIN too — the role bypass below must never outrank a revoked account.
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
 */
function validateSession() {
  // getCurrentUser() now performs full cryptographic and live-roster validation,
  // purging any invalidated or tampered session and notifying listeners if needed.
  const raw = typeof window !== 'undefined' ? localStorage.getItem(AUTH_STORAGE_KEY) : null
  const valid = getCurrentUser()
  if (raw && !valid) {
    lockAdminVault()
    listeners.forEach((fn) => fn(null))
  }
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
  subscribeRoster((members) => {
    // A PIN changed elsewhere, or someone was disabled: their offline sign-in on this device goes too.
    if (isServerAuth()) {
      pruneOfflinePins((entry) => {
        const m = members.find((x) => x.id === entry.id)
        if (!m) return true
        return m.status === 'ACTIVE' && !(m.pinSetAt && entry.pinSetAt && m.pinSetAt !== entry.pinSetAt)
      })
    }
    validateSession()
  })
  subscribeDrivers(() => validateSession())
  // Switching to server sign-in (or being unpaired) ends sessions from before.
  subscribeServerAuth(() => validateSession())
  const timer = setInterval(() => {
    if (isServerAuth()) void checkServerSession()
  }, 60_000)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isServerAuth()) void checkServerSession()
    })
  }
}
