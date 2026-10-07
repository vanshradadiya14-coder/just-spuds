import { useEffect, useState } from 'react'
import { getCustomerPlacedOrderIds, subscribeOrders, type Order } from '../services/orderStore'
import { useCart } from '../hooks/useCart'
import { gbp } from '../utils/format'

/**
 * Resolves the newest order THIS browser actually placed.
 *
 * This deliberately filters by getCustomerPlacedOrderIds() rather than taking the
 * newest order globally. The orders key holds every order placed on this device
 * plus seeded demo data, so an unfiltered read showed a first-time visitor a
 * stranger's name-adjacent order contents and total under a "Welcome Back!"
 * banner — the same privacy mistake the /track page had.
 */
function findOwnLatestOrder(orders: Order[]): Order | null {
  const ownIds = getCustomerPlacedOrderIds()
  if (ownIds.length === 0) return null

  const own = orders.filter((o) => ownIds.includes(o.id))
  if (own.length === 0) return null

  return [...own].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0] ?? null
}

export default function ReorderWidget() {
  const { reorder } = useCart()
  const [lastOrder, setLastOrder] = useState<Order | null>(null)

  // Subscribe rather than read once, so the widget appears as soon as an order is
  // placed and refreshes instead of going stale.
  useEffect(() => {
    return subscribeOrders((orders) => {
      setLastOrder(findOwnLatestOrder(orders))
    })
  }, [])

  if (!lastOrder || !lastOrder.lines || lastOrder.lines.length === 0) {
    return null
  }

  const handleReorder = () => {
    reorder(lastOrder.lines)
  }

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 p-4 sm:p-5 shadow-warm backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/20 text-2xl border border-amber-400/30">
            🥔
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-body text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200/90 px-2.5 py-0.5 rounded-full">
                Welcome Back
              </span>
              <span className="font-body text-[11px] text-slate-500 font-medium">
                Last Order #{lastOrder.shortId}
              </span>
            </div>
            <h4 className="font-display text-base sm:text-lg text-ink font-bold mt-1">
              Reorder your favourite meal
            </h4>
            {/* Items may truncate; the total never does. */}
            <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5 font-body text-xs text-slate-700">
              <span className="truncate">{lastOrder.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')}</span>
              <strong className="shrink-0 font-bold text-ink">&bull; {gbp(lastOrder.payment.total)}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReorder}
          className="rounded-full bg-ink px-6 py-2.5 font-body text-xs font-black uppercase tracking-wider text-white hover:bg-slate-800 active:scale-95 shadow-md transition flex items-center justify-center gap-2 shrink-0"
        >
          <span>↻ Reorder Favourite</span>
          <span className="text-amber-400">→</span>
        </button>
      </div>
    </div>
  )
}
