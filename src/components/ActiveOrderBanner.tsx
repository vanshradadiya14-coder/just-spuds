import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { useModalOpen } from '../hooks/useModalOpen'
import { getAllActiveCustomerOrders, subscribeOrders, type Order } from '../services/orderStore'

// Bottom-right, just above whichever bottom bar is showing (phone tab bar or the
// desktop order rail) — never over the header, page headings or the sticky menu rail.
// (--consent-h lifts it above the cookie bar while that is showing.)
const PLACEMENT = 'fixed z-40 bottom-[calc(max(var(--dock-h,0px),var(--orderbar-h,0px))+var(--consent-h,0px)+10px)]'

function statusDetails(status: Order['status']) {
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

export default function ActiveOrderBanner() {
  const { pathname } = useLocation()
  const [activeOrders, setActiveOrders] = useState<Order[]>(() => getAllActiveCustomerOrders())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [minimized, setMinimized] = useState(false)
  // Step aside while the basket, a product pop-up or the menu is open.
  const modalOpen = useModalOpen()
  const { isOpen: isBagOpen } = useCart()

  // Hide on dedicated tracking page or internal staff/driver/admin portals
  const isTrackingPage = pathname.startsWith('/track')
  const isInternalPortal = pathname.startsWith('/staff') || pathname.startsWith('/driver') || pathname.startsWith('/admin')

  useEffect(() => {
    const update = () => setActiveOrders(getAllActiveCustomerOrders())
    update()
    return subscribeOrders(update)
  }, [])

  if (activeOrders.length === 0 || isTrackingPage || isInternalPortal || modalOpen || isBagOpen) return null

  const index = selectedIndex < activeOrders.length ? selectedIndex : 0
  const order = activeOrders[index]
  const details = statusDetails(order.status)
  const many = activeOrders.length > 1

  if (minimized) {
    return (
      <div className={`${PLACEMENT} right-3 sm:right-6`}>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-amber-400/60 bg-ink/95 px-3.5 py-2 text-white shadow-2xl backdrop-blur-xl transition hover:scale-105"
          aria-label={`Show order ${order.shortId} status`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="truncate font-body text-xs font-black text-amber-300">
            {details.emoji} {many ? `${activeOrders.length} orders` : details.label}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      role="status"
      className={`${PLACEMENT} inset-x-3 rounded-2xl border border-amber-400/40 bg-[#161310]/95 p-2 text-white shadow-2xl backdrop-blur-xl animate-rise sm:inset-x-auto sm:right-6 sm:w-[380px]`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="relative ml-1 flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>

        <span className="min-w-0 flex-1 font-body text-[12px] font-bold leading-tight text-white/90">
          <span className="block truncate text-amber-300">
            {details.emoji} {details.label}
          </span>
          <span className="block truncate text-[11px] font-semibold text-white/55">Order #{order.shortId}</span>
        </span>

        {many && (
          <button
            type="button"
            onClick={() => setSelectedIndex((index + 1) % activeOrders.length)}
            className="shrink-0 rounded-full border border-white/15 px-2.5 py-1.5 font-body text-[11px] font-bold text-white/80 hover:bg-white/10"
            aria-label={`Showing order ${index + 1} of ${activeOrders.length}, show next`}
          >
            {index + 1}/{activeOrders.length} ⇄
          </button>
        )}

        <Link
          to={`/track/${order.id}`}
          className="group flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-3.5 py-2 font-body text-[11px] font-black uppercase tracking-wider text-ink shadow-sm transition hover:bg-amber-300"
        >
          <span>Track</span>
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
        </Link>

        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Minimise order status"
          title="Minimise"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 8h8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
