/**
 * REAL-TIME ORDER STORE & EVENT BUS
 * ---------------------------------
 * Handles persistent orders, real-time cross-tab synchronization via BroadcastChannel,
 * live status state transitions, cancellation with refund logic, and admin sound alerts.
 */
import { lineUnitPrice, type CartLine } from '../hooks/useCart'
import { SITE } from '../data/site'
import { recordDriverDeliveryCompletion } from './driverStore'
import {
  syncOrderToSupabase,
  fetchSupabaseOrders,
  initSupabaseOrderSubscription,
  sourceFromShortId,
} from './supabaseOrderSync'
import { logAuditEvent } from './auditStore'
import { getSharedAudioContext } from './printerBridge'
import { deductStockForOrderLines, restoreStockForOrderLines } from './menuStore'
import { recordOnlineOrderInShift } from './tillStore'

export type OrderSource = 'WEBSITE' | 'TILL' | 'PHONE' | 'STAFF'

export type OrderStatus =
  | 'placed'                  // Customer placed order, waiting for kitchen acceptance
  | 'accepted'                // Kitchen accepted, ticket queued
  | 'baking'                  // In oven / preparing fresh toppings
  | 'quality_check'           // Quality check & packing into insulated thermal bag
  | 'ready_for_delivery'      // Dispatched to drivers, waiting for a driver to claim
  | 'driver_assigned'         // Driver claimed the delivery, heading to store
  | 'driver_arrived_at_store' // Driver arrived at Market Square store
  | 'order_collected'         // Driver collected the hot food from counter
  | 'out_for_delivery'        // Courier on the road to customer doorstep
  | 'ready_for_pickup'        // Ready on pickup rack at Market Square counter
  | 'delivered'               // Handed to customer at door with PIN verification
  | 'collected'               // Handed to customer at counter
  | 'failed_delivery'         // Delivery attempt failed (customer unreachable, etc.)
  | 'cancelled'               // Cancelled with refund

export type PaymentMethod = 'in_store' | 'driver_device' | 'cash' | 'card' | 'apple_pay' | 'google_pay' | 'complimentary' | 'split'

export interface DriverInfo {
  id: string
  name: string
  avatar: string
  rating: number
  deliveriesCount: number
  vehicle: string
  plate: string
  phone: string
}

export interface DeliveryDetails {
  deliveryPin?: string // 4-digit code e.g. '4821'
  dispatchRequestedAt?: string
  assignedDriverId?: string
  assignedDriverName?: string
  assignedDriverPhone?: string
  assignedDriverVehicle?: string
  assignedDriverReg?: string
  assignedDriverAvatar?: string
  assignedAt?: string
  arrivedAtStoreAt?: string
  collectedAt?: string
  deliveredAt?: string
  driverCancelReason?: string
  driverCancelNote?: string
  failedReason?: string
  failedNote?: string
  rejectedDriverIds?: string[]
}

export interface CustomerInfo {
  name: string
  phone: string
  email: string
  streetAddress?: string
  postcode?: string
  instructions?: string
  buzzerNumber?: string
  tableNumber?: string
}

export interface SplitTenderPortion {
  method: 'cash' | 'card' | 'online'
  amount: number // in pence
  note?: string
  paidAt?: string
}

export interface OrderPayment {
  method: PaymentMethod
  status: 'paid' | 'pending_delivery' | 'pending_store' | 'pending_cash' | 'refunded'
  cardLast4?: string
  cardBrand?: string
  subtotal: number
  deliveryFee: number
  serviceFee: number
  tip: number
  discount: number
  total: number
  paidAt?: string
  paidNote?: string
  splitDetails?: SplitTenderPortion[]
  manualAdjustment?: {
    originalTotal: number
    adjustedTotal: number
    reason: string
    adjustedBy: string
    adjustedAt: string
  }
}

export interface OrderCancellation {
  cancelledAt: string
  reason: string
  refundAmount: number
  refundStatus: 'processed' | 'not_applicable'
}

export interface OrderReview {
  rating: number
  tags: string[]
  comment: string
  createdAt: string
}

export interface OrderManualOverride {
  id: string
  overriddenAt: string
  overriddenBy: string
  reason: string
  changesSummary: string
  previousStatus?: OrderStatus
}

export interface OrderAdminNote {
  id: string
  timestamp: string
  author: string
  note: string
}

export interface Order {
  id: string
  shortId: string
  source: OrderSource
  createdAt: string
  status: OrderStatus
  fulfilment: 'delivery' | 'pickup'
  customer: CustomerInfo
  lines: CartLine[]
  payment: OrderPayment
  estimatedDeliveryTime: string
  etaMinutes: number
  isScheduled?: boolean
  scheduledFor?: string
  scheduleDate?: string
  scheduleTime?: string
  kitchenNotes?: string
  driver?: DriverInfo
  deliveryDetails?: DeliveryDetails
  cancellation?: OrderCancellation
  review?: OrderReview
  manualOverrides?: OrderManualOverride[]
  adminNotes?: OrderAdminNote[]
  timeline: {
    status: OrderStatus
    timestamp: string
    title: string
    description: string
  }[]
}

const STORAGE_KEY = 'just_spuds_orders_v1'
const ACTIVE_ORDER_ID_KEY = 'just_spuds_active_order_id'
const STOCK_KEY = 'just_spuds_menu_stock_v1'

// Production orders initialize empty so only real placed orders appear in portals
const INITIAL_ORDERS: Order[] = []

// Broadcast channel for instantaneous cross-tab state syncing
let channel: BroadcastChannel | null = null
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel('just_spuds_orders_sync')
  }
} catch {
  // Fallback gracefully
}

type OrderListener = (orders: Order[]) => void
const listeners = new Set<OrderListener>()

export function getStoredOrders(): Order[] {
  if (typeof window === 'undefined') return INITIAL_ORDERS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_ORDERS))
      return INITIAL_ORDERS
    }
    const parsed: Order[] = JSON.parse(raw)
    // Cleanse any legacy demo orders from previous sessions
    const cleaned = parsed.filter(
      (o) => !o.id.startsWith('ord-demo-') && o.customer?.email !== 'sarah.m@example.com'
    )
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    }
    return cleaned.map((o) => (o.source ? o : { ...o, source: inferLegacySource(o) }))
  } catch {
    return INITIAL_ORDERS
  }
}

/**
 * Orders saved before `source` existed carry no prefix on their short id
 * (plain `JS-12345`), so fall back to the kitchen-note tag the till used to stamp.
 */
function inferLegacySource(o: Order): OrderSource {
  const fromId = sourceFromShortId(o.shortId)
  if (fromId !== 'WEBSITE') return fromId
  if (o.kitchenNotes?.includes('POS TILL')) return 'TILL'
  if (o.kitchenNotes?.includes('PHONE')) return 'PHONE'
  return 'WEBSITE'
}

export function saveOrders(orders: Order[]): void {
  if (typeof window === 'undefined') return
  try {
    const prev = getStoredOrders()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
    notifyListeners(orders)
    channel?.postMessage({ type: 'ORDERS_UPDATED', orders })

    // Background sync changed/added order to Supabase
    const changed = orders.find((ord) => {
      const old = prev.find((p) => p.id === ord.id)
      return (
        !old ||
        old.status !== ord.status ||
        old.timeline.length !== ord.timeline.length ||
        old.driver?.id !== ord.driver?.id ||
        old.deliveryDetails?.assignedDriverId !== ord.deliveryDetails?.assignedDriverId
      )
    })
    if (changed) {
      syncOrderToSupabase(changed)
    } else if (orders[0]) {
      syncOrderToSupabase(orders[0])
    }
  } catch (err) {
    console.error('Failed to save orders to localStorage', err)
  }
}

function notifyListeners(orders: Order[]): void {
  listeners.forEach((fn) => fn(orders))
}

// Initial sync with Supabase and real-time subscription
if (typeof window !== 'undefined') {
  fetchSupabaseOrders().then((remoteOrders) => {
    if (remoteOrders && remoteOrders.length > 0) {
      const local = getStoredOrders()
      const map = new Map<string, Order>()
      local.forEach((o) => map.set(o.id, o))
      remoteOrders.forEach((o) => map.set(o.id, o))
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        notifyListeners(merged)
      } catch {
        // ignore quota
      }
    }
  })

  initSupabaseOrderSubscription(
    (remoteOrder) => {
      const current = getStoredOrders()
      const idx = current.findIndex((o) => o.id === remoteOrder.id)
      let updated: Order[]
      if (idx >= 0) {
        updated = [...current]
        updated[idx] = remoteOrder
      } else {
        updated = [remoteOrder, ...current]
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        notifyListeners(updated)
        channel?.postMessage({ type: 'ORDERS_UPDATED', orders: updated })
      } catch {
        // ignore
      }
    },
    (deletedId) => {
      const current = getStoredOrders()
      const updated = current.filter((o) => o.id !== deletedId)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        notifyListeners(updated)
        channel?.postMessage({ type: 'ORDERS_UPDATED', orders: updated })
      } catch {
        // ignore
      }
    }
  )
}

export function subscribeOrders(fn: OrderListener): () => void {
  listeners.add(fn)
  fn(getStoredOrders())

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'ORDERS_UPDATED') {
      fn(getStoredOrders())
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      fn(getStoredOrders())
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

export function getOrderById(id: string): Order | undefined {
  const orders = getStoredOrders()
  return orders.find((o) => o.id === id || o.shortId.toLowerCase() === id.toLowerCase())
}

export function getActiveCustomerOrderId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACTIVE_ORDER_ID_KEY)
}

export function getAllActiveCustomerOrders(): Order[] {
  if (typeof window === 'undefined') return []
  const placedIds = getCustomerPlacedOrderIds()
  const activeSingleId = getActiveCustomerOrderId()
  const allIds = Array.from(new Set([...(activeSingleId ? [activeSingleId] : []), ...placedIds]))
  
  const activeOrders: Order[] = []
  for (const id of allIds) {
    const ord = getOrderById(id)
    if (ord && ord.status !== 'delivered' && ord.status !== 'collected' && ord.status !== 'cancelled') {
      activeOrders.push(ord)
    }
  }
  return activeOrders
}

export function setActiveCustomerOrderId(id: string | null): void {
  if (typeof window === 'undefined') return
  if (id) {
    localStorage.setItem(ACTIVE_ORDER_ID_KEY, id)
    addCustomerPlacedOrderId(id)
  } else {
    localStorage.removeItem(ACTIVE_ORDER_ID_KEY)
  }
}

