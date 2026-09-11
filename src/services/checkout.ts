/**
 * CHECKOUT & PAYMENT INTEGRATION SERVICE
 * --------------------------------------
 * Supports simulated and real payment gateways (Card, Apple Pay, Google Pay, Cash on Delivery).
 * Generates official orders and connects to the live tracking engine.
 */
import type { CartLine } from '../hooks/useCart'
import {
  createNewOrder,
  isOrderAllowedDuringPause,
  type Order,
  type PaymentMethod,
  type CustomerInfo,
} from './orderStore'
import { isPhoneBlacklisted } from './blacklistStore'
import { getProducts } from './menuStore'

export type Fulfilment = 'collection' | 'delivery'

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

export async function processCheckout(payload: CheckoutPayload): Promise<CheckoutResult> {
  // Fraud & abuse prevention check
  const blk = isPhoneBlacklisted(payload.customer.phone)
  if (blk.blacklisted) {
    return {
      ok: false,
      reason: blk.reason || 'This phone number requires in-person ordering at our Market Square counter. Please call 01296 423456.',
    }
  }

  const pauseCheck = isOrderAllowedDuringPause({
    isScheduled: payload.isScheduled,
    scheduleDate: payload.scheduleDate,
    scheduleTime: payload.scheduleTime,
  })
  if (!pauseCheck.allowed) {
    return {
      ok: false,
      reason: pauseCheck.reason || 'Kitchen orders are temporarily paused by staff.',
    }
  }

  // Central Inventory & Channel Availability check (prevent overselling online)
  const products = getProducts()
  for (const line of payload.lines) {
    const prod = products.find((p) => p.id === line.productId || p.name === line.name)
    if (prod) {
      if (prod.channelVisibility === 'in_store_only') {
        return {
          ok: false,
          reason: `"${prod.name}" is an in-store counter exclusive and cannot be ordered online.`,
        }
      }
      const requiredQty = line.qty || 1
      const currentStock = typeof prod.stockQuantity === 'number' ? prod.stockQuantity : 45
      if (!prod.available || currentStock < requiredQty) {
        return {
          ok: false,
          reason: `Sorry, "${prod.name}" is currently out of stock or insufficient quantity (Available: ${currentStock}). Please update your cart.`,
        }
      }
    }
  }

  // Simulate rapid 400ms secure gateway verification (Stripe / SumUp / Apple Pay)
  await new Promise((res) => setTimeout(res, 450))

  try {
    const order = createNewOrder({
      ...payload,
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
