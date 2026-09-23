/**
 * STAFF ROSTER & PINS
 * -------------------
 * Who can sign in, with which role. PINs are stored only as salted, iterated
 * SHA-256 hashes and the roster is shared across every device through
 * cloudSync, so a PIN the owner changes on the laptop works on the till and
 * stops working everywhere else at the same moment.
 *
 * The app ships with starter PINs (they are in the public repository). They
 * are marked `defaultPin` and the admin console nags until each is changed.
 * A browser that has never fetched the shop's roster refuses those starter
 * PINs whenever cloud sync is configured — otherwise anyone could open a fresh
 * browser, type a published PIN, and be let in before the real roster arrived.
 */
import type { Role } from './authStore'
import { getDocSyncState, isCloudSyncConfigured, markDocChanged, registerDoc, syncNow } from './cloudSync'
import { logAuditEvent } from './auditStore'
import { sha256Hex } from '../utils/sha256'

export interface StaffMember {
  id: string
  name: string
  role: Role
  status: 'ACTIVE' | 'DISABLED'
  pinHash: string
  /** Still using the starter PIN that shipped with the app. */
  defaultPin?: boolean
  email?: string
  phone?: string
  updatedAt?: string
}

interface RosterDoc {
  salt: string
  members: StaffMember[]
}

export const ROSTER_STORAGE_KEY = 'just_spuds_staff_roster_v1'
const ROSTER_DOC = 'staff.roster'
const HASH_ROUNDS = 4000

/** 4–8 digits. Managers should use 6. */
export const PIN_PATTERN = /^\d{4,8}$/

/** Roles a manager can hand out from the admin console. */
export const ASSIGNABLE_ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'CASHIER', label: 'Cashier', hint: 'Till only' },
  { role: 'KITCHEN_STAFF', label: 'Kitchen', hint: 'Kitchen screen and till' },
  { role: 'SUPERVISOR', label: 'Supervisor', hint: 'Approves voids, refunds and discounts' },
  { role: 'STORE_MANAGER', label: 'Manager', hint: 'Everything, including staff and PINs' },
]

/** Starter accounts. Their PINs are public (README / source) — change them before trading. */
const STARTER_STAFF: { id: string; name: string; role: Role; pin: string; email: string }[] = [
  { id: 'usr-owner-1', name: 'Sunny (Store Owner)', role: 'STORE_MANAGER', pin: '2468', email: 'sunny@justspuds.uk' },
  { id: 'usr-mgr-1', name: 'Elena Rostova (Store Manager)', role: 'STORE_MANAGER', pin: '5555', email: 'manager@justspuds.uk' },
  { id: 'usr-sup-1', name: 'Marcus Bell (Shift Supervisor)', role: 'SUPERVISOR', pin: '3333', email: 'marcus@justspuds.uk' },
  { id: 'usr-cashier-1', name: 'Chloe Smith (Till Cashier)', role: 'CASHIER', pin: '1111', email: 'chloe@justspuds.uk' },
  { id: 'usr-staff-1', name: 'Jack Davies (Kitchen Chef)', role: 'KITCHEN_STAFF', pin: '1234', email: 'kitchen@justspuds.uk' },
  { id: 'usr-admin-1', name: 'Vansh (System Admin)', role: 'SUPER_ADMIN', pin: '8888', email: 'admin@justspuds.uk' },
]

const listeners = new Set<(members: StaffMember[]) => void>()

export function newSalt(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hashPin(pin: string, salt: string = readDoc().salt): string {
  let h = `${salt}:${pin.trim()}`
  for (let i = 0; i < HASH_ROUNDS; i++) h = sha256Hex(`${salt}${h}`)
  return h
}

function seedDoc(): RosterDoc {
  const salt = newSalt()
  const now = new Date().toISOString()
  return {
    salt,
    members: STARTER_STAFF.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      status: 'ACTIVE' as const,
      email: s.email,
      pinHash: hashPin(s.pin, salt),
      defaultPin: true,
      updatedAt: now,
    })),
  }
}

let cache: RosterDoc | null = null

function readDoc(): RosterDoc {
  if (cache) return cache
  if (typeof localStorage === 'undefined') {
    cache = seedDoc()
    return cache
  }
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RosterDoc
      if (parsed && typeof parsed.salt === 'string' && Array.isArray(parsed.members)) {
        cache = parsed
        return cache
      }
    }
  } catch {
    // fall through to a fresh seed
  }
  cache = seedDoc()
  localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(cache))
  return cache
}

function writeDoc(doc: RosterDoc) {
  cache = doc
  if (typeof localStorage !== 'undefined') localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(doc))
  markDocChanged(ROSTER_DOC)
  notify()
}

function notify() {
  const snap = getRoster()
  listeners.forEach((l) => l(snap))
}

export function getRoster(): StaffMember[] {
  return readDoc().members.map((m) => ({ ...m }))
}

/** `salt$hash` — for records that carry their own salt (driver PINs). */
export function saltedPinHash(pin: string): string {
  const salt = newSalt()
  return `${salt}$${hashPin(pin, salt)}`
}

export function checkSaltedPin(stored: string | undefined, pin: string): boolean {
  if (!stored || !stored.includes('$')) return false
  const [salt, h] = stored.split('$')
  return hashPin(pin, salt) === h
}

export function getPinSalt(): string {
  return readDoc().salt
}

export function subscribeRoster(fn: (members: StaffMember[]) => void): () => void {
  listeners.add(fn)
  fn(getRoster())
  return () => listeners.delete(fn)
}