const CUSTOMER_PLACED_ORDERS_KEY = 'just_spuds_customer_placed_order_ids_v1'

export function getCustomerPlacedOrderIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOMER_PLACED_ORDERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function addCustomerPlacedOrderId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = getCustomerPlacedOrderIds()
    if (!current.includes(id)) {
      const updated = [id, ...current].slice(0, 50)
      localStorage.setItem(CUSTOMER_PLACED_ORDERS_KEY, JSON.stringify(updated))
    }
  } catch {
    // Ignore storage quota
  }
}

/** Stops this browser treating the given orders as "my orders" (test orders placed from a staff screen). */
export function forgetCustomerOrderIds(ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    const remaining = getCustomerPlacedOrderIds().filter((id) => !ids.includes(id))
    localStorage.setItem(CUSTOMER_PLACED_ORDERS_KEY, JSON.stringify(remaining))
    const active = getActiveCustomerOrderId()
    if (active && ids.includes(active)) localStorage.removeItem(ACTIVE_ORDER_ID_KEY)
  } catch {
    // Ignore storage quota
  }
}

export function isCustomerAuthorizedForOrder(order: Order, isStaffUser = false): boolean {
  if (isStaffUser) return true
  const activeId = getActiveCustomerOrderId()
  if (activeId && (order.id === activeId || order.shortId.toLowerCase() === activeId.toLowerCase())) {
    return true
  }
  const placedIds = getCustomerPlacedOrderIds()
  return placedIds.includes(order.id) || placedIds.includes(order.shortId)
}

export function verifyCustomerOrderAccess(order: Order, verificationInput: string): boolean {
  if (!verificationInput || !verificationInput.trim()) return false
  const cleanInput = verificationInput.trim().toLowerCase().replace(/\s+/g, '')

  // 1. Check full phone or last 4 digits of phone
  const cleanPhone = (order.customer.phone || '').replace(/\D/g, '')
  const inputDigits = cleanInput.replace(/\D/g, '')
  if (inputDigits.length >= 4 && cleanPhone.endsWith(inputDigits)) {
    addCustomerPlacedOrderId(order.id)
    return true
  }

  // 2. Check delivery postcode (e.g. HP19 8EQ or hp198eq)
  const cleanPostcode = (order.customer.postcode || '').toLowerCase().replace(/\s+/g, '')
  if (cleanPostcode && cleanPostcode === cleanInput) {
    addCustomerPlacedOrderId(order.id)
    return true
  }

  // 3. Check customer email
  const cleanEmail = (order.customer.email || '').toLowerCase().trim()
  if (cleanEmail && cleanEmail === cleanInput) {
    addCustomerPlacedOrderId(order.id)
    return true
  }

  return false
}

export function isOrderAllowedDuringPause(params: {
  isScheduled?: boolean
  scheduleDate?: string
  scheduleTime?: string
}): { allowed: boolean; reason?: string } {
  const pauseState = getKitchenPauseState()
  if (!pauseState.isPaused) {
    return { allowed: true }
  }

  // If order is ASAP live order, it is strictly forbidden while kitchen is paused
  if (!params.isScheduled) {
    const reason = pauseState.reasonText || 'Kitchen is taking a brief pause to catch up with orders.'
    return {
      allowed: false,
      reason: `Kitchen Notice: Live orders are temporarily paused (${reason}). Please choose a scheduled order slot to order ahead.`,
    }
  }

  return { allowed: true }
}

export function createNewOrder(params: {
  lines: CartLine[]
  fulfilment: 'delivery' | 'pickup'
  customer: CustomerInfo
  paymentMethod?: PaymentMethod
  cardLast4?: string
  cardBrand?: string
  subtotal: number
  deliveryFee: number
  serviceFee: number
  tip: number
  discount: number
  total: number
  kitchenNotes?: string
  isScheduled?: boolean
  scheduledFor?: string
  scheduleDate?: string
  scheduleTime?: string
}): Order {
  const pauseCheck = isOrderAllowedDuringPause({
    isScheduled: params.isScheduled,
    scheduleDate: params.scheduleDate,
    scheduleTime: params.scheduleTime,
  })
  if (!pauseCheck.allowed) {
    throw new Error(pauseCheck.reason || 'Kitchen orders are temporarily paused by staff.')
  }

  const shortNum = Math.floor(10000 + Math.random() * 90000)
  const shortId = `JS-W-${shortNum}`
  const id = `ord-${Date.now()}-${shortNum}`
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const isDelivery = params.fulfilment === 'delivery'
  const etaMinutes = params.isScheduled ? 60 : (isDelivery ? 30 : 15)
  const estimatedDeliveryTime = params.isScheduled
    ? (params.scheduledFor || 'Scheduled for Later')
    : (isDelivery ? `~25-35 mins` : `~15 mins`)

  const newOrder: Order = {
    id,
    shortId,
    source: 'WEBSITE',
    createdAt: new Date().toISOString(),
    status: 'placed',
    fulfilment: params.fulfilment,
    customer: params.customer,
    lines: params.lines,
    payment: {
      method: params.paymentMethod || (isDelivery ? 'driver_device' : 'in_store'),
      status: (params.paymentMethod === 'card' || params.paymentMethod === 'apple_pay' || params.paymentMethod === 'google_pay')
        ? 'paid'
        : (params.fulfilment === 'delivery' ? 'pending_delivery' : 'pending_store'),
      cardLast4: params.cardLast4,
      cardBrand: params.cardBrand,
      subtotal: params.subtotal,
      deliveryFee: params.deliveryFee,
      serviceFee: params.serviceFee,
      tip: params.tip,
      discount: params.discount,
      total: params.total,
      paidAt: (params.paymentMethod === 'card' || params.paymentMethod === 'apple_pay' || params.paymentMethod === 'google_pay')
        ? new Date().toISOString()
        : undefined,
    },
    estimatedDeliveryTime,
    etaMinutes,
    isScheduled: params.isScheduled,
    scheduledFor: params.scheduledFor,
    scheduleDate: params.scheduleDate,
    scheduleTime: params.scheduleTime,
    kitchenNotes: params.kitchenNotes,
    driver: undefined,
    timeline: [
      {
        status: 'placed',
        timestamp: nowStr,
        title: params.isScheduled ? `Order Scheduled (${params.scheduledFor})` : 'Order Placed & Verified',
        description: params.paymentMethod === 'cash'
          ? (params.isScheduled ? `Scheduled for ${params.scheduledFor}. Pay upon arrival.` : 'Pay upon delivery / counter')
          : (params.isScheduled ? `Scheduled for ${params.scheduledFor}. Payment approved.` : 'Payment approved and verified.'),
      },
    ],
  }

  const current = getStoredOrders()
  const updated = [newOrder, ...current]
  saveOrders(updated)
  setActiveCustomerOrderId(newOrder.id)

  // Deduct inventory atomically across all retail channels
  deductStockForOrderLines(params.lines, shortId, 'Online Web Customer')

  // Web sales taken while the till is open belong on that shift's Z-report,
  // otherwise the end-of-day figures only ever show counter takings.
  recordOnlineOrderInShift(params.total)

  // Staff screens ring for this order themselves (see services/orderAlerts.ts)
  // — the customer's browser must not play the kitchen alarm.
  return newOrder
}

export function updateOrderStatus(orderId: string, nextStatus: OrderStatus): Order | undefined {
  const current = getStoredOrders()
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  let updatedOrder: Order | undefined

  const updated = current.map((ord) => {
    if (ord.id !== orderId && ord.shortId !== orderId) return ord

    let title = ''
    let description = ''

    switch (nextStatus) {
      case 'accepted':
        title = 'Accepted by Kitchen'
        description = 'Kitchen team printed your ticket.'
        break
      case 'baking':
        title = 'Baking Fresh in Oven'
        description = 'Potatoes oven-baking & toppings split hot.'
        break
      case 'quality_check':
        title = 'Quality Check & Packed'
        description = 'Sealed in insulated thermal packaging.'
        break
      case 'out_for_delivery':
        title = 'Courier On the Way 🛵'
        description = `${ord.driver?.name || 'Driver'} picked up your order and is en route.`
        break
      case 'ready_for_pickup':
        title = 'Ready for Collection 🛍️'
        description = `Piping hot and ready at Market Square pickup counter.`
        break
      case 'delivered':
        title = 'Delivered to Doorstep 🎉'
        description = `Handed to ${ord.customer.name}. Enjoy your meal!`
        break
      case 'collected':
        title = 'Collected at Market Square 🎉'
        description = `Handed to ${ord.customer.name}. Enjoy your meal!`
        break
      case 'cancelled':
        title = 'Order Cancelled'
        description = 'Order was cancelled and refund processed.'
        break
      default:
        title = 'Status Updated'
        description = `Order transitioned to ${nextStatus}.`
    }

    const nextTimeline = [
      ...ord.timeline.filter((t) => t.status !== nextStatus),
      { status: nextStatus, timestamp: nowStr, title, description },
    ]

    const nextEta =
      nextStatus === 'delivered' || nextStatus === 'collected'
        ? 0
        : nextStatus === 'out_for_delivery'
        ? 8
        : nextStatus === 'baking'
        ? 18
        : ord.etaMinutes

    const isCompleted = nextStatus === 'delivered' || nextStatus === 'collected'
    updatedOrder = {
      ...ord,
      status: nextStatus,
      etaMinutes: nextEta,
      timeline: nextTimeline,
      ...(isCompleted && {
        payment: {
          ...ord.payment,
          status: 'paid' as const,
        },
      }),
    }
    return updatedOrder
  })

  if (updatedOrder) {
    saveOrders(updated)
    playKitchenChime()
  }

  return updatedOrder
}

export function advanceOrderStatus(orderId: string): Order | undefined {
  const current = getStoredOrders()
  const order = current.find((o) => o.id === orderId || o.shortId === orderId)
  if (!order) return undefined

  const isDelivery = order.fulfilment === 'delivery'
  let nextStatus: OrderStatus = order.status

  switch (order.status) {
    case 'placed':
      nextStatus = 'accepted'
      break
    case 'accepted':
      nextStatus = 'baking'
      break
    case 'baking':
      nextStatus = isDelivery ? 'out_for_delivery' : 'ready_for_pickup'
      break
    case 'out_for_delivery':
      nextStatus = 'delivered'
      break
    case 'ready_for_pickup':
      nextStatus = 'collected'
      break
  }

  if (nextStatus !== order.status) {
    return updateOrderStatus(order.id, nextStatus)
  }
  return order
}

