import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAllActiveCustomerOrders, subscribeOrders, type Order } from '../services/orderStore'
import { cx } from '../utils/format'

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
    <div className="w-full border-t border-white/10 bg-ink/90 px-4 py-1.5 text-white shadow-sm backdrop-blur-xl transition-all">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Left: Active Order Status & Multi-Order Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>

          <span className="font-body text-[11px] font-bold tracking-wide text-white/80 flex items-center gap-1.5">
            <span>{details.emoji}</span>
            <span className="uppercase text-white/50">Order #{order.shortId}:</span>
            <span className="text-amber-400">{details.label}</span>
          </span>

          {/* Inline Multi-order selector pills (If 2+ active orders exist) */}
          {activeOrders.length > 1 && (
            <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Switch:</span>
              {activeOrders.map((ord, i) => (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className={cx(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold transition-all',
                    i === selectedIndex
                      ? 'bg-white/15 text-white'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  )}
                >
                  #{ord.shortId}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Compact Track CTA & Close */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to={`/track/${order.id}`}
            className="group flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-400 hover:text-ink"
          >
            <span>Track Order</span>
            <span className="opacity-70 group-hover:opacity-100 transition-opacity">→</span>
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
