/**
 * REAL-TIME SYSTEM AUDIT LOG STORE
 * --------------------------------
 * Tracks all operational overrides, payment changes, price adjustments,
 * driver re-assignments, customer blacklists, and manual orders.
 * Cross-tab synchronized via BroadcastChannel and stored in localStorage; staff
 * devices share it through cloudSync so the owner sees every till's voids,
 * refunds and no-sales from anywhere.
 */
import { getDeviceId, markRecordChanged, registerEpochHandler, registerRecords } from './cloudSync'

export interface AuditLogItem {
  id: string
  time: string
  timestamp: string
  actor: string
  action: string
  target: string
  details?: string
  ip: string
}

const STORAGE_KEY = 'just_spuds_audit_logs_v1'
const BC_NAME = 'just_spuds_audit_channel'

function getStored(): AuditLogItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Fake "seed" entries shipped in early builds are not events that happened.
    return Array.isArray(parsed) ? parsed.filter((l: AuditLogItem) => !String(l.id).startsWith('aud-seed-')) : []
  } catch {
    return []
  }
}

function saveStored(list: AuditLogItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 500))) // keep last 500 logs
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BC_NAME)
      bc.postMessage({ type: 'AUDIT_UPDATED', list })
      bc.close()
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getAuditLogs(): AuditLogItem[] {
  return getStored()
}

export function logAuditEvent(
  actor: string,
  action: string,
  target: string,
  details?: string,
  /** Which device it happened on (was a made-up IP address). */
  ip = typeof window === 'undefined' ? 'server' : getDeviceId()
): AuditLogItem {
  const current = getStored()
  const now = new Date()
  const item: AuditLogItem = {
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: 'Just now',
    timestamp: now.toISOString(),
    actor: actor || 'Admin / Manager',
    action,
    target,
    details,
    ip,
  }
  const updated = [item, ...current]
  saveStored(updated)
  markRecordChanged('audit', item.id)
  return item
}

export function subscribeAuditLogs(onChange: (logs: AuditLogItem[]) => void): () => void {
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
      if (evt.data?.type === 'AUDIT_UPDATED') {
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
  registerRecords({
    collection: 'audit',
    limit: 400,
    get: (id) => {
      const item = getStored().find((l) => l.id === id)
      return item ? { ...item, updatedAt: item.timestamp } : undefined
    },
    apply: (items) => {
      const current = getStored()
      const have = new Set(current.map((l) => l.id))
      const fresh = (items as AuditLogItem[]).filter((l) => l && l.id && !have.has(l.id))
      if (fresh.length === 0) return
      saveStored([...fresh, ...current].sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
    },
  })
  registerEpochHandler((at) => saveStored(getStored().filter((l) => l.timestamp >= at)))
}
