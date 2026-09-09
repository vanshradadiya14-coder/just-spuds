/**
 * CUSTOMER FRAUD & BLACKLIST STORE
 * --------------------------------
 * Protects against fake / prank orders (especially with pay-on-delivery & in-store payments).
 * Allows managers to flag abusive phone numbers with reason notes.
 * Cross-tab synchronized via BroadcastChannel and persistent in localStorage.
 */

export interface BlacklistEntry {
  id: string
  phone: string
  customerName?: string
  reason: string
  blockedBy: string
  blockedAt: string
}

const STORAGE_KEY = 'just_spuds_blacklist_v1'
const BC_NAME = 'just_spuds_blacklist_channel'

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '').trim()
}

function getStored(): BlacklistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as BlacklistEntry[]
  } catch {
    return []
  }
}

function saveStored(list: BlacklistEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BC_NAME)
      bc.postMessage({ type: 'BLACKLIST_UPDATED', list })
      bc.close()
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getBlacklistEntries(): BlacklistEntry[] {
  return getStored()
}

export function isPhoneBlacklisted(phone: string): { blacklisted: boolean; entry?: BlacklistEntry; reason?: string } {
  const norm = normalizePhone(phone)
  if (!norm) return { blacklisted: false }
  const found = getStored().find((e) => normalizePhone(e.phone) === norm)
  if (found) {
    return {
      blacklisted: true,
      entry: found,
      reason: `This phone number is flagged for phone/counter verification. Please call our store at 01296 423456 or visit our Market Square counter.`,
    }
  }
  return { blacklisted: false }
}

export function blacklistPhone(phone: string, reason: string, blockedBy: string, customerName?: string): BlacklistEntry {
  const norm = normalizePhone(phone)
  const current = getStored().filter((e) => normalizePhone(e.phone) !== norm)
  const entry: BlacklistEntry = {
    id: `blk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    phone: norm,
    customerName,
    reason: reason.trim() || 'Abusive order activity / failed delivery',
    blockedBy: blockedBy || 'Store Manager',
    blockedAt: new Date().toISOString(),
  }
  current.unshift(entry)
  saveStored(current)
  return entry
}

export function unblacklistPhone(phone: string): boolean {
  const norm = normalizePhone(phone)
  const current = getStored()
  const filtered = current.filter((e) => normalizePhone(e.phone) !== norm)
  if (filtered.length !== current.length) {
    saveStored(filtered)
    return true
  }
  return false
}

export function subscribeBlacklist(onChange: (entries: BlacklistEntry[]) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      onChange(getStored())
    }
  }
  window.addEventListener('storage', onStorage)

  let bc: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(BC_NAME)
    bc.onmessage = (evt) => {
      if (evt.data?.type === 'BLACKLIST_UPDATED') {
        onChange(evt.data.list)
      }
    }
  }

  return () => {
    window.removeEventListener('storage', onStorage)
    if (bc) bc.close()
  }
}
