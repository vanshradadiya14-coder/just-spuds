import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode,
} from 'react'
import { MEAL_DEAL, optionPrice, type Product } from '../data/menu'
import { getPromoCodes, getProducts, getStoreSettings, subscribeMenu } from '../services/menuStore'
import {
  getStoreStatus, parseTimeToDecimalHours, DEFAULT_STORE_HOURS,
  type StoreStatus, type StoreHoursConfig,
} from '../data/site'
import { validateDeliveryPostcode, type PostcodeValidationResult } from '../data/deliveryZones'
import { getKitchenPauseState, subscribeKitchenPause, type KitchenPauseState } from '../services/orderStore'
import { getDeliverySettings, subscribeDeliverySettings, type StoreDeliverySettings } from '../services/deliverySettingsStore'

export type ModifierType = 'regular' | 'extra' | 'no' | 'lite' | 'side'

export interface CartLineModifier {
  name: string
  type: ModifierType
  pricePence?: number
}

export interface CartLine {
  lineId: string
  productId: string
  name: string
  /** Base product price in pence. */
  base: number
  /** Paid extras chosen. */
  extras: string[]
  /** Fresh salad selection chosen. */
  salads?: string[]
  /** Free sauces chosen. */
  sauces: string[]
  meal: boolean
  mealDrink?: string
  mealSnack?: string
  notes?: string
  image: string
  category: Product['category']
  qty: number
  conversationalModifiers?: CartLineModifier[]
  station?: 'spuds' | 'grill' | 'drinks' | 'pass'
  isRush?: boolean
  /** Manager-authorised unit price that replaces base + extras (till only). */
  priceOverridePence?: number
  priceOverrideReason?: string
}

export interface ToastMessage {
  id: string
  title: string
  subtitle?: string
  image?: string
}

export const lineUnitPrice = (l: CartLine): number => {
  if (typeof l.priceOverridePence === 'number') return l.priceOverridePence
  const extrasCost = l.extras.reduce((n, id) => n + optionPrice(id, l.category), 0)
  const modifierCost = (l.conversationalModifiers || []).reduce((acc, m) => {
    return acc + (m.pricePence || (m.type === 'extra' ? 100 : 0))
  }, 0)
  return l.base + extrasCost + modifierCost + (l.meal ? MEAL_DEAL.price : 0)
}

type Action =
  | { type: 'add'; line: Omit<CartLine, 'lineId'> }
  | { type: 'remove'; lineId: string }
  | { type: 'qty'; lineId: string; qty: number }
  | { type: 'toggleMeal'; lineId: string; drink?: string; snack?: string }
  | { type: 'updateMeal'; lineId: string; drink: string; snack: string }
  | { type: 'reorder'; lines: CartLine[] }
  | { type: 'clear' }

const CART_STORAGE_KEY = 'just_spuds_cart_v2'
const ADDRESS_STORAGE_KEY = 'just_spuds_address_v2'
const FULFILMENT_STORAGE_KEY = 'just_spuds_fulfilment_v2'

const keyOf = (l: Omit<CartLine, 'lineId'>) =>
  [
    l.productId,
    [...l.extras].sort().join('+'),
    [...(l.salads || [])].sort().join('+'),
    [...l.sauces].sort().join('+'),
    l.meal ? `meal:${l.mealDrink || 'default'}:${l.mealSnack || 'default'}` : '',
    l.notes ? `notes:${l.notes.trim()}` : '',
  ].join('::')

function loadPersistedCart(): CartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    const allProds = getProducts()
    return parsed.filter((l) => allProds.some((p) => p.id === l.productId))
  } catch {
    return []
  }
}

