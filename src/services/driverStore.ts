/**
 * DRIVER MANAGEMENT STORE & DISPATCH FLEET REGISTRY
 * --------------------------------------------------
 * Handles driver profiles, online/offline availability states, PIN authentications,
 * driver metrics (earnings, completed orders, ratings), and cross-tab synchronization.
 */

import { markDocChanged, registerDoc } from './cloudSync'
import { checkSaltedPin, saltedPinHash } from './staffRoster'

export interface DriverProfile {
  id: string
  name: string
  email: string
  phone: string
  avatar: string
  vehicleType: 'Car' | 'Electric Moped' | 'Motorcycle' | 'E-Bike' | 'Van'
  vehicleReg: string
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
  isOnline: boolean
  /** Legacy plaintext PIN — migrated to pinHash on first read and removed. */
  pin?: string
  /** `salt$hash` of the driver's sign-in PIN. */
  pinHash?: string
  /** Still on the starter PIN shipped with the app (public). */
  defaultPin?: boolean
  rating: number
  deliveriesCompletedCount: number
  todayEarningsPence: number
  /** Local calendar day (YYYY-MM-DD) that todayEarningsPence belongs to. */
  todayEarningsDate?: string
  createdAt: string
}

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Earnings for today only — a figure from a previous day is stale, not "today's". */
export function getDriverTodayEarnings(driver: Pick<DriverProfile, 'todayEarningsPence' | 'todayEarningsDate'>): number {
  return driver.todayEarningsDate === localDay() ? driver.todayEarningsPence : 0
}

const DRIVERS_STORAGE_KEY = 'just_spuds_drivers_v1'
const DRIVER_CHANNEL_NAME = 'just_spuds_driver_sync'

export const SEED_DRIVERS: DriverProfile[] = [
  {
    id: 'usr-driver-1',
    name: 'Liam Walker',
    email: 'liam.walker@justspuds.uk',
    phone: '07700 900201',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    vehicleType: 'Electric Moped',
    vehicleReg: 'AY23 SPD',
    status: 'ACTIVE',
    isOnline: true,
    pin: '7777',
    rating: 5,
    deliveriesCompletedCount: 0,
    todayEarningsPence: 0,
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'usr-driver-2',
    name: 'Amara Khan',
    email: 'amara.khan@justspuds.uk',
    phone: '07700 900202',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    vehicleType: 'Car',
    vehicleReg: 'HP20 XYZ',
    status: 'ACTIVE',
    isOnline: false,
    pin: '7778',
    rating: 5,
    deliveriesCompletedCount: 0,
    todayEarningsPence: 0,
    createdAt: '2026-02-01T09:30:00.000Z',
  },
  {
    id: 'usr-driver-3',
    name: 'Marcus Brody',
    email: 'marcus.b@justspuds.uk',
    phone: '07700 900203',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    vehicleType: 'E-Bike',
    vehicleReg: 'CARGO-03',
    status: 'ACTIVE',
    isOnline: true,
    pin: '7779',
    rating: 5,
    deliveriesCompletedCount: 0,
    todayEarningsPence: 0,
    createdAt: '2025-11-15T11:00:00.000Z',
  },
]

let channel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(DRIVER_CHANNEL_NAME)
  } catch {
    // Ignore channel initialization failure
  }
}

type DriverListener = (drivers: DriverProfile[]) => void
const driverListeners = new Set<DriverListener>()

function notifyDriverListeners(): void {
  const all = getDrivers()
  driverListeners.forEach((fn) => fn(all))
}

const STARTER_DRIVER_PINS = ['7777', '7778', '7779']

/** Replaces any plaintext PIN with a salted hash. */
function migratePins(list: DriverProfile[]): { list: DriverProfile[]; changed: boolean } {
  let changed = false
  const next = list.map((d) => {
    if (!d.pin) return d
    changed = true
    const { pin, ...rest } = d
    return { ...rest, pinHash: rest.pinHash || saltedPinHash(pin), defaultPin: rest.pinHash ? rest.defaultPin : STARTER_DRIVER_PINS.includes(pin) }
  })
  return { list: next, changed }
}

export function getDrivers(): DriverProfile[] {
  if (typeof window === 'undefined') return migratePins(SEED_DRIVERS).list
  try {
    const raw = localStorage.getItem(DRIVERS_STORAGE_KEY)
    const parsed: DriverProfile[] = raw ? JSON.parse(raw) : SEED_DRIVERS
    const { list, changed } = migratePins(parsed)
    if (!raw || changed) localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(list))
    return list
  } catch {
    return migratePins(SEED_DRIVERS).list
  }
}

