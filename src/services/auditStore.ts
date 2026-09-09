/**
 * REAL-TIME SYSTEM AUDIT LOG STORE
 * --------------------------------
 * Tracks all operational overrides, payment changes, price adjustments,
 * driver re-assignments, customer blacklists, and manual orders.
 * Cross-tab synchronized via BroadcastChannel and stored in localStorage.
 */

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

const DEFAULT_SEED_LOGS: AuditLogItem[] = [
  {
    id: 'aud-seed-1',
    time: '15 mins ago',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    actor: 'Sunny (Store Owner)',
    action: 'payment.policy_update',
    target: 'Storefront Payments',
    details: 'In-store & driver device payment system activated',
    ip: '192.168.1.1',
  },
  {
    id: 'aud-seed-2',
    time: '45 mins ago',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    actor: 'Elena (Manager)',
    action: 'kds.stock_verify',
    target: 'King Edward Potatoes',
    details: 'Oven capacity check passed',
    ip: '192.168.1.12',
  },
]

function getStored(): AuditLogItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SEED_LOGS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SEED_LOGS
  } catch {
    return DEFAULT_SEED_LOGS
  }
}

function saveStored(list: AuditLogItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 200))) // keep last 200 logs
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
  ip = '192.168.1.10'
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
