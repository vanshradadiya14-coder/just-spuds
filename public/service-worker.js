/**
 * JUST SPUDS COURIER & KDS SERVICE WORKER
 * ---------------------------------------
 * Handles background push notifications, vibration patterns, and home-screen PWA activation.
 */

const CACHE_NAME = 'just-spuds-pwa-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Handle incoming Web Push events from server / APNs / FCM
self.addEventListener('push', (event) => {
  let data = {
    title: '🛵 New Just Spuds Delivery Available!',
    body: 'A hot spud order is ready for pickup at Market Square. Tap to claim.',
    url: '/driver',
    orderId: 'JS-NEW',
  }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text() || data.body
    }
  }

  const options = {
    body: data.body,
    icon: '/assets/brand/logo.png',
    badge: '/assets/brand/logo.png',
    vibrate: [200, 100, 200, 100, 400],
    tag: `delivery-${data.orderId || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/driver',
    },
    actions: [
      { action: 'open', title: '🚀 Accept & Claim' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

// Handle user clicking the system notification on lock screen or status bar
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const targetUrl = event.notification.data?.url || '/driver'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/driver') && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