/** The active driver whose PIN this is. */
export function findDriverByPin(pin: string): DriverProfile | undefined {
  const clean = pin.trim()
  if (!clean) return undefined
  return getDrivers().find((d) => d.status === 'ACTIVE' && checkSaltedPin(d.pinHash, clean))
}

/** Any driver (active or not) already using this PIN, other than `exceptId`. */
export function isDriverPinTaken(pin: string, exceptId?: string): boolean {
  const clean = pin.trim()
  return getDrivers().some((d) => d.id !== exceptId && checkSaltedPin(d.pinHash, clean))
}

export function setDriverPin(driverId: string, pin: string): DriverProfile | undefined {
  return updateDriverProfile({ id: driverId, pinHash: saltedPinHash(pin), defaultPin: false })
}

export function saveDrivers(drivers: DriverProfile[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(drivers))
    markDocChanged('drivers')
    notifyDriverListeners()
    channel?.postMessage({ type: 'DRIVERS_UPDATED', drivers })
  } catch (err) {
    console.error('Failed to save drivers to storage', err)
  }
}

export function setDriverOnlineStatus(driverId: string, isOnline: boolean): DriverProfile | undefined {
  const drivers = getDrivers()
  let updatedDriver: DriverProfile | undefined
  const updated = drivers.map((d) => {
    if (d.id === driverId) {
      updatedDriver = { ...d, isOnline }
      return updatedDriver
    }
    return d
  })
  saveDrivers(updated)
  return updatedDriver
}

export function updateDriverProfile(driver: Partial<DriverProfile> & { id: string }): DriverProfile | undefined {
  const drivers = getDrivers()
  let updatedDriver: DriverProfile | undefined
  const updated = drivers.map((d) => {
    if (d.id === driver.id) {
      updatedDriver = { ...d, ...driver }
      return updatedDriver
    }
    return d
  })
  saveDrivers(updated)
  return updatedDriver
}

export function createDriver(
  driverData: Omit<DriverProfile, 'id' | 'createdAt' | 'deliveriesCompletedCount' | 'todayEarningsPence' | 'rating' | 'pinHash'> & { pin: string },
): DriverProfile {
  const drivers = getDrivers()
  const { pin, ...profile } = driverData
  const newDriver: DriverProfile = {
    ...profile,
    pinHash: saltedPinHash(pin),
    defaultPin: false,
    id: `usr-driver-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    rating: 5.0,
    deliveriesCompletedCount: 0,
    todayEarningsPence: 0,
    createdAt: new Date().toISOString(),
  }
  const updated = [newDriver, ...drivers]
  saveDrivers(updated)
  return newDriver
}

export function recordDriverDeliveryCompletion(driverId: string, deliveryFeePence: number): void {
  const drivers = getDrivers()
  const updated = drivers.map((d) => {
    if (d.id === driverId) {
      const today = localDay()
      return {
        ...d,
        deliveriesCompletedCount: d.deliveriesCompletedCount + 1,
        todayEarningsPence: (d.todayEarningsDate === today ? d.todayEarningsPence : 0) + deliveryFeePence,
        todayEarningsDate: today,
      }
    }
    return d
  })
  saveDrivers(updated)
}

export function subscribeDrivers(fn: DriverListener): () => void {
  driverListeners.add(fn)
  fn(getDrivers())

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'DRIVERS_UPDATED') {
      fn(getDrivers())
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === DRIVERS_STORAGE_KEY) {
      fn(getDrivers())
    }
  }

  channel?.addEventListener('message', handleMessage)
  window.addEventListener('storage', handleStorage)

  return () => {
    driverListeners.delete(fn)
    channel?.removeEventListener('message', handleMessage)
    window.removeEventListener('storage', handleStorage)
  }
}

if (typeof window !== 'undefined') {
  // Drivers sign in on their own phones, so the roster (PINs hashed) is shared with every device.
  registerDoc({
    name: 'drivers',
    storageKey: DRIVERS_STORAGE_KEY,
    notify: () => {
      notifyDriverListeners()
      channel?.postMessage({ type: 'DRIVERS_UPDATED', drivers: getDrivers() })
    },
  })
}
