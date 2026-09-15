import { useState, useEffect } from 'react'
import { cx, gbp } from '../../utils/format'
import { Order } from '../../services/orderStore'

export default function TicketCard({
  ord,
  handleStatusChange,
  handleOpenRejectModal,
  setPrintingOrder,
  sendOrderToDrivers,
  setFixingOrder,
}: {
  ord: Order
  handleStatusChange: any
  handleOpenRejectModal: any
  setPrintingOrder: any
  sendOrderToDrivers: any
  setFixingOrder?: (o: Order) => void
}) {
  const isDelivery = ord.fulfilment === 'delivery'
  const isCancelled = ord.status === 'cancelled'
  const isComplete = ord.status === 'delivered' || ord.status === 'collected'

  // Live Elapsed Preparation Timer
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (isComplete || isCancelled) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isComplete, isCancelled])

  const elapsedMs = Math.max(0, now - new Date(ord.createdAt).getTime())
  const elapsedMins = Math.floor(elapsedMs / 60000)
  const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000)
  const isLate = !isComplete && !isCancelled && elapsedMins >= 20
  const isWarning = !isComplete && !isCancelled && elapsedMins >= 10 && elapsedMins < 20

  const source = ord.source

  return (
    <div
      key={ord.id}
      className={cx(
        'rounded-3xl border flex flex-col justify-between shadow-2xl transition-all',
        isLate
          ? 'border-red-500 bg-gradient-to-b from-red-950/60 to-slate-900 ring-4 ring-red-500/50 shadow-red-950/50'
          : isCancelled
          ? 'border-red-500/40 bg-red-950/20'
          : ord.status === 'placed'
          ? 'border-amber-400 bg-gradient-to-b from-amber-950/40 to-slate-900 ring-2 ring-amber-400/40'
          : ord.status === 'baking'
          ? 'border-orange-500/50 bg-gradient-to-b from-orange-950/30 to-slate-900'
          : 'border-white/10 bg-white/[0.04]'
      )}
    >
      {/* Header: Distance Typography & Source Badges */}
      <div className="p-4 border-b border-white/10 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display text-2xl xl:text-[26px] text-white font-black tracking-tight whitespace-nowrap">#{ord.shortId}</span>

            {/* Order Source Badge */}
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 font-body text-[11px] font-black uppercase tracking-wider',
                source === 'TILL'
                  ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                  : source === 'PHONE'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                  : source === 'STAFF'
                  ? 'bg-slate-500/30 text-slate-200 border border-slate-500/40'
                  : 'bg-sky-500/30 text-sky-200 border border-sky-500/40'
              )}
            >
              {source === 'TILL' ? '🖥️ TILL' : source === 'PHONE' ? '📞 PHONE' : source === 'STAFF' ? '👤 COUNTER' : '🌐 WEB'}
            </span>

            {/* Fulfilment Type */}
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 font-body text-[11px] font-black uppercase tracking-wider',
                isDelivery ? 'bg-amber-400 text-ink' : 'bg-emerald-400 text-ink'
              )}
            >
              {isDelivery ? '🛵 Delivery' : '🛍️ Pick Up'}
            </span>

            {ord.isScheduled && (
              <span className="rounded-full bg-purple-500/90 text-white px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1">
                <span>📅</span>
                <span>{ord.scheduledFor || ord.estimatedDeliveryTime}</span>
              </span>
            )}
          </div>

          <p className="font-body text-sm text-white/80 font-medium mt-1">
            <strong className="text-white">{ord.customer.name}</strong> &bull; {ord.customer.phone}
          </p>
          {isDelivery && ord.customer.streetAddress && (
            <p className="font-body text-xs text-amber-300 font-semibold mt-0.5">
              📍 {ord.customer.streetAddress}, {ord.customer.postcode}
            </p>
          )}
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          {/* Elapsed Kitchen Prep Timer */}
          <div
            className={cx(
              'px-2.5 py-1 rounded-xl text-xs font-black font-mono tracking-wider flex items-center gap-1.5 shadow-sm',
              isLate
                ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400'
                : isWarning
                ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            )}
          >
            <span>⏱️</span>
            <span>
              {elapsedMins}m {elapsedSecs < 10 ? '0' : ''}{elapsedSecs}s
            </span>
            {isLate && <span className="text-[10px] bg-white text-red-700 px-1 rounded uppercase font-black">LATE</span>}
          </div>

          <span className="font-body text-[11px] text-white/50">
            Ordered: {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          <span
            className={cx(
              'inline-block rounded px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider',
              isCancelled
                ? 'bg-red-500/30 text-red-300 border border-red-500/40'
                : 'bg-white/10 text-amber-300'
            )}
          >
            {isCancelled ? '❌ DECLINED & REFUNDED' : ord.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Body: Allergen Alerts & Food Checklist */}
      <div className="p-5 space-y-3.5 flex-1">
        {/* Cancellation Notice if Rejected */}
        {isCancelled && ord.cancellation && (
          <div className="rounded-xl border border-red-500/50 bg-red-950/40 p-3 font-body text-xs text-red-200">
            <p className="font-bold uppercase text-red-400 text-[10px]">Reason for Rejection:</p>
            <p className="mt-0.5 font-medium">&ldquo;{ord.cancellation.reason}&rdquo;</p>
            <p className="mt-1 text-[11px] text-emerald-400 font-bold">
              ✓ 100% Refund of {gbp(ord.cancellation.refundAmount)} automatically issued.
            </p>
          </div>
        )}

        {/* CRITICAL ALLERGEN / INSTRUCTION BOX */}
        {ord.kitchenNotes && !isCancelled && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-400 text-ink p-3 font-body text-xs font-black uppercase shadow-lg">
            <p className="text-[10px] underline">⚠️ ALLERGEN / KITCHEN ALERT:</p>
            <p className="mt-0.5">{ord.kitchenNotes}</p>
          </div>
        )}

        {/* Food Lines List */}
        <div className="space-y-3 divide-y divide-white/6">
          {ord.lines.map((l) => (
            <div key={l.lineId} className="pt-2.5 first:pt-0">
              <div className="flex items-start justify-between text-sm font-bold text-white">
                <div className="text-base font-bold text-white leading-tight">
                  <span className="text-amber-400 mr-2 text-lg font-black">{l.qty}x</span>
                  <span>{l.name}</span>
                </div>
              </div>

              {l.extras && l.extras.length > 0 && (
                <p className="font-body text-xs text-amber-200 mt-1 font-semibold pl-6">
                  + {l.extras.join(', ')}
                </p>
              )}

              {l.salads && l.salads.length > 0 && (
                <p className="font-body text-xs text-emerald-300 font-semibold mt-0.5 pl-6">
                  🥗 Salad: {l.salads.join(', ')}
                </p>
              )}

              {l.sauces && l.sauces.length > 0 && (
                <p className="font-body text-xs text-amber-300 font-semibold mt-0.5 pl-6">
                  🥫 Sauce: {l.sauces.join(', ')}
                </p>
              )}

              {l.meal && (
                <div className="mt-1.5 ml-6 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                  <span>🥤 Meal Deal:</span>
                  {l.mealDrink && <span>{l.mealDrink}</span>}
                  {l.mealSnack && <span>&bull; {l.mealSnack}</span>}
                </div>
              )}

              {l.notes && (
                <div className="mt-1 ml-6 rounded-lg bg-red-950/60 border border-red-500/40 px-2 py-0.5 inline-block text-xs font-bold text-red-200">
                  ⚠️ Special: {l.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer: Action Controls & 1-Click Thermal Print */}
      <div className="p-5 border-t border-white/10 bg-black/20 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrintingOrder(ord)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-white/15"
            >
              <span>🖨️</span>
              <span>Ticket</span>
            </button>
            {setFixingOrder && (
              <button
                type="button"
                onClick={() => setFixingOrder(ord)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-amber-400/20"
                title="Manual Problem Fixer & Operational Override"
              >
                <span>🛠️</span>
                <span>Manual Fix</span>
              </button>
            )}
          </div>

          <span className="font-body text-[10px] uppercase font-bold">
            {ord.payment.status === 'paid' ? (
              <span className="text-emerald-400">✓ PAID ({gbp(ord.payment.total)})</span>
            ) : ord.fulfilment === 'delivery' ? (
              <span className="text-amber-400">🛵 DRIVER COLLECTS {gbp(ord.payment.total)}</span>
            ) : (
              <span className="text-amber-400">🛍️ COLLECT {gbp(ord.payment.total)} AT COUNTER</span>
            )}
          </span>
        </div>

        {/* 1-Click Ticket Status & Decision Action Bar */}
        {!isCancelled && !isComplete && (
          <div className="space-y-2 pt-1">
            {/* INCOMING NEW ORDER: Mandatory Accept vs Reject Choice */}
            {ord.status === 'placed' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleStatusChange(ord.id, 'accepted')}
                  className="rounded-xl bg-emerald-500 py-3 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:bg-emerald-400 flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <span>✓</span>
                  <span>Accept Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenRejectModal(ord)}
                  className="rounded-xl border border-red-500/40 bg-red-950/40 py-3 font-body text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900/60 hover:text-white flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <span>✕</span>
                  <span>Decline</span>
                </button>
              </div>
            )}

            {ord.status === 'accepted' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStatusChange(ord.id, 'baking')}
                  className="flex-1 rounded-xl bg-orange-500 py-3 font-body text-xs font-black uppercase tracking-wider text-white shadow hover:bg-orange-400 flex items-center justify-center gap-1.5"
                >
                  <span>🔥</span>
                  <span>Start Oven Baking</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenRejectModal(ord)}
                  className="rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-3 font-body text-xs font-bold text-red-400 hover:bg-red-900/40"
                  title="Reject & Refund Order"
                >
                  ✕
                </button>
              </div>
            )}

            {ord.status === 'baking' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      isDelivery
                        ? sendOrderToDrivers(ord.id)
                        : handleStatusChange(ord.id, 'ready_for_pickup')
                    }
                    className="flex-1 rounded-xl bg-amber-400 py-3 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-amber-300 flex items-center justify-center gap-1.5"
                  >
                    <span>{isDelivery ? '🚀' : '🛍️'}</span>
                    <span>{isDelivery ? 'Send to Drivers (Dispatch)' : 'Mark Ready for Pickup'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenRejectModal(ord)}
                    className="rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-3 font-body text-xs font-bold text-red-400 hover:bg-red-900/40"
                    title="Reject & Refund Order"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {ord.status === 'ready_for_delivery' && (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-amber-300 font-body text-xs font-bold animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span>⏳ Waiting for Driver to Claim...</span>
                </div>
                <p className="text-[11px] text-white/60">
                  Dispatched to online Just Spuds couriers
                </p>
              </div>
            )}

            {ord.status === 'driver_assigned' && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-center space-y-1 font-body">
                <span className="text-emerald-300 text-xs font-bold block">
                  🛵 Driver Assigned: {ord.deliveryDetails?.assignedDriverName || ord.driver?.name}
                </span>
                <span className="text-[11px] text-white/60">
                  {ord.deliveryDetails?.assignedDriverVehicle || 'Moped'} &bull; Heading to store
                </span>
              </div>
            )}

            {ord.status === 'driver_arrived_at_store' && (
              <div className="space-y-2 font-body">
                <div className="rounded-2xl border border-emerald-400 bg-emerald-500/20 p-2.5 text-center text-xs font-bold text-emerald-200 animate-bounce">
                  📍 {ord.deliveryDetails?.assignedDriverName || 'Driver'} is at the counter!
                </div>
                <button
                  type="button"
                  onClick={() => handleStatusChange(ord.id, 'out_for_delivery')}
                  className="w-full rounded-xl bg-amber-400 py-3 text-xs font-black uppercase text-ink shadow hover:bg-amber-300"
                >
                  📦 Hand Food Over (Out for Delivery) &rarr;
                </button>
              </div>
            )}

            {(ord.status === 'out_for_delivery' || ord.status === 'ready_for_pickup') && (
              <div className="space-y-1">
                {isDelivery && (
                  <p className="text-[11px] text-white/70 text-center font-body mb-1">
                    🛵 In transit with <strong>{ord.deliveryDetails?.assignedDriverName || ord.driver?.name}</strong>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleStatusChange(ord.id, isDelivery ? 'delivered' : 'collected')
                  }
                  className="w-full rounded-xl bg-emerald-500 py-3 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow hover:bg-emerald-400 flex items-center justify-center gap-1.5"
                >
                  <span>🎉</span>
                  <span>Complete Order</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
