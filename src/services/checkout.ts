/**
 * CHECKOUT & PAYMENT INTEGRATION SERVICE
 * --------------------------------------
 * Supports simulated and real payment gateways (Card, Apple Pay, Google Pay, Cash on Delivery).
 * Generates official orders and connects to the live tracking engine.
 *
 * Every ordering rule is enforced HERE, not only in the checkout screen, so a
 * basket that reaches this function through any other route (reorder widget,
 * a stale tab, hand-edited storage) meets the same gate: ordering switched on,
 * trading hours, kitchen pause, stock and channel, delivery area and minimum,
 * and — because a basket can outlive the menu it was built from — the prices
 * are recomputed from the live menu and the voucher is re-validated.
 */
import { lineUnitPrice, type CartLine } from '../hooks/useCart'
import {
  createNewOrder,
  FIRST_ORDER_CODE,
  hasPlacedOrderBefore,
  getKitchenPauseState,
  getMenuStockOverrides,
  isOrderAllowedDuringPause,
  type Order,
  type PaymentMethod,
  type CustomerInfo,
} from './orderStore'
import { isPhoneBlacklisted } from './blacklistStore'
import { getBusinessDetails, getConfiguredHours, getProducts, getPromoCodes, isProductSoldOut } from './menuStore'
import { getDeliverySettings } from './deliverySettingsStore'
import { getStoreStatus } from '../data/site'
import { validateDeliveryPostcode } from '../data/deliveryZones'
import { absoluteScheduleDate, validateScheduledSlot } from '../utils/scheduling'

export type Fulfilment = 'collection' | 'delivery'

/** Packaging & service fee added to every web order (pence). */
export const SERVICE_FEE_PENCE = 49

export interface CheckoutPayload {
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
  /** Voucher the customer applied; re-validated here. */
  promoCode?: string | null
  kitchenNotes?: string
  isScheduled?: boolean
  scheduledFor?: string
  scheduleDate?: string
  scheduleTime?: string
}

export interface CheckoutResult {
  ok: boolean
  orderId?: string
  order?: Order
  redirectUrl?: string
  reason?: string
}

export interface PricedBasket {
  lines: CartLine[]
  subtotal: number
  discount: number
  deliveryFee: number
  serviceFee: number
  tip: number
  total: number
  /** Set when a voucher was sent but no longer applies (inactive, or basket under its minimum). */
  promoRejected?: string
}

/**
 * Re-prices a basket from the live menu. Web lines never carry a manager price
 * override (that is a till-only feature), so one arriving here is dropped.
 */
export function priceBasket(payload: Pick<CheckoutPayload, 'lines' | 'fulfilment' | 'tip' | 'promoCode'>): PricedBasket {
  const products = getProducts()
  const settings = getDeliverySettings()

  const lines: CartLine[] = payload.lines.map((l) => {
    const product = products.find((p) => p.id === l.productId)
    const { priceOverridePence: _override, priceOverrideReason: _reason, ...rest } = l
    return { ...rest, base: product ? product.price : l.base, qty: Math.max(1, Math.floor(l.qty || 1)) }
  })

  const subtotal = lines.reduce((n, l) => n + lineUnitPrice(l) * l.qty, 0)

  let discount = 0
  let promoRejected: string | undefined
  const code = payload.promoCode?.trim().toUpperCase()
  if (code) {
    const promo = getPromoCodes().find((p) => p.code.toUpperCase() === code && p.active)
    if (!promo) promoRejected = `Voucher ${code} is no longer valid.`
    else if (code === FIRST_ORDER_CODE && hasPlacedOrderBefore()) promoRejected = `${code} is for your first order only — welcome back!`
    else if (promo.minOrderPence && subtotal < promo.minOrderPence)
      promoRejected = `Voucher ${code} needs a basket of at least £${(promo.minOrderPence / 100).toFixed(2)}.`
    else if (promo.discountPercent) discount = Math.round(subtotal * (promo.discountPercent / 100))
    else if (promo.discountPence) discount = Math.min(promo.discountPence, subtotal)
  }

  const deliveryFee =
    payload.fulfilment === 'delivery' && lines.length > 0
      ? subtotal >= settings.freeDeliveryThresholdPence
        ? 0
        : settings.deliveryFeePence
      : 0
  const serviceFee = SERVICE_FEE_PENCE
  const tip = Math.max(0, Math.round(payload.tip || 0))
  const total = Math.max(0, subtotal - discount) + deliveryFee + serviceFee + tip

  return { lines, subtotal, discount, deliveryFee, serviceFee, tip, total, promoRejected }
}