export function cancelOrder(orderId: string, reason: string): { ok: boolean; order?: Order; message: string } {
  const current = getStoredOrders()
  const order = current.find((o) => o.id === orderId || o.shortId === orderId)

  if (!order) {
    return { ok: false, message: 'Order not found.' }
  }

  if (order.status === 'delivered' || order.status === 'collected') {
    return { ok: false, message: 'Completed orders cannot be cancelled.' }
  }

  if (order.status === 'out_for_delivery') {
    return { ok: false, message: 'Driver is already on the road. Please call the store directly on ' + SITE.phone }
  }

  // When staff/admin cancels an order, money is automatically 100% refunded to customer's payment method
  const refundAmount = order.payment.total

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  let updatedOrder: Order | undefined

  const updated = current.map((ord) => {
    if (ord.id !== order.id) return ord

    const wasPaid = ord.payment.status === 'paid'
    updatedOrder = {
      ...ord,
      status: 'cancelled',
      etaMinutes: 0,
      payment: {
        ...ord.payment,
        status: wasPaid ? 'refunded' : ord.payment.status,
      },
      cancellation: {
        cancelledAt: new Date().toISOString(),
        reason,
        refundAmount: wasPaid ? refundAmount : 0,
        refundStatus: wasPaid ? 'processed' : 'not_applicable',
      },
      timeline: [
        ...ord.timeline,
        {
          status: 'cancelled',
          timestamp: nowStr,
          title: wasPaid ? 'Order Cancelled & Refunded' : 'Order Cancelled',
          description: `Reason: ${reason}. ${wasPaid ? `Automatic refund of £${(refundAmount / 100).toFixed(2)} processed.` : 'Order cancelled (no payment was collected).'}`
        },
      ],
    }
    return updatedOrder
  })

  saveOrders(updated)
  playKitchenChime(true)

  // Restore inventory if food was not prepared
  restoreStockForOrderLines(order.lines, order.shortId, 'Staff/Manager', reason)

  return {
    ok: true,
    order: updatedOrder,
    message: `Order #${order.shortId} cancelled successfully.`,
  }
}

export type TimeRange = 'today' | 'yesterday' | '7days' | '30days' | 'all'

export interface HourlyRushSlot {
  hour: number
  label: string
  count: number
  revenue: number
}

export interface DailyRevenueSlot {
  date: string
  label: string
  revenue: number
  count: number
}

export interface TopProductStat {
  id: string
  name: string
  count: number
  revenue: number
}

export interface TopToppingStat {
  id: string
  name: string
  count: number
}

export interface CRMCustomer {
  id: string
  name: string
  phone: string
  email: string
  address?: string
  postcode?: string
  orderCount: number
  totalSpend: number
  lastOrderDate: string
  favoriteItem: string
}

export interface ZReportData {
  reportNumber: string
  date: string
  generatedAt: string
  orderCount: number
  deliveryCount: number
  pickupCount: number
  cancelledCount: number
  grossFoodSubtotal: number
  deliveryFeesTotal: number
  serviceFeesTotal: number
  discountsTotal: number
  refundedTotal: number
  grandTotal: number
  cardTotal: number
  digitalPayTotal: number
  cashTotal: number
  tipsTotal: number
  vatStandardAmount: number
  netSalesExVat: number
  deliveryRevenue: number
  pickupRevenue: number
}

export interface BusinessAnalytics {
  timeframe: TimeRange
  totalOrders: number
  completedCount: number
  activeCount: number
  cancelledCount: number
  grossRevenue: number
  estimatedFoodCost: number
  estimatedNetProfit: number
  grossMarginPercent: number
  aovPence: number
  deliveryOrdersCount: number
  pickupOrdersCount: number
  deliveryPercent: number
  pickupPercent: number
  tipsTotal: number
  discountsTotal: number
  aggregatorSavingsPence: number
  avgPrepTimeMins: number | null
  hourlyRush: HourlyRushSlot[]
  dailyRevenue: DailyRevenueSlot[]
  topProducts: TopProductStat[]
  topToppings: TopToppingStat[]
  crmCustomers: CRMCustomer[]
}

const TOPPING_NAME_MAP: Record<string, string> = {
  'extra-cheddar': 'Mature British Cheddar',
  'crispy-onions': 'Crispy Fried Shallots',
  'bacon-bits': 'Smoked Crispy Bacon Bits',
  'jalapenos': 'Fiery Pickled Jalapeños',
  'baked-beans': 'Heinz Baked Beanz',
  'tuna-mayo': 'Skipjack Tuna Mayo',
  'chilli-con-carne': 'Slow Cooked Beef Chilli',
  'coronation-chicken': 'Creamy Coronation Chicken',
  'cheesy-broccoli': 'Steamed Cheesy Broccoli',
  'garlic-mayo': 'Garlic & Herb Mayo',
  'chilli-sauce': 'Fiery Sriracha',
  'bbq-sauce': 'Smoky Hickory BBQ',
  'butter': 'Salted Farmhouse Butter',
}

const READY_STATUSES: OrderStatus[] = ['ready_for_pickup', 'ready_for_delivery', 'out_for_delivery', 'collected', 'delivered']

/** Parses a timeline stamp ("13:05" or "1:05 PM") back onto the order's calendar day. */
function timelineStampToDate(stamp: string, createdAt: string): Date | null {
  const m = stamp.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/)
  if (!m) return null
  let hours = parseInt(m[1], 10)
  const minutes = parseInt(m[2], 10)
  const meridiem = m[3]?.toUpperCase()
  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0
  const placed = new Date(createdAt)
  const d = new Date(placed.getFullYear(), placed.getMonth(), placed.getDate(), hours, minutes, 0, 0)
  if (d.getTime() < placed.getTime() - 60_000) d.setDate(d.getDate() + 1) // crossed midnight
  return d
}

/**
 * Minutes from "placed" to "ready" averaged over completed orders — null until
 * there is at least one order to measure. Timeline stamps are wall-clock
 * strings, so anything unparseable is skipped rather than guessed.
 */
export function averagePrepMinutes(orders: Order[]): number | null {
  const samples: number[] = []
  orders.forEach((o) => {
    const ready = o.timeline.find((t) => READY_STATUSES.includes(t.status))
    if (!ready) return
    const readyAt = timelineStampToDate(ready.timestamp, o.createdAt)
    if (!readyAt) return
    const mins = (readyAt.getTime() - new Date(o.createdAt).getTime()) / 60000
    if (mins >= 0 && mins < 6 * 60) samples.push(mins)
  })
  if (samples.length === 0) return null
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
}

