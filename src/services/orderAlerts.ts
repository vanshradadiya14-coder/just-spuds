/**
 * NEW ONLINE ORDER WATCHER
 * ------------------------
 * Bridges the order store and the alert bus: every web order that is still
 * waiting for a person to accept it raises an alert (and the alarm) on this
 * screen, and an alert is dropped the moment the order is accepted, declined
 * or cancelled anywhere — another tab, another device, the admin console.
 *
 * KDS, till and admin all call `startOnlineOrderAlertWatcher()` so the sound
 * fires wherever staff happen to be looking. It is reference-counted, so
 * several components in one tab share a single order subscription.
 */

import { subscribeOrders, type Order } from './orderStore'
import {
  dismissOrderAlert,
  getActiveAlerts,
  notifyNewOnlineOrder,
  type OnlineOrderAlert,
} from './alertSoundBus'

/** Orders older than this stop ringing (they still sit in the KDS "New" column). */
export const NEW_ORDER_ALERT_WINDOW_MS = 30 * 60 * 1000

export function isAwaitingAcceptance(order: Order, now = Date.now()): boolean {
  if (order.source !== 'WEBSITE' || order.status !== 'placed') return false
  const age = now - new Date(order.createdAt).getTime()
  return age >= 0 ? age < NEW_ORDER_ALERT_WINDOW_MS : true
}

export function toOrderAlert(order: Order): OnlineOrderAlert {
  return {
    orderId: order.id,
    shortId: order.shortId,
    customerName: order.customer.name,
    total: order.payment.total,
    itemsSummary: order.lines.map((l) => `${l.qty}x ${l.name}`).join(', '),
    timestamp: order.createdAt,
    fulfilment: order.fulfilment,
    isScheduled: order.isScheduled,
  }
}

export function reconcileOrderAlerts(orders: Order[], now = Date.now()): void {
  const pending = orders.filter((o) => isAwaitingAcceptance(o, now))
  // Oldest first so the queue reads top-down in the order customers placed them.
  pending
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((o) => notifyNewOnlineOrder(toOrderAlert(o)))

  const pendingIds = new Set(pending.map((o) => o.id))
  getActiveAlerts().forEach((alert) => {
    if (!pendingIds.has(alert.orderId)) dismissOrderAlert(alert.orderId)
  })
}

let refs = 0
let unsubscribe: (() => void) | null = null

export function startOnlineOrderAlertWatcher(): () => void {
  refs += 1
  if (!unsubscribe) unsubscribe = subscribeOrders((orders) => reconcileOrderAlerts(orders))
  let released = false
  return () => {
    if (released) return
    released = true
    refs -= 1
    if (refs <= 0 && unsubscribe) {
      unsubscribe()
      unsubscribe = null
      refs = 0
    }
  }
}
