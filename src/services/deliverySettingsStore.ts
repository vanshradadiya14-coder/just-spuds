/**
 * STORE DELIVERY & COURIER PAYOUT SETTINGS STORE
 * ----------------------------------------------
 * Manages dynamic delivery charges, free delivery thresholds, and courier earnings split.
 * Synchronizes across Checkout, Cart Drawer, Driver Terminal, and Admin Dashboard.
 */

export interface StoreDeliverySettings {
  /** Delivery fee charged to customers in pence (Default: 400 = £4.00) */
  deliveryFeePence: number
  /** Minimum subtotal in pence for free delivery (Default: 2500 = £25.00) */
  freeDeliveryThresholdPence: number
  /** Minimum order value for delivery in pence (Default: 1000 = £10.00) */
  minOrderPence: number
  /** Percentage of delivery fee paid out to couriers (Default: 100%) */
  driverPayoutPercent: number
  /** Whether online ordering (delivery & pickup) is currently enabled. Default false for temporary pause */
  isOnlineOrderingEnabled: boolean
  /** Title shown to customers when ordering is paused */
  orderingPausedTitle: string
  /** Message shown to customers when ordering is paused */
  orderingPausedMessage: string
  /** ISO timestamp of last configuration update */
  updatedAt: string
}

const STORAGE_KEY = 'just_spuds_delivery_settings_v1'

export const DEFAULT_DELIVERY_SETTINGS: StoreDeliverySettings = {
  deliveryFeePence: 400, // £4.00 default as requested
  freeDeliveryThresholdPence: 2500, // £25.00 free delivery
  minOrderPence: 1000, // £10.00 minimum order
  driverPayoutPercent: 100, // 100% of delivery fee goes to courier (£4.00)
  isOnlineOrderingEnabled: false, // Temporarily unavailable as requested
  orderingPausedTitle: 'Online Ordering Launching Soon!',
  orderingPausedMessage: 'Online delivery and store pick-up orders are temporarily unavailable while our kitchen prepares for online dispatch. Please visit us in Market Square, Aylesbury!',
  updatedAt: new Date().toISOString(),
}

// Cross-tab broadcast channel
let channel: BroadcastChannel | null = null
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel('just_spuds_delivery_settings_sync')
  }
} catch {
  // Graceful fallback
}

type Listener = (settings: StoreDeliverySettings) => void
const listeners = new Set<Listener>()

export function getDeliverySettings(): StoreDeliverySettings {
  if (typeof window === 'undefined') return DEFAULT_DELIVERY_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DELIVERY_SETTINGS))
      return DEFAULT_DELIVERY_SETTINGS
    }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_DELIVERY_SETTINGS,
      ...parsed,
    }
  } catch {
    return DEFAULT_DELIVERY_SETTINGS
  }
}

export function saveDeliverySettings(newSettings: Partial<StoreDeliverySettings>): StoreDeliverySettings {
  const current = getDeliverySettings()
  const updated: StoreDeliverySettings = {
    ...current,
    ...newSettings,
    updatedAt: new Date().toISOString(),
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      listeners.forEach((fn) => fn(updated))
      channel?.postMessage({ type: 'DELIVERY_SETTINGS_UPDATED', settings: updated })
    } catch (err) {
      console.error('Failed to save delivery settings', err)
    }
  }

  return updated
}

export function subscribeDeliverySettings(fn: Listener): () => void {
  listeners.add(fn)
  fn(getDeliverySettings())

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'DELIVERY_SETTINGS_UPDATED') {
      fn(getDeliverySettings())
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      fn(getDeliverySettings())
    }
  }

  channel?.addEventListener('message', handleMessage)
  window.addEventListener('storage', handleStorage)

  return () => {
    listeners.delete(fn)
    channel?.removeEventListener('message', handleMessage)
    window.removeEventListener('storage', handleStorage)
  }
}