function loadPersistedAddress(): DeliveryAddress {
  const fallback: DeliveryAddress = { street: '', postcode: 'HP20 1SN', instructions: '' }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(ADDRESS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function loadPersistedFulfilment(): FulfilmentType {
  if (typeof window === 'undefined') return 'pickup'
  try {
    const raw = localStorage.getItem(FULFILMENT_STORAGE_KEY)
    return raw === 'delivery' ? 'delivery' : 'pickup'
  } catch {
    return 'pickup'
  }
}

function reducer(state: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case 'add': {
      const id = keyOf(action.line)
      if (state.some((l) => l.lineId === id)) {
        return state.map((l) =>
          l.lineId === id ? { ...l, qty: Math.min(99, l.qty + action.line.qty) } : l,
        )
      }
      return [...state, { ...action.line, lineId: id }]
    }
    case 'remove':
      return state.filter((l) => l.lineId !== action.lineId)
    case 'qty':
      return action.qty <= 0
        ? state.filter((l) => l.lineId !== action.lineId)
        : state.map((l) => (l.lineId === action.lineId ? { ...l, qty: Math.min(99, action.qty) } : l))
    case 'toggleMeal': {
      const target = state.find((l) => l.lineId === action.lineId)
      if (!target) return state

      const nextMeal = !target.meal
      const updatedLine = {
        ...target,
        meal: nextMeal,
        mealDrink: nextMeal ? (action.drink || target.mealDrink || MEAL_DEAL.drinkOptions[0].id) : undefined,
        mealSnack: nextMeal ? (action.snack || target.mealSnack || MEAL_DEAL.snackOptions[0].id) : undefined,
      }
      const nextId = keyOf(updatedLine)

      const twin = state.find((l) => l.lineId === nextId && l.lineId !== action.lineId)
      if (twin) {
        return state
          .filter((l) => l.lineId !== action.lineId)
          .map((l) => (l.lineId === nextId ? { ...l, qty: Math.min(99, l.qty + target.qty) } : l))
      }

      return state.map((l) => (l.lineId === action.lineId ? { ...updatedLine, lineId: nextId } : l))
    }
    case 'updateMeal': {
      const target = state.find((l) => l.lineId === action.lineId)
      if (!target || !target.meal) return state
      const updatedLine = {
        ...target,
        mealDrink: action.drink,
        mealSnack: action.snack,
      }
      const nextId = keyOf(updatedLine)
      const twin = state.find((l) => l.lineId === nextId && l.lineId !== action.lineId)
      if (twin) {
        return state
          .filter((l) => l.lineId !== action.lineId)
          .map((l) => (l.lineId === nextId ? { ...l, qty: Math.min(99, l.qty + target.qty) } : l))
      }
      return state.map((l) => (l.lineId === action.lineId ? { ...updatedLine, lineId: nextId } : l))
    }
    case 'reorder':
      return action.lines
    case 'clear':
      return []
  }
}

export interface DeliveryAddress {
  street: string
  postcode: string
  instructions?: string
}

export type FulfilmentType = 'pickup' | 'delivery'

export interface AddOptions {
  extras?: string[]
  salads?: string[]
  sauces?: string[]
  meal?: boolean
  mealDrink?: string
  mealSnack?: string
  notes?: string
  qty?: number
}

interface CartApi {
  lines: CartLine[]
  count: number
  rawSubtotal: number
  subtotal: number
  discount: number
  promoCode: string | null
  applyPromo: (code: string) => { ok: boolean; message: string }
  removePromo: () => void
  fulfilment: FulfilmentType
  setFulfilment: (mode: FulfilmentType) => void
  timingMode: 'asap' | 'scheduled'
  setTimingMode: (mode: 'asap' | 'scheduled') => void
  scheduleDate: string
  setScheduleDate: (date: string) => void
  scheduleTime: string
  setScheduleTime: (time: string) => void
  isScheduled: boolean
  formattedScheduledTime: string
  collectionTime: string
  setCollectionTime: (time: string) => void
  deliveryTime: string
  setDeliveryTime: (time: string) => void
  deliveryAddress: DeliveryAddress
  setDeliveryAddress: (address: DeliveryAddress | ((prev: DeliveryAddress) => DeliveryAddress)) => void
  postcodeValidation: PostcodeValidationResult
  storeStatus: StoreStatus
  kitchenPause: KitchenPauseState
  isOnlineOrderingEnabled: boolean
  orderingPausedTitle: string
  orderingPausedMessage: string
  deliveryFee: number
  freeDeliveryThreshold: number
  minOrderPence: number
  isMinOrderMet: boolean
  finalTotal: number
  kitchenNotes: string
  setKitchenNotes: (notes: string) => void
  isOpen: boolean
  bump: number
  toasts: ToastMessage[]
  dismissToast: (id: string) => void
  add: (product: Product, opts?: AddOptions) => void
  reorder: (lines: CartLine[]) => void
  remove: (lineId: string) => void
  setQty: (lineId: string, qty: number) => void
  toggleMeal: (lineId: string) => void
  updateMeal: (lineId: string, drink: string, snack: string) => void
  clear: () => void
  open: () => void
  close: () => void
}

const Ctx = createContext<CartApi | null>(null)

export const DEFAULT_FREE_DELIVERY_THRESHOLD = 2500
export const DEFAULT_DELIVERY_FEE = 400

/**
 * Trading hours as configured by the admin console, falling back to the defaults
 * if unset or malformed. This is the bridge that makes the admin hours editor
 * actually govern whether orders are accepted — getStoreStatus takes hours as a
 * parameter because site.ts cannot import menuStore without a circular dependency.
 */
function readConfiguredHours(date: Date = new Date()): StoreHoursConfig {
  try {
    const settings = getStoreSettings()
    const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' })
    const daily = settings.weeklyHours?.[dayName]
    
    if (daily) {
      return {
        openHour: parseTimeToDecimalHours(daily.openTime) ?? DEFAULT_STORE_HOURS.openHour,
        closeHour: parseTimeToDecimalHours(daily.closeTime) ?? DEFAULT_STORE_HOURS.closeHour,
        isClosed: daily.isClosed,
      }
    }

    return {
      openHour: parseTimeToDecimalHours(settings.openTime) ?? DEFAULT_STORE_HOURS.openHour,
      closeHour: parseTimeToDecimalHours(settings.closeTime) ?? DEFAULT_STORE_HOURS.closeHour,
      isClosed: false,
    }
  } catch {
    return DEFAULT_STORE_HOURS
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, undefined, loadPersistedCart)
  const [isOpen, setOpen] = useState(false)
  const [bump, setBump] = useState(0)
  const [promoCode, setPromoCode] = useState<string | null>(null)
  const [fulfilment, setFulfilment] = useState<FulfilmentType>(loadPersistedFulfilment)
  const [timingMode, setTimingMode] = useState<'asap' | 'scheduled'>('asap')
  const [scheduleDate, setScheduleDate] = useState('Today')
  const [scheduleTime, setScheduleTime] = useState('1:00 PM')
  const [collectionTime, setCollectionTime] = useState('ASAP (~15 mins)')
  const [deliveryTime, setDeliveryTime] = useState('ASAP (~25-35 mins)')
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress>(loadPersistedAddress)
  const [kitchenNotes, setKitchenNotes] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [kitchenPause, setKitchenPauseState] = useState<KitchenPauseState>(() => getKitchenPauseState())
  const [deliverySettings, setDeliverySettingsState] = useState<StoreDeliverySettings>(() => getDeliverySettings())
  const [storeStatus, setStoreStatus] = useState<StoreStatus>(() =>
    getStoreStatus(new Date(), getKitchenPauseState(), readConfiguredHours(new Date())),
  )

  useEffect(() => {
    const refresh = () =>
      setStoreStatus(getStoreStatus(new Date(), getKitchenPauseState(), readConfiguredHours(new Date())))

    const unsubPause = subscribeKitchenPause((kp) => {
      setKitchenPauseState(kp)
      setStoreStatus(getStoreStatus(new Date(), kp, readConfiguredHours(new Date())))
    })
    const unsubDeliverySettings = subscribeDeliverySettings((ds) => {
      setDeliverySettingsState(ds)
    })
    const unsubMenu = subscribeMenu(refresh)
    const timer = setInterval(refresh, 15000)

    return () => {
      unsubPause()
      unsubDeliverySettings()
      unsubMenu()
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines))
    } catch (err) {
      console.warn('Unable to persist cart to localStorage', err)
    }
  }, [lines])

  useEffect(() => {
    try {
      localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(deliveryAddress))
    } catch { /* ignore */ }
  }, [deliveryAddress])

  useEffect(() => {
    try {
      localStorage.setItem(FULFILMENT_STORAGE_KEY, fulfilment)
    } catch { /* ignore */ }
  }, [fulfilment])

  const postcodeValidation = useMemo(() => {
    return validateDeliveryPostcode(deliveryAddress.postcode)
  }, [deliveryAddress.postcode])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const pushToast = useCallback((title: string, subtitle?: string, image?: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev.slice(-2), { id, title, subtitle, image }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3800)
  }, [])

  const add = useCallback((product: Product, opts: AddOptions = {}) => {
    const qty = opts.qty ?? 1
    const isMeal = opts.meal ?? false
    dispatch({
      type: 'add',
      line: {
        productId: product.id,
        name: product.name,
        base: product.price,
        extras: opts.extras ?? [],
        salads: opts.salads ?? [],
        sauces: opts.sauces ?? [],
        meal: isMeal,
        mealDrink: isMeal ? (opts.mealDrink || MEAL_DEAL.drinkOptions[0].id) : undefined,
        mealSnack: isMeal ? (opts.mealSnack || MEAL_DEAL.snackOptions[0].id) : undefined,
        notes: opts.notes?.trim() || undefined,
        image: product.image,
        category: product.category,
        qty,
      },
    })
    setBump((b) => b + 1)
    pushToast(`Added to order (${qty}x)`, product.name, product.image)
  }, [pushToast])

  const reorder = useCallback((pastLines: CartLine[]) => {
    const allProds = getProducts()
    const validLines = pastLines.filter((l) => allProds.some((p) => p.id === l.productId))
    dispatch({ type: 'reorder', lines: validLines })
    setOpen(true)
    pushToast('Previous Order Loaded ⚡', `${validLines.length} items added to your bag`)
  }, [pushToast])

  const rawSubtotal = useMemo(() => {
    return lines.reduce((n, l) => n + lineUnitPrice(l) * l.qty, 0)
  }, [lines])

  const discount = useMemo(() => {
    if (!promoCode) return 0
    const promos = getPromoCodes()
    const activePromo = promos.find((p) => p.code.toUpperCase() === promoCode.toUpperCase() && p.active)
    if (!activePromo) return 0
    if (activePromo.discountPercent) {
      return Math.round(rawSubtotal * (activePromo.discountPercent / 100))
    }
    if (activePromo.discountPence) {
      return Math.min(activePromo.discountPence, rawSubtotal)
    }
    return 0
  }, [promoCode, rawSubtotal])

  const subtotal = Math.max(0, rawSubtotal - discount)

  const activeFreeThreshold = deliverySettings.freeDeliveryThresholdPence

  const activeBaseFee = deliverySettings.deliveryFeePence

  const minOrderPence = fulfilment === 'delivery'
    ? deliverySettings.minOrderPence
    : 0

  const isMinOrderMet = fulfilment !== 'delivery' || rawSubtotal >= minOrderPence

  const deliveryFee = useMemo(() => {
    if (fulfilment !== 'delivery') return 0
    if (lines.length === 0) return 0
    return rawSubtotal >= activeFreeThreshold ? 0 : activeBaseFee
  }, [fulfilment, lines.length, rawSubtotal, activeFreeThreshold, activeBaseFee])

  const finalTotal = subtotal + (fulfilment === 'delivery' ? deliveryFee : 0)

  const applyPromo = useCallback((code: string) => {
    const trimmed = code.trim().toUpperCase()
    const promos = getPromoCodes()
    const found = promos.find((p) => p.code.toUpperCase() === trimmed && p.active)

    if (found) {
      if (found.minOrderPence && rawSubtotal < found.minOrderPence) {
        return {
          ok: false,
          message: `Minimum order for code "${trimmed}" is £${(found.minOrderPence / 100).toFixed(2)}.`,
        }
      }
      setPromoCode(trimmed)
      pushToast('Voucher Applied! 🎉', found.description)
      return { ok: true, message: `Voucher ${trimmed} applied: ${found.description}` }
    }
    return { ok: false, message: 'Invalid promo code. Try "SPUD10" or "FIRSTSPUD"!' }
  }, [pushToast, rawSubtotal])

  const removePromo = useCallback(() => {
    setPromoCode(null)
  }, [])

  const toggleMeal = useCallback((lineId: string) => {
    dispatch({ type: 'toggleMeal', lineId })
    pushToast('Meal Deal Updated 🥤', 'Drink + Snack combo toggled')
  }, [pushToast])

  const updateMeal = useCallback((lineId: string, drink: string, snack: string) => {
    dispatch({ type: 'updateMeal', lineId, drink, snack })
    pushToast('Meal Deal Updated 🥤', 'Drink & Snack combo saved')
  }, [pushToast])

  const handleSetFulfilment = useCallback((mode: FulfilmentType) => {
    setFulfilment(mode)
    if (mode === 'delivery') {
      pushToast('🛵 Home Delivery Selected', 'Delivering to Aylesbury & surrounding areas')
    } else {
      pushToast('🛍️ Store Pick Up Selected', 'Collection ready at Market Square')
    }
  }, [pushToast])

  const handleSetTimingMode = useCallback((mode: 'asap' | 'scheduled') => {
    setTimingMode(mode)
    if (mode === 'scheduled') {
      pushToast('📅 Order Scheduling Active', 'Select your preferred date & time')
    } else {
      pushToast('⚡ Instant ASAP Mode', 'Kitchen will prepare immediately')
    }
  }, [pushToast])

  const isScheduled = timingMode === 'scheduled'
  const formattedScheduledTime = isScheduled
    ? `${scheduleDate} @ ${scheduleTime}`
    : (fulfilment === 'delivery' ? 'ASAP (~25-35 mins)' : 'ASAP (~15 mins)')

  const value = useMemo<CartApi>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    rawSubtotal,
    subtotal,
    discount,
    promoCode,
    applyPromo,
    removePromo,
    fulfilment,
    setFulfilment: handleSetFulfilment,
    timingMode,
    setTimingMode: handleSetTimingMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    isScheduled,
    formattedScheduledTime,
    collectionTime,
    setCollectionTime,
    deliveryTime,
    setDeliveryTime,
    deliveryAddress,
    setDeliveryAddress,
    postcodeValidation,
    storeStatus,
    kitchenPause,
    isOnlineOrderingEnabled: deliverySettings.isOnlineOrderingEnabled,
    orderingPausedTitle: deliverySettings.orderingPausedTitle,
    orderingPausedMessage: deliverySettings.orderingPausedMessage,
    deliveryFee,
    freeDeliveryThreshold: activeFreeThreshold,
    minOrderPence,
    isMinOrderMet,
    finalTotal,
    kitchenNotes,
    setKitchenNotes,
    isOpen,
    bump,
    toasts,
    dismissToast,
    add,
    reorder,
    remove: (lineId) => dispatch({ type: 'remove', lineId }),
    setQty: (lineId, qty) => dispatch({ type: 'qty', lineId, qty }),
    toggleMeal,
    updateMeal,
    clear: () => {
      dispatch({ type: 'clear' })
      setPromoCode(null)
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
  }), [
    lines, rawSubtotal, subtotal, discount, promoCode, applyPromo, removePromo,
    fulfilment, handleSetFulfilment, timingMode, handleSetTimingMode, scheduleDate,
    scheduleTime, isScheduled, formattedScheduledTime, collectionTime, deliveryTime,
    deliveryAddress, postcodeValidation, storeStatus, kitchenPause, deliverySettings, deliveryFee, activeFreeThreshold,
    minOrderPence, isMinOrderMet, finalTotal, kitchenNotes, isOpen, bump, toasts,
    dismissToast, add, reorder, toggleMeal, updateMeal,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