/** Everything that can stop a web order, in the order a customer would want to hear it. */
export function validateCheckout(payload: CheckoutPayload, now = new Date()): { ok: true; priced: PricedBasket } | { ok: false; reason: string } {
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return { ok: false, reason: 'Your basket is empty.' }
  }

  const settings = getDeliverySettings()
  if (!settings.isOnlineOrderingEnabled) {
    return { ok: false, reason: settings.orderingPausedMessage }
  }

  // Fraud & abuse prevention check
  const blk = isPhoneBlacklisted(payload.customer.phone)
  if (blk.blacklisted) {
    return {
      ok: false,
      reason: blk.reason || `This phone number requires in-person ordering at our Market Square counter. Please call ${getBusinessDetails().phone}.`,
    }
  }

  const pauseCheck = isOrderAllowedDuringPause({
    isScheduled: payload.isScheduled,
    scheduleDate: payload.scheduleDate,
    scheduleTime: payload.scheduleTime,
  })
  if (!pauseCheck.allowed) {
    return { ok: false, reason: pauseCheck.reason || 'Kitchen orders are temporarily paused by staff.' }
  }

  // Trading hours: ASAP orders must land inside the kitchen's hours (with the
  // last-orders cutoffs); scheduled orders must be a real slot — not in the past,
  // not on a closed day, not after last orders.
  const isDelivery = payload.fulfilment === 'delivery'
  if (payload.isScheduled) {
    const slotProblem = validateScheduledSlot(payload.scheduleDate, payload.scheduleTime, isDelivery ? 'delivery' : 'pickup', now)
    if (slotProblem) return { ok: false, reason: slotProblem }
  } else {
    const status = getStoreStatus(now, getKitchenPauseState(), getConfiguredHours(now))
    if (isDelivery && !status.isAcceptingDelivery) {
      return { ok: false, reason: status.message }
    }
    if (!isDelivery && !status.isAcceptingPickup) {
      return { ok: false, reason: status.message }
    }
  }

  // Central Inventory & Channel Availability check (prevent overselling online)
  const products = getProducts()
  const overrides = getMenuStockOverrides()
  for (const line of payload.lines) {
    const prod = products.find((p) => p.id === line.productId || p.name === line.name)
    if (prod) {
      if (prod.channelVisibility === 'in_store_only') {
        return { ok: false, reason: `"${prod.name}" is an in-store counter exclusive and cannot be ordered online.` }
      }
      const requiredQty = line.qty || 1
      const currentStock = typeof prod.stockQuantity === 'number' ? prod.stockQuantity : 45
      if (isProductSoldOut(prod, overrides) || currentStock < requiredQty) {
        return {
          ok: false,
          reason: `Sorry, "${prod.name}" is currently out of stock or insufficient quantity (Available: ${currentStock}). Please update your cart.`,
        }
      }
    }
  }

  const priced = priceBasket(payload)
  if (priced.promoRejected) {
    return { ok: false, reason: `${priced.promoRejected} Remove the voucher to continue.` }
  }

  if (isDelivery) {
    const postcode = validateDeliveryPostcode(payload.customer.postcode || '')
    if (!postcode.canDeliver) {
      return { ok: false, reason: postcode.message }
    }
    if (!payload.customer.streetAddress?.trim()) {
      return { ok: false, reason: 'Please enter your delivery street address.' }
    }
    if (priced.subtotal < settings.minOrderPence) {
      return { ok: false, reason: `Minimum delivery order is £${(settings.minOrderPence / 100).toFixed(2)}. Please add more items.` }
    }
  }

  return { ok: true, priced }
}

export async function processCheckout(payload: CheckoutPayload, now: Date = new Date()): Promise<CheckoutResult> {
  const check = validateCheckout(payload, now)
  if (!check.ok) return { ok: false, reason: check.reason }
  const { priced } = check

  if (priced.total !== payload.total) {
    // The basket was priced against an older menu (or tampered with); the live
    // price wins and the customer sees the corrected figure on their tracking page.
    console.warn(`Checkout repriced from ${payload.total} to ${priced.total} pence`)
  }

  // Simulate rapid 400ms secure gateway verification (Stripe / SumUp / Apple Pay)
  await new Promise((res) => setTimeout(res, 450))

  // Store the calendar date, not "Tomorrow" — it must still be right after midnight.
  const scheduleDate =
    payload.isScheduled && payload.scheduleDate ? absoluteScheduleDate(payload.scheduleDate, now) : payload.scheduleDate
  const scheduledFor =
    payload.isScheduled && scheduleDate && payload.scheduleTime ? `${scheduleDate} @ ${payload.scheduleTime}` : payload.scheduledFor

  try {
    const order = createNewOrder({
      ...payload,
      scheduleDate,
      scheduledFor,
      lines: priced.lines,
      subtotal: priced.subtotal,
      discount: priced.discount,
      deliveryFee: priced.deliveryFee,
      serviceFee: priced.serviceFee,
      tip: priced.tip,
      total: priced.total,
      paymentMethod: payload.paymentMethod || (payload.fulfilment === 'delivery' ? 'driver_device' : 'in_store'),
    })
    return {
      ok: true,
      orderId: order.id,
      order,
      redirectUrl: `/track/${order.id}`,
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Unable to complete checkout. Please try again.',
    }
  }
}