export function getDetailedBusinessAnalytics(orders: Order[], timeframe: TimeRange = 'today'): BusinessAnalytics {
  const now = new Date()
  const nowDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = nowDayStart - 24 * 60 * 60 * 1000
  const sevenDaysAgo = nowDayStart - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = nowDayStart - 30 * 24 * 60 * 60 * 1000

  // Filter orders by chosen timeframe
  const filteredOrders = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime()
    if (timeframe === 'today') return t >= nowDayStart
    if (timeframe === 'yesterday') return t >= yesterdayStart && t < nowDayStart
    if (timeframe === '7days') return t >= sevenDaysAgo
    if (timeframe === '30days') return t >= thirtyDaysAgo
    return true // 'all'
  })

  const completedOrders = filteredOrders.filter((o) => ['delivered', 'collected'].includes(o.status))
  const activeOrders = filteredOrders.filter((o) => !['delivered', 'collected', 'cancelled'].includes(o.status))
  const cancelledOrders = filteredOrders.filter((o) => o.status === 'cancelled')

  const grossRevenue = completedOrders.reduce((sum, o) => sum + o.payment.total, 0)
  const deliveryOrders = completedOrders.filter((o) => o.fulfilment === 'delivery')
  const pickupOrders = completedOrders.filter((o) => o.fulfilment === 'pickup')

  const deliveryOrdersCount = deliveryOrders.length
  const pickupOrdersCount = pickupOrders.length
  const completedCount = completedOrders.length

  const deliveryPercent = completedCount > 0 ? Math.round((deliveryOrdersCount / completedCount) * 100) : 0
  const pickupPercent = completedCount > 0 ? 100 - deliveryPercent : 0

  const tipsTotal = completedOrders.reduce((sum, o) => sum + (o.payment.tip || 0), 0)
  const discountsTotal = completedOrders.reduce((sum, o) => sum + (o.payment.discount || 0), 0)

  // AOV: average order value
  const aovPence = completedCount > 0 ? Math.round(grossRevenue / completedCount) : 0

  // Estimated food cost (approx 32% COGS in jacket potato shop)
  const estimatedFoodCost = Math.round(grossRevenue * 0.32)
  const estimatedNetProfit = Math.max(0, grossRevenue - estimatedFoodCost)
  const grossMarginPercent = grossRevenue > 0 ? Math.round((estimatedNetProfit / grossRevenue) * 100) : 0

  // Aggregator savings vs Deliveroo / Uber Eats (average 30% commission saved)
  const aggregatorSavingsPence = Math.round(grossRevenue * 0.30)

  // Hourly rush hour distribution (11:00 to 22:00)
  const hoursMap: Record<number, { count: number; revenue: number }> = {}
  for (let h = 11; h <= 22; h++) {
    hoursMap[h] = { count: 0, revenue: 0 }
  }

  filteredOrders.filter((o) => o.status !== 'cancelled').forEach((ord) => {
    const d = new Date(ord.createdAt)
    const h = d.getHours()
    if (hoursMap[h]) {
      hoursMap[h].count += 1
      hoursMap[h].revenue += ord.payment.total
    }
  })

  const hourlyRush: HourlyRushSlot[] = Object.keys(hoursMap).map((hStr) => {
    const h = parseInt(hStr, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const displayH = h > 12 ? h - 12 : h
    return {
      hour: h,
      label: `${displayH} ${ampm}`,
      count: hoursMap[h].count,
      revenue: hoursMap[h].revenue,
    }
  })

  // Daily revenue trend (last 7 days)
  const daysMap: Record<string, { label: string; revenue: number; count: number }> = {}
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  // Keyed by *local* calendar day so a late-evening order lands on the right bar.
  const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  for (let i = 6; i >= 0; i--) {
    const dateObj = new Date(nowDayStart - i * 24 * 60 * 60 * 1000)
    const label = `${dayNames[dateObj.getDay()]} ${dateObj.getDate()}`
    daysMap[localDayKey(dateObj)] = { label, revenue: 0, count: 0 }
  }

  orders.forEach((o) => {
    if (o.status === 'cancelled') return
    const dateKey = localDayKey(new Date(o.createdAt))
    if (daysMap[dateKey]) {
      daysMap[dateKey].count += 1
      daysMap[dateKey].revenue += o.payment.total
    }
  })

  const dailyRevenue: DailyRevenueSlot[] = Object.keys(daysMap).map((date) => ({
    date,
    label: daysMap[date].label,
    revenue: daysMap[date].revenue,
    count: daysMap[date].count,
  }))

  // Top products ranking
  const productMap: Record<string, { name: string; count: number; revenue: number }> = {}
  filteredOrders.filter((o) => o.status !== 'cancelled').forEach((o) => {
    o.lines.forEach((l) => {
      if (!productMap[l.productId]) {
        productMap[l.productId] = { name: l.name, count: 0, revenue: 0 }
      }
      productMap[l.productId].count += l.qty
      productMap[l.productId].revenue += lineUnitPrice(l) * l.qty
    })
  })

  const topProducts: TopProductStat[] = Object.keys(productMap)
    .map((id) => ({
      id,
      name: productMap[id].name,
      count: productMap[id].count,
      revenue: productMap[id].revenue,
    }))
    .sort((a, b) => b.count - a.count)

  // Top toppings ranking
  const extrasMap: Record<string, number> = {}

  filteredOrders.filter((o) => o.status !== 'cancelled').forEach((o) => {
    o.lines.forEach((l) => {
      l.extras.forEach((ext) => {
        extrasMap[ext] = (extrasMap[ext] || 0) + l.qty
      })
    })
  })

  const topToppings: TopToppingStat[] = Object.keys(extrasMap)
    .map((id) => ({
      id,
      name: TOPPING_NAME_MAP[id] || id,
      count: extrasMap[id],
    }))
    .sort((a, b) => b.count - a.count)

  // Customer CRM aggregation
  const customerMap: Record<string, CRMCustomer> = {}
  orders.forEach((o) => {
    if (o.status === 'cancelled') return
    // Walk-in till sales carry a placeholder identity — they are not a customer record.
    if (o.customer.email?.endsWith('@justspuds.uk') || o.customer.phone === '01296 423456') return
    const key = o.customer.email.toLowerCase().trim() || o.customer.phone.trim()
    if (!customerMap[key]) {
      customerMap[key] = {
        id: `crm-${key.replace(/[^a-z0-9]/gi, '')}`,
        name: o.customer.name,
        phone: o.customer.phone,
        email: o.customer.email,
        address: o.customer.streetAddress,
        postcode: o.customer.postcode,
        orderCount: 0,
        totalSpend: 0,
        lastOrderDate: o.createdAt,
        favoriteItem: o.lines[0]?.name || 'British Classic',
      }
    }
    customerMap[key].orderCount += 1
    customerMap[key].totalSpend += o.payment.total
    if (new Date(o.createdAt).getTime() > new Date(customerMap[key].lastOrderDate).getTime()) {
      customerMap[key].lastOrderDate = o.createdAt
      customerMap[key].favoriteItem = o.lines[0]?.name || customerMap[key].favoriteItem
    }
  })

  const crmCustomers = Object.values(customerMap).sort((a, b) => b.totalSpend - a.totalSpend)

  return {
    timeframe,
    totalOrders: filteredOrders.length,
    completedCount,
    activeCount: activeOrders.length,
    cancelledCount: cancelledOrders.length,
    grossRevenue,
    estimatedFoodCost,
    estimatedNetProfit,
    grossMarginPercent,
    aovPence,
    deliveryOrdersCount,
    pickupOrdersCount,
    deliveryPercent,
    pickupPercent,
    tipsTotal,
    discountsTotal,
    aggregatorSavingsPence,
    avgPrepTimeMins: averagePrepMinutes(completedOrders),
    hourlyRush,
    dailyRevenue,
    topProducts,
    topToppings,
    crmCustomers,
  }
}

export function generateZReport(orders: Order[], dateStr?: string): ZReportData {
  const now = new Date()
  const targetDateStr = dateStr || now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const reportNumber = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-01`

  const completed = orders.filter((o) => ['delivered', 'collected'].includes(o.status))
  const cancelled = orders.filter((o) => o.status === 'cancelled')

  const deliveryOrders = completed.filter((o) => o.fulfilment === 'delivery')
  const pickupOrders = completed.filter((o) => o.fulfilment === 'pickup')

  const grossFoodSubtotal = completed.reduce((sum, o) => sum + o.payment.subtotal, 0)
  const deliveryFeesTotal = completed.reduce((sum, o) => sum + o.payment.deliveryFee, 0)
  const serviceFeesTotal = completed.reduce((sum, o) => sum + o.payment.serviceFee, 0)
  const discountsTotal = completed.reduce((sum, o) => sum + o.payment.discount, 0)
  const tipsTotal = completed.reduce((sum, o) => sum + o.payment.tip, 0)
  const grandTotal = completed.reduce((sum, o) => sum + o.payment.total, 0)
  const refundedTotal = cancelled.reduce((sum, o) => sum + (o.cancellation?.refundAmount || o.payment.total), 0)

  const cardTotal = completed.filter((o) => ['card', 'driver_device', 'in_store'].includes(o.payment.method)).reduce((sum, o) => sum + o.payment.total, 0)
  const digitalPayTotal = completed.filter((o) => ['apple_pay', 'google_pay'].includes(o.payment.method)).reduce((sum, o) => sum + o.payment.total, 0)
  const cashTotal = completed.filter((o) => o.payment.method === 'cash').reduce((sum, o) => sum + o.payment.total, 0)

  const deliveryRevenue = deliveryOrders.reduce((sum, o) => sum + o.payment.total, 0)
  const pickupRevenue = pickupOrders.reduce((sum, o) => sum + o.payment.total, 0)

  // UK Standard Rate VAT 20% portion
  const vatStandardAmount = Math.round((grandTotal / 1.20) * 0.20)
  const netSalesExVat = grandTotal - vatStandardAmount

  return {
    reportNumber,
    date: targetDateStr,
    generatedAt: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    orderCount: completed.length,
    deliveryCount: deliveryOrders.length,
    pickupCount: pickupOrders.length,
    cancelledCount: cancelled.length,
    grossFoodSubtotal,
    deliveryFeesTotal,
    serviceFeesTotal,
    discountsTotal,
    refundedTotal,
    grandTotal,
    cardTotal,
    digitalPayTotal,
    cashTotal,
    tipsTotal,
    vatStandardAmount,
    netSalesExVat,
    deliveryRevenue,
    pickupRevenue,
  }
}

export function downloadCSV(filename: string, csvContent: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportOrdersCSV(orders: Order[]): void {
  const headers = [
    'Order ID',
    'Date & Time',
    'Customer Name',
    'Customer Phone',
    'Customer Email',
    'Fulfillment',
    'Address',
    'Postcode',
    'Items Summary',
    'Subtotal (£)',
    'Delivery Fee (£)',
    'Tip (£)',
    'Discount (£)',
    'Total Paid (£)',
    'Payment Method',
    'Status',
  ]

  const rows = orders.map((o) => {
    const itemsStr = o.lines.map((l) => `${l.qty}x ${l.name}${l.meal ? ' (+Meal Deal)' : ''}`).join('; ')
    return [
      `"${o.shortId}"`,
      `"${new Date(o.createdAt).toLocaleString()}"`,
      `"${o.customer.name.replace(/"/g, '""')}"`,
      `"${o.customer.phone}"`,
      `"${o.customer.email}"`,
      `"${o.fulfilment}"`,
      `"${(o.customer.streetAddress || '').replace(/"/g, '""')}"`,
      `"${o.customer.postcode || ''}"`,
      `"${itemsStr.replace(/"/g, '""')}"`,
      (o.payment.subtotal / 100).toFixed(2),
      (o.payment.deliveryFee / 100).toFixed(2),
      (o.payment.tip / 100).toFixed(2),
      (o.payment.discount / 100).toFixed(2),
      (o.payment.total / 100).toFixed(2),
      `"${o.payment.method}"`,
      `"${o.status}"`,
    ].join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  downloadCSV(`just_spuds_orders_ledger_${new Date().toISOString().split('T')[0]}.csv`, csv)
}

export function exportCustomersCSV(customers: CRMCustomer[]): void {
  const headers = [
    'Customer Name',
    'Phone Number',
    'Email Address',
    'Street Address',
    'Postcode',
    'Total Orders',
    'Lifetime Value (£)',
    'Last Order Date',
    'Favorite Dish',
  ]

  const rows = customers.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`,
    `"${c.phone}"`,
    `"${c.email}"`,
    `"${(c.address || '').replace(/"/g, '""')}"`,
    `"${c.postcode || ''}"`,
    c.orderCount,
    (c.totalSpend / 100).toFixed(2),
    `"${new Date(c.lastOrderDate).toLocaleDateString()}"`,
    `"${c.favoriteItem.replace(/"/g, '""')}"`,
  ].join(','))

  const csv = [headers.join(','), ...rows].join('\n')
  downloadCSV(`just_spuds_customers_crm_${new Date().toISOString().split('T')[0]}.csv`, csv)
}

/**
 * Short confirmation chime for status changes made on this screen (accept,
 * dispatch, driver events). Uses the shared AudioContext — a fresh context per
 * call hits the browser's context cap after a few plays and goes silent.
 */
export function playKitchenChime(isAlert = false) {
  const ctx = getSharedAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = isAlert ? 'sawtooth' : 'sine'
    osc2.type = 'triangle'

    if (isAlert) {
      // Alert chime (lower urgent tones)
      osc1.frequency.setValueAtTime(440, now)
      osc1.frequency.exponentialRampToValueAtTime(330, now + 0.25)
      osc2.frequency.setValueAtTime(554, now)
      osc2.frequency.exponentialRampToValueAtTime(440, now + 0.25)
    } else {
      // Pleasant bright Uber Eats-style incoming order bell
      osc1.frequency.setValueAtTime(587.33, now) // D5
      osc1.frequency.setValueAtTime(880, now + 0.12) // A5
      osc1.frequency.setValueAtTime(1174.66, now + 0.24) // D6

      osc2.frequency.setValueAtTime(440, now)
      osc2.frequency.setValueAtTime(659.25, now + 0.12)
      osc2.frequency.setValueAtTime(880, now + 0.24)
    }

    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.7)
    osc2.stop(now + 0.7)
  } catch {
    // Ignore audio permission edge cases
  }
}

