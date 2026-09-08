/**
 * DYNAMIC REACTIVE MENU & STORE CONFIGURATION STORE
 * --------------------------------------------------
 * Handles real-time persistence and cross-tab synchronization of:
 * - Products (Full CRUD: Add, Edit, Delete, Stock 86'ing)
 * - Extra Toppings & Sauces
 * - Promotional Vouchers & Discount Codes
 * - Store Hours, Announcement Banners, and Operational Settings
 */
import {
  PRODUCTS as DEFAULT_PRODUCTS,
  SPUD_EXTRAS as DEFAULT_EXTRAS,
  SAUCES as DEFAULT_SAUCES,
  CATEGORIES as DEFAULT_CATEGORIES,
  type Product,
  type Option,
  type Category,
} from '../data/menu'
import { SITE } from '../data/site'

export interface PromoCode {
  code: string
  discountPercent?: number
  discountPence?: number
  minOrderPence?: number
  description: string
  active: boolean
  expiresAt?: string
}

export interface DailyHours {
  openTime: string
  closeTime: string
  isClosed: boolean
}

export interface StoreSettings {
  storeName: string
  phone: string
  address: string
  openTime: string // Legacy fallback
  closeTime: string // Legacy fallback
  weeklyHours?: Record<string, DailyHours>
  customCategories?: Category[]
  announcementBanner: {
    enabled: boolean
    text: string
    highlight: string
    linkText?: string
    linkHref?: string
  }
  zone1FeePence: number
  zone1FreeThresholdPence: number
  zone2FeePence: number
  zone2FreeThresholdPence: number
}

const PRODUCTS_STORAGE_KEY = 'just_spuds_dynamic_products_v1'
const EXTRAS_STORAGE_KEY = 'just_spuds_dynamic_extras_v1'
const SAUCES_STORAGE_KEY = 'just_spuds_dynamic_sauces_v1'
const PROMOS_STORAGE_KEY = 'just_spuds_dynamic_promos_v1'
const SETTINGS_STORAGE_KEY = 'just_spuds_dynamic_settings_v1'

const DEFAULT_PROMOS: PromoCode[] = [
  {
    code: SITE.offer.code, // "FIRSTSPUD" / "DIRECT10"
    discountPence: 275,
    minOrderPence: 500,
    description: 'Free First Drink Offer (£2.75 discount on orders with drink)',
    active: true,
  },
  {
    code: 'SPUD10',
    discountPercent: 10,
    minOrderPence: 1000,
    description: '10% Off Orders Over £10',
    active: true,
  },
  {
    code: 'LUNCHDEAL',
    discountPence: 195,
    minOrderPence: 700,
    description: 'Free Meal Deal Upgrade (£1.95 discount)',
    active: true,
  },
]

const defaultDailyHours = { openTime: '11:00', closeTime: '22:00', isClosed: false }

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: SITE.name,
  phone: SITE.phone,
  address: 'Market Square, Aylesbury HP20 1EY',
  openTime: '11:00',
  closeTime: '22:00',
  weeklyHours: {
    'Monday': { ...defaultDailyHours },
    'Tuesday': { ...defaultDailyHours, isClosed: true }, // Default Tuesday closed as example, or keep open
    'Wednesday': { ...defaultDailyHours },
    'Thursday': { ...defaultDailyHours },
    'Friday': { ...defaultDailyHours, closeTime: '23:00' },
    'Saturday': { ...defaultDailyHours, closeTime: '23:00' },
    'Sunday': { ...defaultDailyHours, closeTime: '21:00' },
  },
  announcementBanner: {
    enabled: true,
    text: '0% Aggregator Markup — Order Direct & Save Up to £2.50 vs Deliveroo/Uber Eats!',
    highlight: '🔥 Fresh British King Edwards Roasting Daily',
    linkText: 'Order Fresh Now →',
    linkHref: '/menu',
  },
  zone1FeePence: 200,
  zone1FreeThresholdPence: 1500,
  zone2FeePence: 350,
  zone2FreeThresholdPence: 2500,
}

