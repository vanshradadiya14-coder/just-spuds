import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getStatusChangeBlocker, type Order } from '../../../services/orderStore'
import { lineUnitPrice } from '../../../hooks/useCart'
import { cx, gbp } from '../../../utils/format'
import { nextStepLabel, sourceBadge, statusTone } from './orderLabels'
import { parseKitchenNotes } from '../../../utils/kitchenNotes'

interface OrderDetailDrawerProps {
  order: Order
  onClose: () => void
  onAdvance: (id: string) => void
  onPrint: (o: Order) => void
  onCancel: (id: string) => void
  onFix?: (o: Order) => void
}

const money = (n: number | undefined) => gbp(n || 0)

/**
 * Everything about one order on one panel — the table row only has room for a
 * summary. Slides in from the right; full-screen on a phone.
 */
export default function OrderDetailDrawer({ order, onClose, onAdvance, onPrint, onCancel, onFix }: OrderDetailDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isDelivery = order.fulfilment === 'delivery'
  const next = nextStepLabel(order)
  const nextStatus = order.status === 'placed' ? 'accepted' : order.status === 'accepted' ? 'baking' : order.status === 'baking' ? (isDelivery ? 'out_for_delivery' : 'ready_for_pickup') : order.status === 'out_for_delivery' ? 'delivered' : order.status === 'ready_for_pickup' ? 'collected' : order.status
  const blocker = next ? getStatusChangeBlocker(order, nextStatus) : null
  const isFinal = ['delivered', 'collected', 'cancelled'].includes(order.status)
  const src = sourceBadge(order)
  const placed = new Date(order.createdAt)
  const paid = order.payment.status === 'paid'
  const notes = parseKitchenNotes(order.kitchenNotes)

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Order ${order.shortId}`}>
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close order details" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-white/10 bg-slate-950 text-white shadow-2xl font-body">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-slate-900 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-black text-amber-300">#{order.shortId}</span>
              <span className={cx('rounded-lg border px-2 py-0.5 text-[10px] font-bold', src.tone)}>{src.label}</span>
              <span className={cx('rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase', isDelivery ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' : 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40')}>
                {isDelivery ? '🛵 Delivery' : '🛍️ Pick up'}
              </span>
              <span className={cx('rounded-md border px-2 py-0.5 text-[10px] font-black uppercase', statusTone(order.status))}>{order.status.replace(/_/g, ' ')}</span>
            </div>
            <p className="mt-1 text-[11px] text-white/50">
              Placed {placed.toLocaleDateString('en-GB')} at {placed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {order.isScheduled && <span className="ml-2 text-purple-300">📅 {order.scheduledFor}</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-xs text-white/70 hover:bg-white/20 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-5">
          {/* Primary action */}
          {!isFinal && (
            <div className="flex flex-wrap gap-2">
              {next && !blocker && (
                <button
                  type="button"
                  onClick={() => onAdvance(order.id)}
                  className={cx('flex-1 rounded-xl py-3 text-sm font-black text-slate-950 shadow transition active:scale-[0.98]', order.status === 'placed' ? 'bg-emerald-500 hover:bg-emerald-400 animate-pulse' : 'bg-emerald-500 hover:bg-emerald-400')}
                >
                  {next}
                </button>
              )}
              {blocker && (
                <Link to="/pos" className="flex-1 rounded-xl border border-amber-400/50 bg-amber-500/10 py-3 text-center text-xs font-bold text-amber-300 hover:bg-amber-500/20">
                  💷 {blocker}
                </Link>
              )}
              <button type="button" onClick={() => onPrint(order)} className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-xs font-bold text-amber-300 hover:bg-white/15">
                🖨️ Ticket
              </button>
            </div>
          )}

          {order.cancellation && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
              <p className="text-[10px] font-black uppercase text-red-400">Cancelled {new Date(order.cancellation.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="mt-0.5">&ldquo;{order.cancellation.reason}&rdquo;</p>
              {order.cancellation.refundAmount > 0 && <p className="mt-1 font-bold text-emerald-300">Refund {gbp(order.cancellation.refundAmount)} — {order.cancellation.refundStatus}</p>}
            </div>
          )}

          {/* Customer */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1 text-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/50">Customer</p>
            <p className="text-sm font-bold text-white">{order.customer.name}</p>
            <p>
              <a href={`tel:${order.customer.phone.replace(/\s+/g, '')}`} className="font-mono text-amber-300 hover:underline">
                📞 {order.customer.phone}
              </a>
              {order.customer.email && !order.customer.email.endsWith('@justspuds.uk') && <span className="ml-3 text-white/60">✉️ {order.customer.email}</span>}
            </p>
            {isDelivery && order.customer.streetAddress && (
              <p className="text-amber-200">📍 {order.customer.streetAddress}, {order.customer.postcode}</p>
            )}
            {order.customer.instructions && <p className="text-white/70">📝 {order.customer.instructions}</p>}
            {(order.customer.buzzerNumber || order.customer.tableNumber) && (
              <p className="text-white/70">
                {order.customer.buzzerNumber && <span className="mr-3">🔔 Buzzer {order.customer.buzzerNumber}</span>}
                {order.customer.tableNumber && <span>🪑 Table {order.customer.tableNumber}</span>}
              </p>
            )}
            {order.deliveryDetails?.assignedDriverName && (
              <p className="text-emerald-300">🛵 {order.deliveryDetails.assignedDriverName}{order.deliveryDetails.deliveryPin ? ` • PIN ${order.deliveryDetails.deliveryPin}` : ''}</p>
            )}
          </section>

          {(notes.callouts.length > 0 || notes.meta.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {notes.callouts.map((c) => (
                <span key={c} className="rounded-lg bg-amber-400 px-2 py-0.5 font-black uppercase tracking-wider text-ink">{c}</span>
              ))}
              {notes.meta.map((m) => (
                <span key={m} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-bold uppercase tracking-wider text-white/50">{m}</span>
              ))}
            </div>
          )}
          {notes.note && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-400 p-3 text-xs font-black uppercase text-ink">
              ⚠️ <span className="normal-case font-bold">{notes.note}</span>
            </div>
          )}

          {/* Items */}
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <p className="border-b border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white/50">
              Items ({order.lines.reduce((n, l) => n + l.qty, 0)})
            </p>
            <ul className="divide-y divide-white/10">
              {order.lines.map((l) => (
                <li key={l.lineId} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                  <div>
                    <p className="text-sm font-bold text-white">
                      <span className="mr-2 font-black text-amber-400">{l.qty}x</span>
                      {l.name}
                    </p>
                    {l.extras.length > 0 && <p className="pl-7 text-amber-200">+ {l.extras.join(', ')}</p>}
                    {l.salads && l.salads.length > 0 && <p className="pl-7 text-emerald-300">🥗 {l.salads.join(', ')}</p>}
                    {l.sauces.length > 0 && <p className="pl-7 text-amber-300">🥫 {l.sauces.join(', ')}</p>}
                    {l.meal && <p className="pl-7 font-bold text-amber-300">🥤 Meal deal{l.mealDrink ? `: ${l.mealDrink}` : ''}{l.mealSnack ? ` • ${l.mealSnack}` : ''}</p>}
                    {l.notes && <p className="pl-7 font-bold text-red-200">⚠️ {l.notes}</p>}
                    {typeof l.priceOverridePence === 'number' && <p className="pl-7 text-[10px] text-purple-300">Price override: {l.priceOverrideReason || 'manager'}</p>}
                  </div>
                  <span className="shrink-0 font-mono font-bold text-white/80">{gbp(lineUnitPrice(l) * l.qty)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Payment */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/50">Payment</p>
            <div className="flex justify-between"><span className="text-white/60">Subtotal</span><span className="font-mono">{money(order.payment.subtotal)}</span></div>
            {order.payment.discount > 0 && <div className="flex justify-between text-emerald-300"><span>Discount</span><span className="font-mono">-{money(order.payment.discount)}</span></div>}
            {order.payment.deliveryFee > 0 && <div className="flex justify-between"><span className="text-white/60">Delivery</span><span className="font-mono">{money(order.payment.deliveryFee)}</span></div>}
            {order.payment.serviceFee > 0 && <div className="flex justify-between"><span className="text-white/60">Service</span><span className="font-mono">{money(order.payment.serviceFee)}</span></div>}
            {order.payment.tip > 0 && <div className="flex justify-between"><span className="text-white/60">Tip</span><span className="font-mono">{money(order.payment.tip)}</span></div>}
            <div className="flex justify-between border-t border-white/10 pt-1 text-sm font-black"><span>Total</span><span className="font-mono text-amber-300">{money(order.payment.total)}</span></div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-white/60">
                {order.payment.method.replace(/_/g, ' ')}
                {order.payment.cardLast4 && <span className="ml-1 font-mono">•••• {order.payment.cardLast4}</span>}
              </span>
              <span className={cx('rounded-md px-2 py-0.5 text-[10px] font-black uppercase', paid ? 'bg-emerald-500/20 text-emerald-300' : order.payment.status === 'refunded' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300')}>
                {order.payment.status.replace(/_/g, ' ')}
              </span>
            </div>
            {order.payment.splitDetails && order.payment.splitDetails.length > 0 && (
              <p className="text-[11px] text-white/50">Split: {order.payment.splitDetails.map((s) => `${s.method} ${gbp(s.amount)}`).join(' + ')}</p>
            )}
            {order.payment.manualAdjustment && (
              <p className="text-[11px] text-purple-300">
                Adjusted {gbp(order.payment.manualAdjustment.originalTotal)} → {gbp(order.payment.manualAdjustment.adjustedTotal)} by {order.payment.manualAdjustment.adjustedBy}: {order.payment.manualAdjustment.reason}
              </p>
            )}
          </section>

          {/* Timeline */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-2">Timeline</p>
            <ol className="space-y-2 border-l border-white/10 pl-3">
              {order.timeline.map((t, i) => (
                <li key={`${t.status}-${i}`} className="relative">
                  <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-amber-400" />
                  <p className="font-bold text-white">
                    {t.title} <span className="ml-1 font-mono text-[10px] text-white/50">{t.timestamp}</span>
                  </p>
                  {t.description && <p className="text-white/60">{t.description}</p>}
                </li>
              ))}
            </ol>
          </section>

          {order.adminNotes && order.adminNotes.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-white/50 mb-2">Staff notes</p>
              <ul className="space-y-1.5">
                {order.adminNotes.map((n) => (
                  <li key={n.id} className="text-white/80">
                    <span className="font-bold text-white">{n.author}</span> <span className="font-mono text-[10px] text-white/40">{new Date(n.timestamp).toLocaleString('en-GB')}</span>
                    <br />
                    {n.note}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-900 px-5 py-3">
          {!isFinal && (
            <button
              type="button"
              onClick={() => onCancel(order.id)}
              className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-[11px] font-bold text-red-400 hover:bg-red-900/40"
            >
              {paid ? 'Cancel & refund' : 'Cancel order'}
            </button>
          )}
          {onFix && (
            <button type="button" onClick={() => onFix(order)} className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] font-bold text-amber-300 hover:bg-amber-400/25">
              🛠️ Manual fix
            </button>
          )}
          {isFinal && (
            <button type="button" onClick={() => onPrint(order)} className="rounded-lg border border-white/20 px-3 py-2 text-[11px] font-bold text-amber-300 hover:bg-white/10">
              🖨️ Reprint
            </button>
          )}
          <Link to={`/track/${order.id}`} className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold text-white hover:bg-white/20">
            Customer view →
          </Link>
        </div>
      </aside>
    </div>
  )
}
