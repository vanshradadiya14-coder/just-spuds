/**
 * DRIVER MANAGEMENT STORE & DISPATCH FLEET REGISTRY
 * --------------------------------------------------
 * Handles driver profiles, online/offline availability states, PIN authentications,
 * driver metrics (earnings, completed orders, ratings), and cross-tab synchronization.
 */

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
  pin: string
  rating: number
  deliveriesCompletedCount: number
  todayEarningsPence: number
  createdAt: string
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
    rating: 4.95,
    deliveriesCompletedCount: 142,
    todayEarningsPence: 3850,
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
    rating: 4.88,
    deliveriesCompletedCount: 98,
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
    rating: 4.92,
    deliveriesCompletedCount: 215,
    todayEarningsPence: 4600,
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'))
  }
}

export function getDrivers(): DriverProfile[] {
  if (typeof window === 'undefined') return SEED_DRIVERS
  try {
    const raw = localStorage.getItem(DRIVERS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(SEED_DRIVERS))
      return SEED_DRIVERS
    }
    return JSON.parse(raw)
  } catch {
    return SEED_DRIVERS
  }
}

export function saveDrivers(drivers: DriverProfile[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(drivers))
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

export function createDriver(driverData: Omit<DriverProfile, 'id' | 'createdAt' | 'deliveriesCompletedCount' | 'todayEarningsPence' | 'rating'>): DriverProfile {
  const drivers = getDrivers()
  const newDriver: DriverProfile = {
    ...driverData,
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
      return {
        ...d,
        deliveriesCompletedCount: d.deliveriesCompletedCount + 1,
        todayEarningsPence: d.todayEarningsPence + deliveryFeePence,
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