// Broadcast Channel for instantaneous cross-tab synchronization
let menuChannel: BroadcastChannel | null = null
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    menuChannel = new BroadcastChannel('just_spuds_menu_sync')
  }
} catch {
  // Graceful fallback
}

type MenuListener = () => void
const menuListeners = new Set<MenuListener>()

function notifyListeners() {
  menuListeners.forEach((fn) => fn())
  menuChannel?.postMessage({ type: 'MENU_UPDATED', timestamp: Date.now() })
}

// -------------------------------------------------------------
// PRODUCTS CRUD
// -------------------------------------------------------------
export function getProducts(): Product[] {
  if (typeof window === 'undefined') return DEFAULT_PRODUCTS
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS))
      return DEFAULT_PRODUCTS
    }
    return JSON.parse(raw)
  } catch {
    return DEFAULT_PRODUCTS
  }
}

export function getProductById(id: string): Product | undefined {
  const products = getProducts()
  return products.find((p) => p.id === id)
}

export function saveProduct(product: Product): void {
  if (typeof window === 'undefined') return
  try {
    const current = getProducts()
    const index = current.findIndex((p) => p.id === product.id)
    let updated: Product[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = product
    } else {
      updated = [product, ...current]
    }
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to save product', err)
  }
}

export function deleteProduct(productId: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = getProducts()
    const updated = current.filter((p) => p.id !== productId)
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to delete product', err)
  }
}

export function batchAdjustCategoryPrices(category: string, deltaPence: number): number {
  if (typeof window === 'undefined') return 0
  try {
    const current = getProducts()
    let count = 0
    const updated = current.map((p) => {
      if (category === 'ALL' || p.category === category) {
        count++
        const newPrice = Math.max(50, p.price + deltaPence)
        return { ...p, price: newPrice }
      }
      return p
    })
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
    return count
  } catch (err) {
    console.error('Failed to batch adjust prices', err)
    return 0
  }
}

// -------------------------------------------------------------
// EXTRAS / TOPPINGS CRUD
// -------------------------------------------------------------
export function getExtras(): Option[] {
  if (typeof window === 'undefined') return DEFAULT_EXTRAS
  try {
    const raw = localStorage.getItem(EXTRAS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(DEFAULT_EXTRAS))
      return DEFAULT_EXTRAS
    }
    return JSON.parse(raw)
  } catch {
    return DEFAULT_EXTRAS
  }
}

export function saveExtra(extra: Option): void {
  if (typeof window === 'undefined') return
  try {
    const current = getExtras()
    const index = current.findIndex((e) => e.id === extra.id)
    let updated: Option[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = extra
    } else {
      updated = [...current, extra]
    }
    localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to save extra topping', err)
  }
}

export function deleteExtra(extraId: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = getExtras()
    const updated = current.filter((e) => e.id !== extraId)
    localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to delete extra topping', err)
  }
}

/**
 * Single availability check, covering BOTH mechanisms that can take an item off sale.
 *
 * There were two independent systems: staff 86'ing via orderStore's stock overrides
 * (which every customer surface honoured) and the admin product editor's `available`
 * flag (which nothing read at all, so switching it off did nothing). This reconciles
 * them so either route actually removes the item from sale.
 *
 * The stock override is passed in rather than imported to keep menuStore free of a
 * dependency on orderStore.
 */
export function isProductSoldOut(
  product: Pick<Product, 'id' | 'available'>,
  stockOverrides: Record<string, boolean>,
): boolean {
  // An explicit staff toggle is the most recent, most specific signal — it wins.
  if (typeof stockOverrides[product.id] === 'boolean') {
    return stockOverrides[product.id] === false
  }
  return product.available === false
}

// -------------------------------------------------------------
// SAUCES CRUD
// -------------------------------------------------------------
export function getSauces(): Option[] {
  if (typeof window === 'undefined') return DEFAULT_SAUCES
  try {
    const raw = localStorage.getItem(SAUCES_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(SAUCES_STORAGE_KEY, JSON.stringify(DEFAULT_SAUCES))
      return DEFAULT_SAUCES
    }
    return JSON.parse(raw)
  } catch {
    return DEFAULT_SAUCES
  }
}