/**
 * Can a starter PIN be trusted on this device? Only once this device has
 * asked the server — then the roster it holds is the shop's (and if the owner
 * still hasn't changed a starter PIN, it really is that person's PIN). A
 * browser that has never reached the server only has its own fresh seed.
 */
export function starterPinsAllowed(): boolean {
  if (!isCloudSyncConfigured()) return true
  return getDocSyncState(ROSTER_DOC) !== 'unknown'
}

export type PinMatch = { member: StaffMember } | { blocked: string } | null

/** The member a PIN belongs to (active or not — the caller decides), or why it cannot be checked yet. */
export function matchStaffPin(pin: string): PinMatch {
  const clean = pin.trim()
  if (!clean) return null
  const doc = readDoc()
  const h = hashPin(clean, doc.salt)
  const member = doc.members.find((m) => m.pinHash === h)
  if (!member) return null
  if (member.defaultPin && !starterPinsAllowed()) {
    // Never fetched the shop's real roster: a published starter PIN proves nothing.
    void syncNow()
    return { blocked: 'Checking the staff list with the server — try again in a few seconds.' }
  }
  return { member: { ...member } }
}

export function usingDefaultPins(): StaffMember[] {
  return getRoster().filter((m) => m.status === 'ACTIVE' && m.defaultPin)
}

export interface RosterResult {
  ok: boolean
  message: string
}

/** Checks a new PIN is well-formed and not someone else's. `takenElsewhere` covers drivers' PINs. */
export function validateNewPin(pin: string, exceptId: string | undefined, takenElsewhere: (pin: string) => boolean = () => false): RosterResult {
  const clean = pin.trim()
  if (!PIN_PATTERN.test(clean)) return { ok: false, message: 'PINs are 4 to 8 digits.' }
  if (/^(\d)\1+$/.test(clean) || '0123456789'.includes(clean) || '9876543210'.includes(clean)) {
    return { ok: false, message: 'Too easy to guess — avoid repeated or sequential digits.' }
  }
  if (STARTER_STAFF.some((s) => s.pin === clean) || ['7777', '7778', '7779', '0000'].includes(clean)) {
    return { ok: false, message: 'That is one of the published starter PINs — choose another.' }
  }
  const doc = readDoc()
  const h = hashPin(clean, doc.salt)
  if (doc.members.some((m) => m.id !== exceptId && m.pinHash === h) || takenElsewhere(clean)) {
    return { ok: false, message: 'Someone else already uses that PIN.' }
  }
  return { ok: true, message: 'OK' }
}

export function setStaffPin(id: string, pin: string, actor: string, takenElsewhere?: (pin: string) => boolean): RosterResult {
  const doc = readDoc()
  const member = doc.members.find((m) => m.id === id)
  if (!member) return { ok: false, message: 'Staff member not found.' }
  const check = validateNewPin(pin, id, takenElsewhere)
  if (!check.ok) return check
  const now = new Date().toISOString()
  writeDoc({
    ...doc,
    members: doc.members.map((m) => (m.id === id ? { ...m, pinHash: hashPin(pin, doc.salt), defaultPin: false, updatedAt: now } : m)),
  })
  logAuditEvent(actor, 'staff.pin_changed', member.name)
  return { ok: true, message: `PIN updated for ${member.name}.` }
}

export function addStaffMember(input: { name: string; role: Role; pin: string }, actor: string, takenElsewhere?: (pin: string) => boolean): RosterResult {
  const name = input.name.trim()
  if (name.length < 2) return { ok: false, message: 'Enter a name.' }
  const check = validateNewPin(input.pin, undefined, takenElsewhere)
  if (!check.ok) return check
  const doc = readDoc()
  const member: StaffMember = {
    id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    role: input.role,
    status: 'ACTIVE',
    pinHash: hashPin(input.pin, doc.salt),
    updatedAt: new Date().toISOString(),
  }
  writeDoc({ ...doc, members: [...doc.members, member] })
  logAuditEvent(actor, 'staff.added', name, input.role)
  return { ok: true, message: `${name} added.` }
}

export function updateStaffMember(id: string, patch: Partial<Pick<StaffMember, 'name' | 'role' | 'status'>>, actor: string): RosterResult {
  const doc = readDoc()
  const member = doc.members.find((m) => m.id === id)
  if (!member) return { ok: false, message: 'Staff member not found.' }
  const next = { ...member, ...patch, updatedAt: new Date().toISOString() }
  // Never lock the shop out of its own admin console.
  const managersLeft = doc.members.filter(
    (m) => (m.id === id ? next : m).status === 'ACTIVE' && ['STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes((m.id === id ? next : m).role),
  )
  if (managersLeft.length === 0) return { ok: false, message: 'At least one active manager must remain.' }
  writeDoc({ ...doc, members: doc.members.map((m) => (m.id === id ? next : m)) })
  const what = Object.entries(patch)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ')
  logAuditEvent(actor, 'staff.updated', member.name, what)
  return { ok: true, message: `${next.name} updated.` }
}

/** Fingerprint of a member's PIN, kept on the session so a PIN change signs them out everywhere. */
export function pinFingerprint(member: Pick<StaffMember, 'pinHash'>): string {
  return member.pinHash.slice(0, 12)
}

if (typeof window !== 'undefined') {
  registerDoc({
    name: ROSTER_DOC,
    storageKey: ROSTER_STORAGE_KEY,
    notify: () => {
      cache = null
      notify()
    },
  })
}
