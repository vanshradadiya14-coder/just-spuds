/**
 * CUSTOMER FRAUD & BLACKLIST STORE
 * --------------------------------
 * Protects against fake / prank orders (especially with pay-on-delivery & in-store payments).
 * Allows managers to flag abusive phone numbers with reason notes.
 * Cross-tab synchronized via BroadcastChannel and persistent in localStorage.
 *
 * Shared across devices in two forms: the full list (numbers, names, reasons)
 * for staff devices only, and a list of hashed numbers that every customer's
 * browser checks at checkout — so a blocked number is refused on any phone
 * without handing anyone's phone number to every visitor.
 */
import { markDocChanged, registerDoc } from './cloudSync'
import { sha256Hex } from '../utils/sha256'

export interface BlacklistEntry {
  id: string
  phone: string
  customerName?: string
  reason: string
  blockedBy: string
  blockedAt: string
}

const STORAGE_KEY = 'just_spuds_blacklist_v1'
const HASHES_KEY = 'just_spuds_blacklist_hashes_v1'
const BC_NAME = 'just_spuds_blacklist_channel'

/** "+44 7700 900123", "07700-900123" and "0044 7700900123" are the same number. */
export function normalizePhone(raw: string): string {
  let n = raw.replace(/[\s\-().]/g, '').trim()
  if (n.startsWith('+44')) n = `0${n.slice(3)}`
  else if (n.startsWith('0044')) n = `0${n.slice(4)}`
  return n
}

const phoneHash = (norm: string) => sha256Hex(`just-spuds-blacklist:${norm}`)

function getHashes(): string[] {
  try {
    const raw = localStorage.getItem(HASHES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
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
    localStorage.setItem(HASHES_KEY, JSON.stringify(list.map((e) => phoneHash(normalizePhone(e.phone)))))
    markDocChanged('blacklist')
    markDocChanged('blacklist.hashes')
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
  const reason = `This phone number is flagged for phone/counter verification. Please call the shop or visit our Market Square counter.`
  const found = getStored().find((e) => normalizePhone(e.phone) === norm)
  if (found) return { blacklisted: true, entry: found, reason }
  // Customer devices only have the hashed list.
  if (getHashes().includes(phoneHash(norm))) return { blacklisted: true, reason }
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

if (typeof window !== 'undefined') {
  const notifyTabs = () => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(BC_NAME)
    bc.postMessage({ type: 'BLACKLIST_UPDATED', list: getStored() })
    bc.close()
  }
  registerDoc({ name: 'blacklist', storageKey: STORAGE_KEY, private: true, notify: notifyTabs })
  registerDoc({ name: 'blacklist.hashes', storageKey: HASHES_KEY, notify: notifyTabs })
}
