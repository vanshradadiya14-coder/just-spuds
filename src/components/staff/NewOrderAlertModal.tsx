import { useEffect, useMemo, useState } from 'react'
import { type Order } from '../../services/orderStore'
import { type AlertSoundState, type OnlineOrderAlert } from '../../services/alertSoundBus'
import { lineUnitPrice } from '../../hooks/useCart'
import { cx, gbp } from '../../utils/format'

interface NewOrderAlertModalProps {
  alerts: OnlineOrderAlert[]
  orders: Order[]
  soundState: AlertSoundState
  onAccept: (order: Order, print: boolean) => void
  onDecline: (order: Order) => void
  onSilence: (orderId: string) => void
  onOpenSoundSettings: () => void
  /** Accept & Print is the primary action when the till setting says tickets print automatically. */
  printByDefault: boolean
}

function elapsedLabel(iso: string, now: number) {
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s ago`
}

/**
 * Full-screen incoming-order alarm for the kitchen display: shows the oldest
 * unaccepted web order with everything the cook needs to decide, and keeps
 * the alarm going until every order is accepted, declined or silenced.
 */
export default function NewOrderAlertModal({
  alerts,
  orders,
  soundState,
  onAccept,
  onDecline,
  onSilence,
  onOpenSoundSettings,
  printByDefault,
}: NewOrderAlertModalProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Oldest first: the customer who has waited longest is dealt with first.
  const queue = useMemo(
    () =>
      alerts
        .slice()
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map((a) => ({ alert: a, order: orders.find((o) => o.id === a.orderId) }))
        .filter((x): x is { alert: OnlineOrderAlert; order: Order } => Boolean(x.order)),
    [alerts, orders],
  )
  const current = queue[0]
  const rest = queue.slice(1)

  // Enter accepts the order in front so a cook with floury hands can hit one key.
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Enter') {
        e.preventDefault()
        onAccept(current.order, printByDefault)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, onAccept, printByDefault])

  if (!current) return null
  const { order, alert } = current
  const isDelivery = order.fulfilment === 'delivery'
  const isPaid = order.payment.status === 'paid'

  const soundBadge = !soundState.enabled
    ? { text: '🔇 Alarm sound is OFF', tone: 'text-white/60 border-white/20 bg-white/5' }
    : soundState.blocked
    ? { text: '🔇 Tap anywhere to enable sound', tone: 'text-amber-300 border-amber-400/50 bg-amber-500/15 animate-pulse' }
    : soundState.deferredToOtherTab
    ? { text: '🔊 Sounding on another screen', tone: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' }
    : soundState.sounding
    ? { text: '🔊 Alarm sounding', tone: 'text-rose-200 border-rose-400/50 bg-rose-500/20' }
    : { text: '🔔 Starting alarm…', tone: 'text-white/70 border-white/20 bg-white/5' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`New online order ${order.shortId}`}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-alarm"
    >
      <div className="w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-3xl border-2 border-rose-500/70 bg-gradient-to-b from-slate-900 via-slate-900 to-black shadow-2xl text-white font-body">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-rose-600/20 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500 text-3xl shadow-glow animate-bell">🔔</span>
            <div>
              <h2 className="display text-2xl sm:text-3xl font-black tracking-wide text-white">
                {queue.length > 1 ? `${queue.length} NEW ONLINE ORDERS` : 'NEW ONLINE ORDER'}
              </h2>
              <p className="text-xs text-rose-200/90">Accept, decline or silence to stop the alarm.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cx('rounded-full border px-3 py-1 text-[11px] font-bold', soundBadge.tone)}>{soundBadge.text}</span>
            <button
              type="button"
              onClick={onOpenSoundSettings}
              className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/70 hover:bg-white/15 hover:text-white"
              title="Alert sound settings"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Order in front */}
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="display text-4xl font-black tracking-tight text-amber-300">#{order.shortId}</span>
                <span className={cx('rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider', isDelivery ? 'bg-amber-400 text-ink' : 'bg-emerald-400 text-ink')}>
                  {isDelivery ? '🛵 Delivery' : '🛍️ Collection'}
                </span>
                {order.isScheduled && (
                  <span className="rounded-full bg-purple-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
                    📅 {order.scheduledFor || 'Scheduled'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/80">
                <strong className="text-white">{order.customer.name}</strong> &bull; {order.customer.phone}
              </p>
              {isDelivery && order.customer.streetAddress && (
                <p className="text-xs text-amber-300 font-semibold">📍 {order.customer.streetAddress}, {order.customer.postcode}</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-mono text-3xl font-black text-white">{gbp(order.payment.total)}</p>
              <p className={cx('text-[11px] font-black uppercase tracking-wider', isPaid ? 'text-emerald-400' : 'text-amber-300')}>
                {isPaid ? '✓ Paid online' : isDelivery ? 'Driver collects payment' : 'Pay at counter'}
              </p>
              <p className="text-[11px] text-white/50 mt-1">
                Placed {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {elapsedLabel(alert.timestamp, now)}
              </p>
            </div>
          </div>

          {order.kitchenNotes && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-400 p-3 text-xs font-black uppercase text-ink">
              ⚠️ Kitchen note: <span className="normal-case font-bold">{order.kitchenNotes}</span>
            </div>
          )}

          <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/40">
            {order.lines.map((l) => (
              <li key={l.lineId} className="flex items-start justify-between gap-3 p-3">
                <div>
                  <p className="text-base font-bold text-white">
                    <span className="mr-2 text-lg font-black text-amber-400">{l.qty}x</span>
                    {l.name}
                  </p>
                  {l.extras.length > 0 && <p className="pl-8 text-xs font-semibold text-amber-200">+ {l.extras.join(', ')}</p>}
                  {l.salads && l.salads.length > 0 && <p className="pl-8 text-xs font-semibold text-emerald-300">🥗 {l.salads.join(', ')}</p>}
                  {l.sauces.length > 0 && <p className="pl-8 text-xs font-semibold text-amber-300">🥫 {l.sauces.join(', ')}</p>}
                  {l.meal && (
                    <p className="pl-8 text-xs font-bold text-amber-300">
                      🥤 Meal deal{l.mealDrink ? `: ${l.mealDrink}` : ''}{l.mealSnack ? ` • ${l.mealSnack}` : ''}
                    </p>
                  )}
                  {l.notes && <p className="pl-8 text-xs font-bold text-red-200">⚠️ {l.notes}</p>}
                </div>
                <span className="font-mono text-sm font-bold text-white/80">{gbp(lineUnitPrice(l) * l.qty)}</span>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAccept(order, printByDefault)}
              className="rounded-2xl bg-emerald-500 py-4 text-base font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400 active:scale-[0.98] transition"
            >
              ✓ {printByDefault ? 'Accept & Print' : 'Accept order'}
              <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">↵</span>
            </button>
            <button
              type="button"
              onClick={() => onAccept(order, !printByDefault)}
              className="rounded-2xl border border-emerald-400/50 bg-emerald-500/10 py-4 text-base font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.98] transition"
            >
              {printByDefault ? '✓ Accept (no print)' : '🖨️ Accept & Print'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onDecline(order)}
              className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/60 hover:text-white"
            >
              ✕ Decline order
            </button>
            <button
              type="button"
              onClick={() => onSilence(order.id)}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/70 hover:bg-white/15 hover:text-white"
              title="Stops the alarm for this order; it stays in the New column"
            >
              🔕 Silence, decide later
            </button>
          </div>
        </div>

        {/* The rest of the queue */}
        {rest.length > 0 && (
          <div className="border-t border-white/10 bg-black/30 px-5 py-4 space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/50">Also waiting ({rest.length})</p>
            {rest.map(({ order: o }) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">
                    <span className="font-mono text-amber-300">#{o.shortId}</span> &bull; {o.customer.name} &bull; {gbp(o.payment.total)}
                  </p>
                  <p className="truncate text-[11px] text-white/50">{o.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAccept(o, printByDefault)}
                  className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-black text-ink hover:bg-emerald-400"
                >
                  ✓ Accept
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => queue.forEach(({ order: o }) => onAccept(o, false))}
              className="w-full rounded-xl border border-emerald-400/40 bg-emerald-500/10 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/25"
              title="Accepts every waiting order; print tickets from the cards afterwards"
            >
              ✓ Accept all {queue.length}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