export interface KitchenPauseState {
  isPaused: boolean
  pausedAt?: string
  resumeAt?: string // ISO string or 'manual'
  durationMinutes?: number
  reasonCode: 'rush_capacity' | 'baking_potatoes' | 'equipment_maintenance' | 'weather_delivery' | 'custom'
  reasonText: string
  pausedBy?: string
}

export const PAUSE_REASON_PRESETS = [
  {
    code: 'rush_capacity' as const,
    label: '👨‍🍳 Peak Rush / Kitchen Capacity',
    defaultText: 'Kitchen is currently experiencing peak rush orders. Taking a brief 20-min breather so every dish is served piping hot!',
    suggestedMinutes: 20,
  },
  {
    code: 'baking_potatoes' as const,
    label: '🥔 Fresh Spuds Baking in Oven',
    defaultText: 'A fresh batch of British King Edward jacket potatoes is baking in the oven. Freshly roasted spuds ready in 15 mins!',
    suggestedMinutes: 15,
  },
  {
    code: 'equipment_maintenance' as const,
    label: '⚡ Equipment / Oven Recalibration',
    defaultText: 'Brief scheduled kitchen equipment check & oven temperature calibration in progress.',
    suggestedMinutes: 30,
  },
  {
    code: 'weather_delivery' as const,
    label: '🌧️ Delivery Delay / Adverse Weather',
    defaultText: 'High delivery road delays in Aylesbury area. Temporary delivery hold to keep drivers safe.',
    suggestedMinutes: 45,
  },
  {
    code: 'custom' as const,
    label: '✍️ Custom Staff Reason',
    defaultText: 'Kitchen orders temporarily held by staff.',
    suggestedMinutes: 30,
  },
] as const

const PAUSE_STORAGE_KEY = 'just_spuds_kitchen_pause_v1'

const DEFAULT_PAUSE_STATE: KitchenPauseState = {
  isPaused: false,
  reasonCode: 'rush_capacity',
  reasonText: '',
}

type PauseListener = (pause: KitchenPauseState) => void
const pauseListeners = new Set<PauseListener>()

export function getKitchenPauseState(): KitchenPauseState {
  if (typeof window === 'undefined') return DEFAULT_PAUSE_STATE
  try {
    const raw = localStorage.getItem(PAUSE_STORAGE_KEY)
    if (!raw) return DEFAULT_PAUSE_STATE
    const parsed: KitchenPauseState = JSON.parse(raw)
    
    // Auto-expire if resumeAt timestamp passed
    if (parsed.isPaused && parsed.resumeAt && parsed.resumeAt !== 'manual') {
      const resumeTime = new Date(parsed.resumeAt).getTime()
      if (!isNaN(resumeTime) && Date.now() >= resumeTime) {
        const expiredState: KitchenPauseState = { isPaused: false, reasonCode: parsed.reasonCode, reasonText: '' }
        localStorage.setItem(PAUSE_STORAGE_KEY, JSON.stringify(expiredState))
        return expiredState
      }
    }
    return parsed
  } catch {
    return DEFAULT_PAUSE_STATE
  }
}

export function setKitchenPause(state: KitchenPauseState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PAUSE_STORAGE_KEY, JSON.stringify(state))
    pauseListeners.forEach((fn) => fn(state))
    channel?.postMessage({ type: 'KITCHEN_PAUSE_UPDATED', pause: state })
    if (state.isPaused) {
      playKitchenChime(true)
    }
  } catch (err) {
    console.error('Failed to update kitchen pause state', err)
  }
}

export function resumeKitchenOrders(): void {
  const current = getKitchenPauseState()
  setKitchenPause({
    isPaused: false,
    reasonCode: current.reasonCode,
    reasonText: '',
  })
}

export function subscribeKitchenPause(fn: PauseListener): () => void {
  pauseListeners.add(fn)
  fn(getKitchenPauseState())

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'KITCHEN_PAUSE_UPDATED') {
      fn(getKitchenPauseState())
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PAUSE_STORAGE_KEY) {
      fn(getKitchenPauseState())
    }
  }

  channel?.addEventListener('message', handleMessage)
  window.addEventListener('storage', handleStorage)

  // Periodic check for auto-expiry
  const interval = setInterval(() => {
    fn(getKitchenPauseState())
  }, 10000)

  return () => {
    pauseListeners.delete(fn)
    channel?.removeEventListener('message', handleMessage)
    window.removeEventListener('storage', handleStorage)
    clearInterval(interval)
  }
}

export function getMenuStockOverrides(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STOCK_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

type StockListener = (stock: Record<string, boolean>) => void
const stockListeners = new Set<StockListener>()

/**
 * Subscribe to stock (86'ing) changes — mirrors subscribeOrders.
 *
 * This exists because toggleItemStock was already broadcasting STOCK_UPDATED to
 * zero listeners: every customer surface read getMenuStockOverrides() once on
 * mount (or inline during render) and never learned about later changes. Staff
 * marking an item sold out therefore did nothing for anyone who already had the
 * menu open — they could keep ordering it, and the kitchen received tickets it
 * could not make.
 *
 * Covers same-tab (local listener set), cross-tab (BroadcastChannel) and the
 * storage-event fallback, exactly as the orders bus does.
 */
export function subscribeStock(fn: StockListener): () => void {
  stockListeners.add(fn)
  fn(getMenuStockOverrides())

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'STOCK_UPDATED') fn(getMenuStockOverrides())
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STOCK_KEY) fn(getMenuStockOverrides())
  }

  channel?.addEventListener('message', handleMessage)
  window.addEventListener('storage', handleStorage)

  return () => {
    stockListeners.delete(fn)
    channel?.removeEventListener('message', handleMessage)
    window.removeEventListener('storage', handleStorage)
  }
}

export function toggleItemStock(productId: string, inStock: boolean): void {
  if (typeof window === 'undefined') return
  try {
    const current = getMenuStockOverrides()
    current[productId] = inStock
    localStorage.setItem(STOCK_KEY, JSON.stringify(current))
    channel?.postMessage({ type: 'STOCK_UPDATED', stock: current })
    stockListeners.forEach((fn) => fn(current))
  } catch {
    // Ignore
  }
}

/**
 * Two realistic web orders for testing the alarm, tickets and printer from the
 * admin console. Priced from the lines so the ticket and the total agree.
 */
export function injectSimulatedRushOrders(): Order[] {
  const lines1: CartLine[] = [
    {
      lineId: `line-sim-${Date.now()}-1`,
      productId: 'spud-great-british',
      name: 'The Great British Classic',
      category: 'SPUDS',
      image: '/assets/food/spuds/spud-father.png',
      base: 695,
      extras: ['cheese', 'crispy-onions'],
      sauces: ['spud-special'],
      meal: true,
      mealDrink: 'Coca Cola Can',
      mealSnack: 'Ready Salted Crisps',
      qty: 2,
    },
  ]
  const lines2: CartLine[] = [
    {
      lineId: `line-sim-${Date.now()}-2`,
      productId: 'panini-chicken-bacon',
      name: 'Chicken Breast & Bacon Melt Panini',
      category: 'PANINIS',
      image: '/assets/food/paninis/panini-chicken-bacon.png',
      base: 595,
      extras: ['extra-cheese'],
      sauces: ['chipotle'],
      meal: false,
      qty: 1,
    },
  ]
  const subtotalOf = (lines: CartLine[]) => lines.reduce((acc, l) => acc + lineUnitPrice(l) * l.qty, 0)

  const sub1 = subtotalOf(lines1)
  const sim1 = createNewOrder({
    fulfilment: 'delivery',
    customer: {
      name: 'TEST ORDER — Oliver Thorne',
      phone: '07891 445566',
      email: 'oliver.t@example.co.uk',
      streetAddress: '14 Bicester Road, Meadowcroft',
      postcode: 'HP19 8AA',
    },
    paymentMethod: 'apple_pay',
    cardLast4: '4242',
    cardBrand: 'Visa',
    subtotal: sub1,
    deliveryFee: 399,
    serviceFee: 50,
    tip: 150,
    discount: 0,
    total: sub1 + 399 + 50 + 150,
    kitchenNotes: 'Extra crispy skins, well buttered. Please ring bell, dog is friendly.',
    lines: lines1,
  })

  const sub2 = subtotalOf(lines2)
  const sim2 = createNewOrder({
    fulfilment: 'pickup',
    customer: {
      name: 'TEST ORDER — Sophie Bennett',
      phone: '07722 998811',
      email: 'sophie.b@aylesbury.org',
    },
    paymentMethod: 'google_pay',
    subtotal: sub2,
    deliveryFee: 0,
    serviceFee: 30,
    tip: 100,
    discount: 0,
    total: sub2 + 30 + 100,
    kitchenNotes: 'Cut panini in half please. Collecting on lunch break at 12:45.',
    lines: lines2,
  })

  // They were placed from a staff screen, not by this browser's customer.
  forgetCustomerOrderIds([sim1.id, sim2.id])
  return [sim1, sim2]
}

export function submitOrderReview(
  orderId: string,
  reviewData: { rating: number; tags?: string[]; comment?: string }
): Order | null {
  const orders = getStoredOrders()
  const idx = orders.findIndex(
    (o) => o.id === orderId || o.shortId.toLowerCase() === orderId.toLowerCase()
  )
  if (idx === -1) return null

  const order = orders[idx]
  const newReview: OrderReview = {
    rating: Math.max(1, Math.min(5, reviewData.rating)),
    tags: reviewData.tags || [],
    comment: (reviewData.comment || '').trim(),
    createdAt: new Date().toISOString(),
  }

  const updated: Order = {
    ...order,
    review: newReview,
  }

  orders[idx] = updated
  saveOrders(orders)
  return updated
}

// -------------------------------------------------------------
// DRIVER DISPATCH & ATOMIC FIRST-CLAIM ENGINE
// -------------------------------------------------------------

/**
 * Staff requests driver dispatch when order is ready or in oven.
 */