export function saveSauce(sauce: Option): void {
  if (typeof window === 'undefined') return
  try {
    const current = getSauces()
    const index = current.findIndex((s) => s.id === sauce.id)
    let updated: Option[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = sauce
    } else {
      updated = [...current, sauce]
    }
    localStorage.setItem(SAUCES_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to save sauce', err)
  }
}

export function deleteSauce(sauceId: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = getSauces()
    const updated = current.filter((s) => s.id !== sauceId)
    localStorage.setItem(SAUCES_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to delete sauce', err)
  }
}

// -------------------------------------------------------------
// PROMO CODES CRUD
// -------------------------------------------------------------
export function getPromoCodes(): PromoCode[] {
  if (typeof window === 'undefined') return DEFAULT_PROMOS
  try {
    const raw = localStorage.getItem(PROMOS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(PROMOS_STORAGE_KEY, JSON.stringify(DEFAULT_PROMOS))
      return DEFAULT_PROMOS
    }
    return JSON.parse(raw)
  } catch {
    return DEFAULT_PROMOS
  }
}

export function savePromoCode(promo: PromoCode): void {
  if (typeof window === 'undefined') return
  try {
    const current = getPromoCodes()
    const index = current.findIndex((p) => p.code.toUpperCase() === promo.code.toUpperCase())
    let updated: PromoCode[]
    if (index >= 0) {
      updated = [...current]
      updated[index] = { ...promo, code: promo.code.toUpperCase() }
    } else {
      updated = [{ ...promo, code: promo.code.toUpperCase() }, ...current]
    }
    localStorage.setItem(PROMOS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to save promo code', err)
  }
}

export function deletePromoCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = getPromoCodes()
    const updated = current.filter((p) => p.code.toUpperCase() !== code.toUpperCase())
    localStorage.setItem(PROMOS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
  } catch (err) {
    console.error('Failed to delete promo code', err)
  }
}

// -------------------------------------------------------------
// STORE SETTINGS & ANNOUNCEMENTS
// -------------------------------------------------------------
export function getStoreSettings(): StoreSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS))
      return DEFAULT_SETTINGS
    }
    const parsed = JSON.parse(raw) as StoreSettings
    if (!parsed.weeklyHours) {
      parsed.weeklyHours = DEFAULT_SETTINGS.weeklyHours
    }
    return parsed
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function getCategories(): Category[] {
  const settings = getStoreSettings()
  const custom = settings.customCategories || []
  return [...DEFAULT_CATEGORIES, ...custom]
}

export function saveStoreSettings(settings: StoreSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    notifyListeners()
  } catch (err) {
    console.error('Failed to save store settings', err)
  }
}

// -------------------------------------------------------------
// RESET ALL MENU DATA TO DEFAULTS
// -------------------------------------------------------------
export function resetMenuToDefaults(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS))
    localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(DEFAULT_EXTRAS))
    localStorage.setItem(SAUCES_STORAGE_KEY, JSON.stringify(DEFAULT_SAUCES))
    localStorage.setItem(PROMOS_STORAGE_KEY, JSON.stringify(DEFAULT_PROMOS))
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS))
    notifyListeners()
  } catch (err) {
    console.error('Failed to reset menu', err)
  }
}

// -------------------------------------------------------------
// REACTIVE SUBSCRIPTION
// -------------------------------------------------------------
export function subscribeMenu(fn: MenuListener): () => void {
  menuListeners.add(fn)

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'MENU_UPDATED') {
      fn()
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === PRODUCTS_STORAGE_KEY ||
      event.key === EXTRAS_STORAGE_KEY ||
      event.key === SAUCES_STORAGE_KEY ||
      event.key === PROMOS_STORAGE_KEY ||
      event.key === SETTINGS_STORAGE_KEY
    ) {
      fn()
    }
  }

  menuChannel?.addEventListener('message', handleMessage)
  window.addEventListener('storage', handleStorage)

  return () => {
    menuListeners.delete(fn)
    menuChannel?.removeEventListener('message', handleMessage)
    window.removeEventListener('storage', handleStorage)
  }
}
