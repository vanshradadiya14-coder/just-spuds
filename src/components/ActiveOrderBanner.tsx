import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAllActiveCustomerOrders, subscribeOrders, type Order } from '../services/orderStore'

export default function ActiveOrderBanner() {
  const { pathname } = useLocation()
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [minimized, setMinimized] = useState(false)

  // Hide on dedicated tracking page or internal staff/driver/admin portals
  const isTrackingPage = pathname.startsWith('/track')
  const isInternalPortal = pathname.startsWith('/staff') || pathname.startsWith('/driver') || pathname.startsWith('/admin')

  useEffect(() => {
    const update = () => {
      const orders = getAllActiveCustomerOrders()
      setActiveOrders(orders)
      if (selectedIndex >= orders.length && orders.length > 0) {
        setSelectedIndex(0)
      }
    }

    update()
    const unsub = subscribeOrders(update)
    return unsub
  }, [selectedIndex])

  if (activeOrders.length === 0 || isTrackingPage || isInternalPortal) return null

  const order = activeOrders[selectedIndex] || activeOrders[0]

  // Status mapping
  const getStatusDetails = (status: Order['status']) => {
    switch (status) {
      case 'placed':
      case 'accepted':
        return { label: 'Order Confirmed', emoji: '📋' }
      case 'baking':
        return { label: 'Baking Fresh in Oven', emoji: '🔥' }
      case 'quality_check':
        return { label: 'Thermal Packing', emoji: '📦' }
      case 'ready_for_pickup':
        return { label: 'Ready for Pick Up!', emoji: '🛍️' }
      case 'ready_for_delivery':
      case 'driver_assigned':
      case 'driver_arrived_at_store':
      case 'order_collected':
        return { label: 'Courier Collecting', emoji: '📦' }
      case 'out_for_delivery':
        return { label: 'Out for Delivery', emoji: '🛵' }
      default:
        return { label: 'Processing Order', emoji: '🥔' }
    }
  }

  const details = getStatusDetails(order.status)

  if (minimized) {
    return (
      <div className="fixed bottom-20 right-4 z-40 animate-bounce-subtle sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 rounded-full border border-amber-400/60 bg-ink/95 px-3.5 py-2 text-white shadow-2xl backdrop-blur-xl transition hover:scale-105"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="font-body text-xs font-black text-amber-300">
            {details.emoji} #{order.shortId} &bull; {details.label}
            {activeOrders.length > 1 && ` (${activeOrders.length} orders)`}
          </span>
          <span className="rounded-full bg-amber-400 px-2 py-0.5 font-body text-[10px] font-black text-ink">
            Expand
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="fixed top-20 right-4 z-40 max-w-sm rounded-2xl border border-amber-400/40 bg-[#161310]/95 p-2.5 text-white shadow-2xl backdrop-blur-xl transition-all sm:right-6 animate-rise">
      <div className="flex items-center justify-between gap-3 text-xs">
        {/* Left: Active Order Status & Multi-Order Switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>

          <span className="font-body text-[11px] font-bold tracking-wide text-white/90 truncate flex items-center gap-1.5">
            <span>{details.emoji}</span>
            <span className="text-white/60">#{order.shortId}</span>
            <span className="text-amber-300 font-semibold truncate">{details.label}</span>
          </span>
        </div>

        {/* Right: Track CTA & Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to={`/track/${order.id}`}
            className="group flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 font-body text-[10px] font-black uppercase tracking-wider text-ink transition hover:bg-amber-300 shadow-sm"
          >
            <span>Track</span>
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>

          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="grid h-5 w-5 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition"
            title="Minimize tracking banner"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
