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
import { logAuditEvent } from './auditStore'
import type { CartLine } from '../hooks/useCart'

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
// PRODUCTS CRUD & CENTRAL INVENTORY ENGINE
// -------------------------------------------------------------
function normalizeProduct(p: Product): Product {
  const price = typeof p.price === 'number' ? p.price : 450
  return {
    ...p,
    available: p.available !== false,
    stockQuantity: typeof p.stockQuantity === 'number' ? p.stockQuantity : 45,
    lowStockThreshold: typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 5,
    costPrice: typeof p.costPrice === 'number' ? p.costPrice : Math.round(price * 0.32),
    vatRate: typeof p.vatRate === 'number' ? p.vatRate : 20,
    channelVisibility: p.channelVisibility || 'all',
    barcode: p.barcode || ('5060' + p.id.replace(/\D/g, '').padEnd(8, '0')),
  }
}

export function getProducts(): Product[] {
  if (typeof window === 'undefined') return DEFAULT_PRODUCTS.map(normalizeProduct)
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY)
    if (!raw) {
      const normalizedDefaults = DEFAULT_PRODUCTS.map(normalizeProduct)
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(normalizedDefaults))
      return normalizedDefaults
    }
    const parsed: Product[] = JSON.parse(raw)
    return parsed.map(normalizeProduct)
  } catch {
    return DEFAULT_PRODUCTS.map(normalizeProduct)
  }
}

export function getProductById(id: string): Product | undefined {
  const products = getProducts()
  return products.find((p) => p.id === id)
}

export function getProductByBarcode(barcode: string): Product | undefined {
  if (!barcode) return undefined
  const cleaned = barcode.trim().toLowerCase()
  const products = getProducts()
  return products.find(
    (p) => (p.barcode && p.barcode.toLowerCase() === cleaned) || p.id.toLowerCase() === cleaned
  )
}

/** Products the public storefront may list. In-store exclusives are hidden entirely. */
export function isListedOnline(p: Product): boolean {
  return p.channelVisibility !== 'in_store_only'
}

/** Products the till may ring up. Online-only items never appear on the counter grid. */
export function isListedInStore(p: Product): boolean {
  return p.channelVisibility !== 'online_only'
}

export function getOnlineProducts(): Product[] {
  return getProducts().filter(isListedOnline)
}

/** Direct product-page lookup: an in-store exclusive should 404 online, not render. */
export function getOnlineProductById(id: string): Product | undefined {
  const p = getProductById(id)
  return p && isListedOnline(p) ? p : undefined
}

export function getInStoreProducts(): Product[] {
  return getProducts().filter(isListedInStore)
}

export function isOutOfStock(p: Pick<Product, 'stockQuantity'>): boolean {
  return typeof p.stockQuantity === 'number' && p.stockQuantity <= 0
}

export function getLowStockProducts(): Product[] {
  return getProducts().filter((p) => {
    const qty = p.stockQuantity ?? 0
    const threshold = p.lowStockThreshold ?? 5
    return qty <= threshold
  })
}

/**
 * Atomically deducts stock for paid/confirmed order lines across web, till, and phone.
 */
export function deductStockForOrderLines(lines: CartLine[], orderId: string, actor = 'System'): void {
  if (typeof window === 'undefined' || !lines || lines.length === 0) return
  try {
    const current = getProducts()
    let changed = false
    const deductedItems: string[] = []

    const updated = current.map((prod) => {
      const lineMatches = lines.filter((l) => l.productId === prod.id || l.name === prod.name)
      if (lineMatches.length === 0) return prod

      const totalQty = lineMatches.reduce((sum, l) => sum + (l.qty || 1), 0)
      const currentStock = typeof prod.stockQuantity === 'number' ? prod.stockQuantity : 45
      const newStock = Math.max(0, currentStock - totalQty)
      changed = true
      deductedItems.push(`${prod.name} (-${totalQty} -> ${newStock})`)

      return {
        ...prod,
        stockQuantity: newStock,
        available: newStock > 0 && prod.available,
      }
    })

    if (changed) {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
      notifyListeners()
      logAuditEvent(
        actor,
        'stock.order_deducted',
        `#${orderId}`,
        deductedItems.join(', ')
      )
    }
  } catch (err) {
    console.error('Failed to deduct stock for order', err)
  }
}

/**
 * Restores stock when an order is cancelled or refunded before food preparation.
 */
export function restoreStockForOrderLines(
  lines: CartLine[],
  orderId: string,
  actor = 'Manager',
  reason = 'Order Cancelled / Refunded'
): void {
  if (typeof window === 'undefined' || !lines || lines.length === 0) return
  try {
    const current = getProducts()
    let changed = false
    const restoredItems: string[] = []

    const updated = current.map((prod) => {
      const lineMatches = lines.filter((l) => l.productId === prod.id || l.name === prod.name)
      if (lineMatches.length === 0) return prod

      const totalQty = lineMatches.reduce((sum, l) => sum + (l.qty || 1), 0)
      const currentStock = typeof prod.stockQuantity === 'number' ? prod.stockQuantity : 0
      const newStock = currentStock + totalQty
      changed = true
      restoredItems.push(`${prod.name} (+${totalQty} -> ${newStock})`)

      // Only re-enable if the product was disabled *because* it ran out. A manual
      // 86 by a manager (available=false with stock still on hand) must survive.
      return {
        ...prod,
        stockQuantity: newStock,
        available: prod.available || currentStock <= 0,
      }
    })

    if (changed) {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
      notifyListeners()
      logAuditEvent(
        actor,
        'stock.order_restored',
        `#${orderId}`,
        `Reason: ${reason} | ${restoredItems.join(', ')}`
      )
    }
  } catch (err) {
    console.error('Failed to restore stock for order', err)
  }
}

/**
 * Manual stock quantity adjustment with manager audit trail.
 */
export function adjustProductStock(
  productId: string,
  newQuantity: number,
  actor: string,
  reason: string
): boolean {
  if (typeof window === 'undefined') return false
  try {
    const current = getProducts()
    const index = current.findIndex((p) => p.id === productId)
    if (index < 0) return false

    const oldQty = current[index].stockQuantity ?? 0
    const qty = Math.max(0, newQuantity)
    const updated = [...current]
    updated[index] = {
      ...updated[index],
      stockQuantity: qty,
      // Same rule as restore: a stock-out disables, a restock only re-enables if
      // the stock-out was the reason it went off sale.
      available: qty > 0 && (updated[index].available || oldQty <= 0),
    }

    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
    notifyListeners()
    logAuditEvent(
      actor,
      'stock.manual_adjustment',
      updated[index].name,
      `Changed from ${oldQty} to ${qty} | Reason: ${reason}`
    )
    return true
  } catch (err) {
    console.error('Failed to adjust product stock', err)
    return false
  }
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
  product: Pick<Product, 'id' | 'available' | 'stockQuantity'>,
  stockOverrides: Record<string, boolean>,
): boolean {
  // An explicit staff toggle is the most recent, most specific signal — it wins.
  if (typeof stockOverrides[product.id] === 'boolean') {
    return stockOverrides[product.id] === false
  }
  return product.available === false || isOutOfStock(product)
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