export function sendOrderToDrivers(orderId: string): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  if (order.fulfilment !== 'delivery') {
    return { ok: false, message: 'Only delivery orders can be dispatched to drivers.' }
  }

  const deliveryPin = order.deliveryDetails?.deliveryPin || Math.floor(1000 + Math.random() * 9000).toString()

  const updated: Order = {
    ...order,
    status: 'ready_for_delivery',
    deliveryDetails: {
      ...order.deliveryDetails,
      deliveryPin,
      dispatchRequestedAt: new Date().toISOString(),
      rejectedDriverIds: order.deliveryDetails?.rejectedDriverIds || [],
    },
    timeline: [
      ...order.timeline.filter((t) => t.status !== 'ready_for_delivery'),
      {
        status: 'ready_for_delivery',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: 'Looking for Courier 🛵',
        description: 'Searching for nearest available Just Spuds delivery partner.',
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime()
  return { ok: true, order: updated, message: 'Order dispatched to online drivers!' }
}

/**
 * ATOMIC FIRST-CLAIM TRANSACTION:
 * Ensures that if multiple drivers press "Accept Delivery" simultaneously,
 * ONLY the first request that writes to storage claims it.
 * All subsequent requests fail with an explicit message.
 */
export function claimDeliveryOrder(
  orderId: string,
  driver: {
    id: string; name: string; phone: string; vehicle: string; plate: string; avatar: string
    /** Real profile stats. Optional so existing callers keep working. */
    rating?: number
    deliveriesCount?: number
  }
): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) {
    return { ok: false, message: 'Order not found or has been cancelled.' }
  }

  const order = orders[idx]

  // Atomic race check
  if (order.deliveryDetails?.assignedDriverId) {
    return {
      ok: false,
      message: `Delivery already assigned to courier ${order.deliveryDetails.assignedDriverName || 'another driver'}.`,
    }
  }

  if (order.status === 'delivered' || order.status === 'cancelled' || order.status === 'collected') {
    return { ok: false, message: 'This order is no longer available for delivery.' }
  }

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const nowIso = new Date().toISOString()

  const updatedDriverInfo: DriverInfo = {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    vehicle: driver.vehicle,
    plate: driver.plate,
    avatar: driver.avatar,
    // Prefer the courier's real profile figures; these were hardcoded, so every
    // customer saw the same invented 4.95 / 140 regardless of who was delivering.
    rating: driver.rating ?? 0,
    deliveriesCount: driver.deliveriesCount ?? 0,
  }

  const updated: Order = {
    ...order,
    status: 'driver_assigned',
    driver: updatedDriverInfo,
    deliveryDetails: {
      // Spread FIRST. This used to set deliveryPin above the spread, so
      // `...order.deliveryDetails` overwrote the freshly generated PIN with the
      // original (often undefined) value and the handover PIN went missing.
      ...order.deliveryDetails,
      deliveryPin: order.deliveryDetails?.deliveryPin || Math.floor(1000 + Math.random() * 9000).toString(),
      assignedDriverId: driver.id,
      assignedDriverName: driver.name,
      assignedDriverPhone: driver.phone,
      assignedDriverVehicle: driver.vehicle,
      assignedDriverReg: driver.plate,
      assignedDriverAvatar: driver.avatar,
      assignedAt: nowIso,
    },
    timeline: [
      ...order.timeline.filter((t) => t.status !== 'driver_assigned'),
      {
        status: 'driver_assigned',
        timestamp: nowStr,
        title: `Courier Assigned: ${driver.name}`,
        description: `${driver.name} accepted your delivery and is heading to Market Square.`,
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime()
  return { ok: true, order: updated, message: `Successfully claimed Order #${order.shortId}!` }
}

/**
 * Driver marks that they arrived at the Just Spuds store.
 */
export function driverArrivedAtStore(orderId: string, driverId: string): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  if (order.deliveryDetails?.assignedDriverId !== driverId) {
    return { ok: false, message: 'You are not the assigned driver for this order.' }
  }

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const updated: Order = {
    ...order,
    status: 'driver_arrived_at_store',
    deliveryDetails: {
      ...order.deliveryDetails,
      arrivedAtStoreAt: new Date().toISOString(),
    },
    timeline: [
      ...order.timeline.filter((t) => t.status !== 'driver_arrived_at_store'),
      {
        status: 'driver_arrived_at_store',
        timestamp: nowStr,
        title: 'Courier Arrived at Store',
        description: 'Waiting at pickup counter for freshly baked spuds.',
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  return { ok: true, order: updated, message: 'Marked arrived at store.' }
}

/**
 * Driver collects the order and sets off to the customer.
 */
export function driverCollectedOrder(orderId: string, driverId: string): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  if (order.deliveryDetails?.assignedDriverId !== driverId) {
    return { ok: false, message: 'You are not the assigned driver for this order.' }
  }

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const updated: Order = {
    ...order,
    status: 'out_for_delivery',
    etaMinutes: 12,
    deliveryDetails: {
      ...order.deliveryDetails,
      collectedAt: new Date().toISOString(),
    },
    timeline: [
      ...order.timeline.filter((t) => t.status !== 'out_for_delivery'),
      {
        status: 'out_for_delivery',
        timestamp: nowStr,
        title: 'Courier On the Way 🛵',
        description: `${order.driver?.name || 'Courier'} has your hot food and is navigating to your address.`,
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  return { ok: true, order: updated, message: 'Order collected! Navigating to customer.' }
}

/**
 * Driver completes delivery with customer's 4-digit PIN (or staff manager override).
 */
export function completeDriverDeliveryWithPin(
  orderId: string,
  driverId: string,
  enteredPin: string,
  bypassPin = false
): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  if (order.deliveryDetails?.assignedDriverId !== driverId && !bypassPin) {
    return { ok: false, message: 'You are not the assigned driver for this order.' }
  }

  // No fallback PIN. This used to default to '1234' while the customer's tracking
  // screen defaulted to '4821', so whenever a PIN had never been generated the two
  // sides disagreed and the doorstep handover simply failed. A missing PIN is a
  // real error state, not a magic number — staff can still override via bypassPin.
  const expectedPin = order.deliveryDetails?.deliveryPin
  if (!bypassPin) {
    if (!expectedPin) {
      return {
        ok: false,
        message: 'This order has no delivery PIN (it was never dispatched to drivers). Ask the store to re-dispatch it, or confirm manually from the kitchen display.',
      }
    }
    if (enteredPin.trim() !== expectedPin) {
      return { ok: false, message: `Incorrect Delivery PIN. Please ask ${order.customer.name} for the 4-digit code shown on their tracking screen.` }
    }
  }

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const updated: Order = {
    ...order,
    status: 'delivered',
    etaMinutes: 0,
    payment: {
      ...order.payment,
      status: 'paid',
    },
    deliveryDetails: {
      ...order.deliveryDetails,
      deliveredAt: new Date().toISOString(),
    },
    timeline: [
      ...order.timeline.filter((t) => t.status !== 'delivered'),
      {
        status: 'delivered',
        timestamp: nowStr,
        title: 'Delivered & Verified (PIN) 🎉',
        description: `Delivered safely to ${order.customer.name} at ${order.customer.streetAddress || 'Aylesbury'}.`,
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)

  // Credit the courier's real profile. recordDriverDeliveryCompletion existed but
  // was never called, so deliveriesCompletedCount and todayEarningsPence never
  // moved — the driver dashboard faked a total from completedDeliveries.length and
  // the admin fleet view disagreed with it. Done here in the store so it is
  // recorded however the delivery was completed.
  const completingDriverId = updated.deliveryDetails?.assignedDriverId
  if (completingDriverId) {
    recordDriverDeliveryCompletion(completingDriverId, updated.payment.deliveryFee || 0)
  }

  playKitchenChime()
  return { ok: true, order: updated, message: 'Delivery completed successfully!' }
}

/**
 * Assigned driver cancels/drops delivery.
 * Re-queues the order back to 'ready_for_delivery' and excludes the dropping driver.
 */
export function cancelDriverDelivery(
  orderId: string,
  driverId: string,
  reason: string,
  note?: string
): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  const rejected = new Set(order.deliveryDetails?.rejectedDriverIds || [])
  rejected.add(driverId)

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const updated: Order = {
    ...order,
    status: 'ready_for_delivery',
    driver: undefined,
    deliveryDetails: {
      ...order.deliveryDetails,
      assignedDriverId: undefined,
      assignedDriverName: undefined,
      driverCancelReason: reason,
      driverCancelNote: note,
      rejectedDriverIds: Array.from(rejected),
    },
    timeline: [
      ...order.timeline,
      {
        status: 'ready_for_delivery',
        timestamp: nowStr,
        title: 'Re-dispatching to Nearby Drivers',
        description: `Previous courier dropped task (${reason}). Finding next available driver.`,
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime()
  return { ok: true, order: updated, message: 'Delivery cancelled and re-queued for other drivers.' }
}

/**
 * Driver marks delivery as failed (customer unreachable, wrong address, etc.).
 */
export function failDriverDelivery(
  orderId: string,
  _driverId: string,
  reason: string,
  note?: string
): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const updated: Order = {
    ...order,
    status: 'failed_delivery',
    deliveryDetails: {
      ...order.deliveryDetails,
      failedReason: reason,
      failedNote: note,
    },
    timeline: [
      ...order.timeline,
      {
        status: 'failed_delivery',
        timestamp: nowStr,
        title: 'Delivery Attempt Failed ⚠️',
        description: `Courier reported: ${reason}. ${note ? `Note: ${note}` : ''}`,
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime(true)
  return { ok: true, order: updated, message: 'Failed delivery reported to staff & admin.' }
}

export interface ManualOrderUpdates {
  status?: OrderStatus
  paymentStatus?: OrderPayment['status']
  paymentMethod?: PaymentMethod
  adjustedTotal?: number
  deliveryPin?: string
  unassignDriver?: boolean
  adminNote?: string
}

/**
 * Super Admin & Store Manager manual order problem resolution.
 * Allows fixing ANY status, payment, driver deadlock, or price error.
 */
export function manualOverrideOrder(
  orderId: string,
  updates: ManualOrderUpdates,
  reason: string,
  actor: string
): Order | undefined {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return undefined

  const order = orders[idx]
  const now = new Date()
  const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const previousStatus = order.status

  const changesList: string[] = []

  let nextStatus = order.status
  if (updates.status && updates.status !== order.status) {
    nextStatus = updates.status
    changesList.push(`Status: ${previousStatus} ➔ ${nextStatus}`)
  }

  const nextPayment = { ...order.payment }
  if (updates.paymentStatus && updates.paymentStatus !== order.payment.status) {
    nextPayment.status = updates.paymentStatus
    if (updates.paymentStatus === 'paid') {
      nextPayment.paidAt = now.toISOString()
    }
    changesList.push(`Payment Status: ${order.payment.status} ➔ ${updates.paymentStatus}`)
  }

  if (updates.paymentMethod && updates.paymentMethod !== order.payment.method) {
    nextPayment.method = updates.paymentMethod
    changesList.push(`Payment Method: ${order.payment.method} ➔ ${updates.paymentMethod}`)
  }

  if (typeof updates.adjustedTotal === 'number' && updates.adjustedTotal !== order.payment.total) {
    const originalTotal = order.payment.total
    nextPayment.total = updates.adjustedTotal
    nextPayment.manualAdjustment = {
      originalTotal,
      adjustedTotal: updates.adjustedTotal,
      reason: reason || 'Manual price adjustment',
      adjustedBy: actor,
      adjustedAt: now.toISOString(),
    }
    changesList.push(`Total: £${(originalTotal / 100).toFixed(2)} ➔ £${(updates.adjustedTotal / 100).toFixed(2)}`)
  }

  const nextDeliveryDetails = { ...order.deliveryDetails }
  let nextDriver = order.driver

  if (updates.deliveryPin && updates.deliveryPin !== order.deliveryDetails?.deliveryPin) {
    nextDeliveryDetails.deliveryPin = updates.deliveryPin
    changesList.push(`PIN updated to ${updates.deliveryPin}`)
  }

  if (updates.unassignDriver) {
    nextDeliveryDetails.assignedDriverId = undefined
    nextDeliveryDetails.assignedDriverName = undefined
    nextDeliveryDetails.assignedDriverPhone = undefined
    nextDeliveryDetails.assignedDriverVehicle = undefined
    nextDeliveryDetails.assignedDriverReg = undefined
    nextDeliveryDetails.assignedDriverAvatar = undefined
    nextDriver = undefined
    if (nextStatus === 'driver_assigned' || nextStatus === 'driver_arrived_at_store' || nextStatus === 'out_for_delivery') {
      nextStatus = 'ready_for_delivery'
    }
    changesList.push('Driver unassigned & return to dispatch queue')
  }

  // Update timeline if status changed
  let nextTimeline = [...order.timeline]
  if (nextStatus !== previousStatus) {
    nextTimeline = [
      ...order.timeline.filter((t) => t.status !== nextStatus),
      {
        status: nextStatus,
        timestamp: nowStr,
        title: `Manual Status Override (${nextStatus.replace(/_/g, ' ')})`,
        description: `Overridden by ${actor}. Reason: ${reason || 'Operational adjustment'}`,
      },
    ]
  }

  const overrideEntry: OrderManualOverride = {
    id: `ovr-${Date.now()}`,
    overriddenAt: now.toISOString(),
    overriddenBy: actor,
    reason: reason.trim() || 'Manual problem resolution',
    changesSummary: changesList.join('; ') || 'Administrative review',
    previousStatus,
  }

  const nextAdminNotes = [...(order.adminNotes || [])]
  if (updates.adminNote?.trim()) {
    nextAdminNotes.push({
      id: `note-${Date.now()}`,
      timestamp: now.toISOString(),
      author: actor,
      note: updates.adminNote.trim(),
    })
  }

  const updated: Order = {
    ...order,
    status: nextStatus,
    payment: nextPayment,
    deliveryDetails: nextDeliveryDetails,
    driver: nextDriver,
    timeline: nextTimeline,
    manualOverrides: [overrideEntry, ...(order.manualOverrides || [])],
    adminNotes: nextAdminNotes,
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime()

  logAuditEvent(
    actor,
    'order.manual_override',
    `#${order.shortId}`,
    `${changesList.join('; ')} | Reason: ${reason}`
  )

  return updated
}

/**
 * Emergency Doorstep PIN Bypass.
 * Allows completing delivery if customer lost their phone or cannot find PIN.
 */
export function bypassDeliveryPin(
  orderId: string,
  reason: string,
  actor: string
): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  const now = new Date()
  const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const updated: Order = {
    ...order,
    status: 'delivered',
    etaMinutes: 0,
    payment: {
      ...order.payment,
      status: 'paid',
      paidAt: now.toISOString(),
      paidNote: `PIN Bypassed by ${actor}: ${reason || 'Customer verified in person'}`,
    },
    deliveryDetails: {
      ...order.deliveryDetails,
      deliveredAt: now.toISOString(),
    },
    timeline: [
      ...order.timeline,
      {
        status: 'delivered',
        timestamp: nowStr,
        title: 'Delivered (Manual PIN Bypass) 🎉',
        description: `Authorized by ${actor}. Reason: ${reason || 'Verified in person without PIN code.'}`,
      },
    ],
    manualOverrides: [
      {
        id: `ovr-pin-${Date.now()}`,
        overriddenAt: now.toISOString(),
        overriddenBy: actor,
        reason: reason || 'PIN lost / bypassed on doorstep',
        changesSummary: 'Marked delivered with PIN bypass',
        previousStatus: order.status,
      },
      ...(order.manualOverrides || []),
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime()

  if (order.deliveryDetails?.assignedDriverId) {
    recordDriverDeliveryCompletion(order.deliveryDetails.assignedDriverId, order.payment.deliveryFee || 400)
  }

  logAuditEvent(actor, 'order.pin_bypass', `#${order.shortId}`, reason || 'Verified delivery without PIN')

  return { ok: true, order: updated, message: `Order #${order.shortId} marked Delivered with PIN Bypass.` }
}

/**
 * Unassigns a courier if vehicle breaks down or driver goes offline,
 * instantly returning the hot food to the open courier dispatch pool.
 */
export function unassignDriverFromOrder(
  orderId: string,
  reason: string,
  actor: string
): { ok: boolean; order?: Order; message: string } {
  const orders = getStoredOrders()
  const idx = orders.findIndex((o) => o.id === orderId || o.shortId === orderId)
  if (idx === -1) return { ok: false, message: 'Order not found.' }

  const order = orders[idx]
  const prevDriver = order.deliveryDetails?.assignedDriverName || order.driver?.name || 'Driver'

  const updated: Order = {
    ...order,
    status: 'ready_for_delivery',
    driver: undefined,
    deliveryDetails: {
      ...order.deliveryDetails,
      assignedDriverId: undefined,
      assignedDriverName: undefined,
      assignedDriverPhone: undefined,
      assignedDriverVehicle: undefined,
      assignedDriverReg: undefined,
      assignedDriverAvatar: undefined,
    },
    timeline: [
      ...order.timeline,
      {
        status: 'ready_for_delivery',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: 'Returned to Dispatch Queue 🛵',
        description: `${prevDriver} unassigned by ${actor}. Re-queued for available couriers. Reason: ${reason || 'Operational re-assignment'}`,
      },
    ],
  }

  orders[idx] = updated
  saveOrders(orders)
  playKitchenChime()

  logAuditEvent(actor, 'order.driver_unassigned', `#${order.shortId}`, `Unassigned ${prevDriver}. Reason: ${reason}`)

  return { ok: true, order: updated, message: `Driver removed from #${order.shortId}. Returned to available queue.` }
}

export interface ManualCounterOrderParams {
  customerName: string
  customerPhone: string
  customerEmail?: string
  fulfilment: 'delivery' | 'pickup'
  streetAddress?: string
  postcode?: string
  lines: CartLine[]
  paymentMethod: PaymentMethod
  paymentStatus: 'paid' | 'pending_store' | 'pending_delivery'
  notes?: string
  discount?: number
  splitDetails?: SplitTenderPortion[]
  buzzerNumber?: string
  tableNumber?: string
  source?: OrderSource
  /** Gratuity added at the card terminal, in pence. */
  tip?: number
}

/**
 * Creates a phone-in or counter walk-in order directly inside Admin / KDS / POS Till.
 */
export function createManualCounterOrder(
  params: ManualCounterOrderParams,
  actor: string
): Order {
  const source: OrderSource = params.source || 'TILL'
  const prefix = source === 'PHONE' ? 'JS-P' : source === 'STAFF' ? 'JS-S' : 'JS-T'
  const shortNum = Math.floor(10000 + Math.random() * 90000)
  const shortId = `${prefix}-${shortNum}`
  const id = `ord-${Date.now()}-${shortNum}`
  const now = new Date()
  const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const subtotal = params.lines.reduce((acc, l) => acc + lineUnitPrice(l) * l.qty, 0)
  const deliveryFee = params.fulfilment === 'delivery' ? 399 : 0
  const serviceFee = params.fulfilment === 'delivery' ? 99 : 0
  const discount = params.discount || 0
  const tip = params.tip || 0
  const total = Math.max(0, subtotal + deliveryFee + serviceFee - discount) + tip

  const deliveryPin = params.fulfilment === 'delivery' ? `${Math.floor(1000 + Math.random() * 9000)}` : undefined

  const specialTags = [
    params.buzzerNumber ? `[🔔 BUZZER #${params.buzzerNumber}]` : null,
    params.tableNumber ? `[🪑 TABLE #${params.tableNumber}]` : null,
    params.notes ? params.notes : null,
  ].filter(Boolean).join(' ')

  const newOrder: Order = {
    id,
    shortId,
    source,
    createdAt: now.toISOString(),
    status: 'accepted',
    fulfilment: params.fulfilment,
    customer: {
      name: params.customerName || 'Counter Customer',
      phone: params.customerPhone || '01296 423456',
      email: params.customerEmail || 'counter@justspuds.uk',
      streetAddress: params.streetAddress,
      postcode: params.postcode,
      instructions: params.notes,
      buzzerNumber: params.buzzerNumber,
      tableNumber: params.tableNumber,
    },
    lines: params.lines,
    payment: {
      method: params.paymentMethod,
      status: params.paymentStatus,
      subtotal,
      deliveryFee,
      serviceFee,
      tip,
      discount,
      total,
      paidAt: params.paymentStatus === 'paid' ? now.toISOString() : undefined,
      paidNote: `Entered via ${source} by ${actor}`,
      splitDetails: params.splitDetails,
    },
    estimatedDeliveryTime: params.fulfilment === 'delivery' ? '~25-35 mins' : '~10-15 mins',
    etaMinutes: params.fulfilment === 'delivery' ? 25 : 12,
    kitchenNotes: specialTags ? `[${source}] ${specialTags}` : `[${source} ORDER]`,
    deliveryDetails: deliveryPin ? { deliveryPin } : undefined,
    timeline: [
      {
        status: 'placed',
        timestamp: nowStr,
        title: 'Manual Order Created 📝',
        description: `Directly entered by ${actor} (${source}).`,
      },
      {
        status: 'accepted',
        timestamp: nowStr,
        title: 'Accepted & Sent to Kitchen 👨‍🍳',
        description:
          params.paymentStatus === 'paid'
            ? 'Ticket printed and queued in KDS.'
            : 'Open check — queued in KDS, payment to be taken at the counter.',
      },
    ],
    adminNotes: [
      {
        id: `note-${Date.now()}`,
        timestamp: now.toISOString(),
        author: actor,
        note: `Created via ${source} entry by ${actor}.`,
      },
    ],
  }

  const current = getStoredOrders()
  const updated = [newOrder, ...current]
  saveOrders(updated)

  // Deduct inventory atomically across all retail channels
  deductStockForOrderLines(params.lines, shortId, actor || 'Staff Cashier')

  playKitchenChime()

  logAuditEvent(
    actor,
    'order.manual_created',
    `#${shortId}`,
    `${source} | ${params.fulfilment.toUpperCase()} | £${(total / 100).toFixed(2)} | Items: ${params.lines.length}`
  )

  return newOrder
}

// -------------------------------------------------------------
// OPEN CHECKS (sent to kitchen, paid later at the counter)
// -------------------------------------------------------------

/** Till / phone orders that were fired to the kitchen but not yet paid. */
export function getOpenTillChecks(): Order[] {
  return getStoredOrders().filter(
    (o) =>
      o.source !== 'WEBSITE' &&
      o.payment.status === 'pending_store' &&
      !['cancelled', 'collected', 'delivered', 'completed'].includes(o.status),
  )
}

export interface SettleOpenOrderParams {
  /** Final lines — may include items added while settling; removed lines must go through voidOpenOrderLine. */
  lines: CartLine[]
  discount: number
  tip?: number
  paymentMethod: PaymentMethod
  splitDetails?: SplitTenderPortion[]
  cardLast4?: string
  actor: string
}

/**
 * Takes payment for an open check. Lines added since the check was sent are
 * deducted from stock here; the original lines were deducted when it was fired.
 */
export function settleOpenOrder(orderId: string, params: SettleOpenOrderParams): Order | undefined {
  const current = getStoredOrders()
  const order = current.find((o) => o.id === orderId || o.shortId === orderId)
  if (!order || order.payment.status === 'paid') return undefined

  const now = new Date()
  const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const subtotal = params.lines.reduce((acc, l) => acc + lineUnitPrice(l) * l.qty, 0)
  const tip = params.tip || 0
  const total = Math.max(0, subtotal + order.payment.deliveryFee + order.payment.serviceFee - params.discount) + tip

  const addedLines = params.lines.filter((l) => !order.lines.some((existing) => existing.lineId === l.lineId))

  const settled: Order = {
    ...order,
    lines: params.lines,
    payment: {
      ...order.payment,
      method: params.paymentMethod,
      status: 'paid',
      subtotal,
      discount: params.discount,
      tip,
      total,
      paidAt: now.toISOString(),
      paidNote: `Open check settled at counter by ${params.actor}`,
      splitDetails: params.splitDetails,
      cardLast4: params.cardLast4,
    },
    timeline: [
      ...order.timeline,
      {
        status: order.status,
        timestamp: nowStr,
        title: 'Paid at Counter 💷',
        description: `${params.paymentMethod.toUpperCase()} • £${(total / 100).toFixed(2)} taken by ${params.actor}${addedLines.length ? ` • ${addedLines.length} item(s) added at settle` : ''}`,
      },
    ],
  }

  saveOrders(current.map((o) => (o.id === order.id ? settled : o)))
  if (addedLines.length > 0) deductStockForOrderLines(addedLines, order.shortId, params.actor)
  logAuditEvent(params.actor, 'order.open_check_settled', `#${order.shortId}`, `${params.paymentMethod} | £${(total / 100).toFixed(2)}`)
  return settled
}

/**
 * Voids one line on an open check (item already fired to the kitchen).
 * Needs a reason and a manager, like Toast's sent-item void. Restores stock.
 *
 * `pendingLines` are items the cashier has rung onto the check at the till but
 * not yet committed (they are normally written at settle). If the void would
 * otherwise empty the check, they are committed first so the customer can swap
 * the one thing they ordered without the KDS ever showing an empty ticket.
 */
export function voidOpenOrderLine(
  orderId: string,
  lineId: string,
  reason: string,
  managerName: string,
  pendingLines: CartLine[] = [],
): { ok: boolean; order?: Order; message: string } {
  const current = getStoredOrders()
  const order = current.find((o) => o.id === orderId || o.shortId === orderId)
  if (!order) return { ok: false, message: 'Order not found.' }
  if (order.payment.status === 'paid') return { ok: false, message: 'Check is already paid - use a refund instead.' }
  const line = order.lines.find((l) => l.lineId === lineId)
  if (!line) return { ok: false, message: 'Line not found on this check.' }

  const newLines = pendingLines.filter((l) => !order.lines.some((existing) => existing.lineId === l.lineId))
  let remaining = order.lines.filter((l) => l.lineId !== lineId)
  let committed: CartLine[] = []
  if (remaining.length === 0) {
    if (newLines.length === 0) return { ok: false, message: 'Last item on the check - void the whole check instead.' }
    remaining = newLines
    committed = newLines
  }

  const now = new Date()
  const subtotal = remaining.reduce((acc, l) => acc + lineUnitPrice(l) * l.qty, 0)
  const total = Math.max(0, subtotal + order.payment.deliveryFee + order.payment.serviceFee - order.payment.discount)
  const replacedWith = committed.map((l) => `${l.qty}x ${l.name}`).join(', ')
  const updated: Order = {
    ...order,
    lines: remaining,
    payment: { ...order.payment, subtotal, total },
    timeline: [
      ...order.timeline,
      {
        status: order.status,
        timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: `Item Voided 🚫 (${line.qty}x ${line.name})`,
        description: `Reason: ${reason}. Authorised by ${managerName}.${replacedWith ? ` Replaced with ${replacedWith}.` : ''}`,
      },
    ],
    adminNotes: [
      ...(order.adminNotes || []),
      { id: `note-${Date.now()}`, timestamp: now.toISOString(), author: managerName, note: `Voided ${line.qty}x ${line.name} - ${reason}` },
    ],
  }
  saveOrders(current.map((o) => (o.id === order.id ? updated : o)))
  restoreStockForOrderLines([line], order.shortId, managerName, `Line void: ${reason}`)
  if (committed.length > 0) deductStockForOrderLines(committed, order.shortId, managerName)
  logAuditEvent(managerName, 'order.line_voided', `#${order.shortId}`, `${line.qty}x ${line.name} | ${reason}`)
  return { ok: true, order: updated, message: `${line.name} voided.` }
}

export type ReceiptChannel = 'print' | 'email' | 'none'

/**
 * Records how the customer asked for their receipt. Email is logged and handed
 * to the till's mail client - there is no outbound mail provider wired up.
 */
export function recordReceiptDelivery(orderId: string, channel: ReceiptChannel, destination: string | undefined, actor: string): void {
  const current = getStoredOrders()
  const order = current.find((o) => o.id === orderId)
  if (!order) return
  const updated: Order = {
    ...order,
    customer: channel === 'email' && destination ? { ...order.customer, email: destination } : order.customer,
    adminNotes: [
      ...(order.adminNotes || []),
      {
        id: `note-${Date.now()}`,
        timestamp: new Date().toISOString(),
        author: actor,
        note: channel === 'none' ? 'Customer declined a receipt.' : channel === 'print' ? 'Receipt printed.' : `Receipt emailed to ${destination}.`,
      },
    ],
  }
  saveOrders(current.map((o) => (o.id === order.id ? updated : o)))
  logAuditEvent(actor, `receipt.${channel}`, `#${order.shortId}`, destination || '')
}

/**
 * Formal manager-authorized refund for completed or open orders.
 */
export function refundOrder(
  orderId: string,
  refundAmountPence: number,
  reason: string,
  managerName: string
): { ok: boolean; order?: Order; message: string } {
  const current = getStoredOrders()
  const order = current.find((o) => o.id === orderId || o.shortId === orderId)
  if (!order) return { ok: false, message: 'Order not found.' }

  const now = new Date()
  const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  let updatedOrder: Order | undefined

  const updated = current.map((ord) => {
    if (ord.id !== order.id) return ord

    const isFullRefund = refundAmountPence >= ord.payment.total
    updatedOrder = {
      ...ord,
      payment: {
        ...ord.payment,
        status: isFullRefund ? 'refunded' : ord.payment.status,
        manualAdjustment: {
          originalTotal: ord.payment.total,
          adjustedTotal: Math.max(0, ord.payment.total - refundAmountPence),
          reason,
          adjustedBy: managerName,
          adjustedAt: now.toISOString(),
        },
      },
      timeline: [
        ...ord.timeline,
        {
          status: ord.status,
          timestamp: nowStr,
          title: `Refund Processed (£${(refundAmountPence / 100).toFixed(2)}) 💸`,
          description: `Authorized by Manager ${managerName}. Reason: ${reason}`,
        },
      ],
      adminNotes: [
        ...(ord.adminNotes || []),
        {
          id: `note-${Date.now()}`,
          timestamp: now.toISOString(),
          author: managerName,
          note: `Manager Refund of £${(refundAmountPence / 100).toFixed(2)}. Reason: ${reason}`,
        },
      ],
    }
    return updatedOrder
  })

  saveOrders(updated)
  logAuditEvent(
    managerName,
    'order.refund_processed',
    `#${order.shortId}`,
    `Refund: £${(refundAmountPence / 100).toFixed(2)} | Reason: ${reason}`
  )

  return { ok: true, order: updatedOrder, message: `Refund of £${(refundAmountPence / 100).toFixed(2)} recorded.` }
}


