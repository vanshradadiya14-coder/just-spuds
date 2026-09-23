import { useMemo } from 'react'
import type { Order } from '../../services/orderStore'

/** Tickets whose food still has to be made. */
const TO_MAKE: Order['status'][] = ['accepted', 'baking', 'quality_check']

/**
 * "All day" view (Toast / Fresh KDS): the total of every item still to be made
 * across the open tickets, so the kitchen can bake potatoes in batches instead
 * of ticket by ticket. Items waiting for acceptance are counted separately.
 */
export default function AllDayBar({ orders }: { orders: Order[] }) {
  const { making, waiting, tickets } = useMemo(() => {
    const making = new Map<string, number>()
    const waiting = new Map<string, number>()
    let tickets = 0
    orders.forEach((o) => {
      const bucket = TO_MAKE.includes(o.status) ? making : o.status === 'placed' ? waiting : null
      if (!bucket) return
      if (bucket === making) tickets += 1
      o.lines.forEach((l) => bucket.set(l.name, (bucket.get(l.name) || 0) + l.qty))
    })
    const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
    return { making: sort(making), waiting: sort(waiting), tickets }
  }, [orders])

  if (making.length === 0 && waiting.length === 0) return null

  return (
    <div className="mb-4 rounded-2xl border border-orange-400/30 bg-orange-500/5 p-3 font-body" aria-label="All-day item counts">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-orange-300">
          🔥 All day · {tickets} ticket{tickets === 1 ? '' : 's'}
        </span>
        {making.map(([name, qty]) => (
          <span key={name} className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-sm font-bold text-white">
            <span className="mr-1 font-black text-amber-300">{qty}×</span>
            {name}
          </span>
        ))}
        {waiting.length > 0 && (
          <span className="ml-auto rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-200" title="In orders not accepted yet">
            + waiting: {waiting.map(([name, qty]) => `${qty}× ${name}`).join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
