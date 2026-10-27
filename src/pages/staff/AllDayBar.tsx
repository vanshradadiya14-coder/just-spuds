import { useMemo } from 'react'
import { getOrderPrepTiming, type Order } from '../../services/orderStore'
import { KITCHEN_STATIONS, stationForLine, type KitchenStation } from '../../utils/lineText'

/** Tickets whose food still has to be made. */
const TO_MAKE: Order['status'][] = ['accepted', 'baking', 'quality_check']

/**
 * "All day" view (Toast / Fresh KDS): the total of every item still to be made
 * across the open tickets, so the kitchen can bake potatoes in batches instead
 * of ticket by ticket. Items waiting for acceptance or already plated are
 * tracked accurately in real time.
 */
export default function AllDayBar({
  orders,
  stationFilter = 'all',
}: {
  orders: Order[]
  stationFilter?: 'all' | KitchenStation
}) {
  const { making, waiting, scheduledHoldCount, tickets } = useMemo(() => {
    const making = new Map<string, number>()
    const waiting = new Map<string, number>()
    let tickets = 0
    let scheduledHoldCount = 0
    const now = new Date()

    orders.forEach((o) => {
      const timing = getOrderPrepTiming(o, now)
      if (timing.isScheduledHold) {
        scheduledHoldCount += 1
        return
      }
      const bucket = TO_MAKE.includes(o.status) ? making : o.status === 'placed' ? waiting : null
      if (!bucket) return

      const checked = new Set(o.checkedLineIds || [])
      const matchingLines = o.lines.filter((l) => {
        if (bucket === making && checked.has(l.lineId)) return false
        if (stationFilter !== 'all' && stationForLine(l) !== stationFilter) return false
        return true
      })
      if (matchingLines.length === 0) return

      if (bucket === making) tickets += 1
      matchingLines.forEach((l) => bucket.set(l.name, (bucket.get(l.name) || 0) + l.qty))
    })
    const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
    return { making: sort(making), waiting: sort(waiting), scheduledHoldCount, tickets }
  }, [orders, stationFilter])

  if (making.length === 0 && waiting.length === 0 && scheduledHoldCount === 0) return null

  const activeStationMeta = KITCHEN_STATIONS.find((s) => s.id === stationFilter)

  return (
    <div className="mb-4 rounded-2xl border border-orange-400/30 bg-orange-500/5 p-3 font-body" aria-label="All-day item counts">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-orange-300">
          🔥 All day{stationFilter !== 'all' && activeStationMeta ? ` (${activeStationMeta.shortLabel})` : ''} · {tickets} ticket{tickets === 1 ? '' : 's'}
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
        {scheduledHoldCount > 0 && (
          <span className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-bold text-indigo-200" title="Scheduled pre-orders holding until their fire window">
            📅 {scheduledHoldCount} pre-order{scheduledHoldCount === 1 ? '' : 's'} holding
          </span>
        )}
      </div>
    </div>
  )
}
