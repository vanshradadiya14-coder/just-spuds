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

  return (
    <div
      key={ord.id}
      className={cx(
        'rounded-3xl border flex flex-col justify-between shadow-2xl transition-all',
        isCancelled
          ? 'border-red-500/40 bg-red-950/20'
          : ord.status === 'placed'
          ? 'border-amber-400 bg-gradient-to-b from-amber-950/40 to-slate-900 ring-2 ring-amber-400/40'
          : ord.status === 'baking'
          ? 'border-orange-500/50 bg-gradient-to-b from-orange-950/30 to-slate-900'
          : 'border-white/10 bg-white/[0.04]'
      )}
    >
      {/* Header */}
      <div className="p-5 border-b border-white/10 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="display text-2xl text-white font-bold">#{ord.shortId}</span>
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider',
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
          <p className="font-body text-xs text-white/70 mt-0.5">
            {ord.customer.name} &bull; {ord.customer.phone}
          </p>
          {isDelivery && ord.customer.streetAddress && (
            <p className="font-body text-[11px] text-amber-300 font-medium">
              📍 {ord.customer.streetAddress}, {ord.customer.postcode}
            </p>
          )}
        </div>

        <div className="text-right shrink-0">
          <span className="font-body text-xs text-white/50 block">
            {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span
            className={cx(
              'inline-block rounded px-2 py-0.5 font-body text-[10px] font-black uppercase mt-1',
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
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="text-sm">
                  <span className="text-amber-400 mr-1.5 font-black">{l.qty}x</span>
                  {l.name}
                </span>
              </div>

              {l.extras && l.extras.length > 0 && (
                <p className="font-body text-xs text-amber-200 mt-0.5 font-medium">
                  + {l.extras.join(', ')}
                </p>
              )}

              {l.salads && l.salads.length > 0 && (
                <p className="font-body text-[11px] text-emerald-300 font-medium">
                  🥗 Salad: {l.salads.join(', ')}
                </p>
              )}

              {l.sauces && l.sauces.length > 0 && (
                <p className="font-body text-[11px] text-amber-400">
                  Sauce: {l.sauces.join(', ')}
                </p>
              )}

              {l.meal && (
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  <span>🥤 Meal Deal:</span>
                  {l.mealDrink && <span>{l.mealDrink}</span>}
                  {l.mealSnack && <span>&bull; {l.mealSnack}</span>}
                </div>
              )}

              {l.notes && (
                <p className="font-body text-xs italic font-bold text-red-300 mt-0.5">
                  * Note: {l.notes}
                </p>
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
                  <span>Decline Order</span>
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
