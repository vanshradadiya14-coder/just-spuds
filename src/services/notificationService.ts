/**
 * WEB PUSH & BROWSER NOTIFICATION SERVICE
 * ----------------------------------------
 * Manages service worker registration, system notification permissions,
 * background lock-screen alerts, vibration patterns, and device Wake Lock.
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  try {
    const reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    return reg
  } catch (err) {
    console.warn('Service worker registration error:', err)
    return null
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  try {
    const res = await Notification.requestPermission()
    return res === 'granted'
  } catch {
    return false
  }
}

export function triggerDeliverySystemAlert(order: { shortId: string; customer?: { postcode?: string }; linesCount?: number }): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  if (Notification.permission === 'granted') {
    const title = `🛵 New Just Spuds Delivery: #${order.shortId}`
    const body = `📍 Area: ${order.customer?.postcode || 'Aylesbury'} • £4.50 Payout + Tips • Tap to open and claim!`

    // Try service worker notification first (works in background / locked phone)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/assets/brand/logo.png',
          badge: '/assets/brand/logo.png',
          tag: `order-${order.shortId}`,
          data: { url: '/driver' },
        } as NotificationOptions)
      })
    } else {
      // Direct Notification constructor fallback
      const notif = new Notification(title, {
        body,
        icon: '/assets/brand/logo.png',
        tag: `order-${order.shortId}`,
      })
      notif.onclick = () => {
        window.focus()
        window.location.href = '/driver'
      }
    }
  }

  // Device vibration pattern (2 short bursts + 1 long)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200, 100, 400])
    } catch {
      // Ignore vibration errors
    }
  }
}

/**
 * Customer-facing copy for each order status worth interrupting someone for.
 *
 * Statuses absent from this map are intentionally silent — internal transitions
 * like quality_check or driver_arrived_at_store are noise to a customer.
 */
const CUSTOMER_STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  accepted: {
    title: 'Order confirmed 👨‍🍳',
    body: 'The kitchen has your ticket and is starting on your order.',
  },
  baking: {
    title: 'Baking now 🔥',
    body: 'Your spuds are in the oven.',
  },
  out_for_delivery: {
    title: 'On the way 🛵',
    body: 'Your courier has collected your order and is heading to you.',
  },
  ready_for_pickup: {
    title: 'Ready for collection 🛍️',
    body: 'Piping hot and waiting at the Market Square counter.',
  },
  delivered: {
    title: 'Delivered 🎉',
    body: 'Enjoy your meal! Tap to rate your order.',
  },
  collected: {
    title: 'Collected 🎉',
    body: 'Enjoy your meal! Tap to rate your order.',
  },
  failed_delivery: {
    title: 'Delivery problem',
    body: 'We couldn’t complete your delivery. Tap for details.',
  },
  cancelled: {
    title: 'Order cancelled',
    body: 'Your order was cancelled and a refund has been processed.',
  },
}

/**
 * Notify the customer that their own order changed status.
 *
 * Deliberately fires from the customer's own browser context (see
 * useOrderNotifications) rather than from orderStore.updateOrderStatus: the tab
 * that should raise a notification is the one belonging to the person being
 * notified, not the staff member who advanced the ticket. That also mirrors how a
 * real backend would push to the customer's device.
 */
export function notifyCustomerOrderUpdate(order: { id: string; shortId: string; status: string }): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const copy = CUSTOMER_STATUS_MESSAGES[order.status]
  if (!copy) return

  const title = copy.title
  const body = `#${order.shortId} — ${copy.body}`
  const url = `/track/${order.id}`

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: '/assets/brand/logo.png',
        badge: '/assets/brand/logo.png',
        // Tagging per order+status means a repeated transition replaces rather
        // than stacks, so the customer never gets a wall of duplicates.
        tag: `order-status-${order.id}-${order.status}`,
        data: { url },
      } as NotificationOptions)
    })
  } else {
    const notif = new Notification(title, {
      body,
      icon: '/assets/brand/logo.png',
      tag: `order-status-${order.id}-${order.status}`,
    })
    notif.onclick = () => {
      window.focus()
      window.location.href = url
    }
  }
}

let wakeLockSentinel: { release?: () => Promise<void> } | null = null

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false
  }
  try {
    const nav = navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } }
    wakeLockSentinel = await nav.wakeLock.request('screen')
    return true
  } catch {
    return false
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  if (wakeLockSentinel?.release) {
    try {
      await wakeLockSentinel.release()
      wakeLockSentinel = null
    } catch {
      // Ignore
    }
  }
}
