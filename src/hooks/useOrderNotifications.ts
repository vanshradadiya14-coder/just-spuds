import { useEffect, useRef } from 'react'
import { getCustomerPlacedOrderIds, subscribeOrders } from '../services/orderStore'
import { notifyCustomerOrderUpdate } from '../services/notificationService'

/**
 * Raises a browser notification when one of THIS browser's own orders changes status.
 *
 * Why it lives here rather than inside orderStore.updateOrderStatus: that function
 * runs in whichever tab performed the action — usually the kitchen display. Firing
 * from there would notify the staff member who pressed the button, not the customer
 * waiting on the food. Each browser instead observes the shared order bus and
 * decides what its own user should be told about, which is also exactly how a real
 * backend would push to a customer's device.
 *
 * Before this existed, notificationService was imported by the driver dashboard
 * alone, so customers received nothing at all — including "ready for collection",
 * the one update they actually need.
 */
export function useOrderNotifications(): void {
  // Last status we notified for, per order id. Seeded on the first callback so we
  // don't fire a burst of notifications for pre-existing orders on page load.
  const seen = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    return subscribeOrders((orders) => {
      const ownIds = new Set(getCustomerPlacedOrderIds())
      const own = orders.filter((o) => ownIds.has(o.id))

      // First run: record current state silently.
      if (seen.current === null) {
        seen.current = new Map(own.map((o) => [o.id, o.status]))
        return
      }

      for (const order of own) {
        const previous = seen.current.get(order.id)
        seen.current.set(order.id, order.status)

        // Only notify on an actual transition, never on first sight of an order
        // (the customer just placed it — they're looking at the screen).
        if (previous !== undefined && previous !== order.status) {
          notifyCustomerOrderUpdate(order)
        }
      }
    })
  }, [])
}
