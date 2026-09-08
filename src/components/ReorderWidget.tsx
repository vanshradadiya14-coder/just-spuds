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
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-50 via-white to-amber-50/60 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-xl shadow-sm">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-body text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full">
                Welcome Back!
              </span>
              <span className="font-body text-[11px] text-slate-500">
                Order #{lastOrder.shortId}
              </span>
            </div>
            <h4 className="font-display text-base text-ink mt-0.5">
              Reorder your previous meal
            </h4>
            <p className="font-body text-xs text-slate-600 line-clamp-1 mt-0.5">
              {lastOrder.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')} &bull;{' '}
              <strong className="text-ink">{gbp(lastOrder.payment.total)}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReorder}
          className="rounded-full bg-ink px-5 py-2.5 font-body text-xs font-black uppercase tracking-wider text-white hover:bg-slate-800 shadow transition flex items-center justify-center gap-1.5 shrink-0"
        >
          <span>↻ Reorder in 1 Tap</span>
          <span className="text-amber-400">→</span>
        </button>
      </div>
    </div>
  )
}
