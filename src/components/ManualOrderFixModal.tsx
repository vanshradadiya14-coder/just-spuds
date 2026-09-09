import { useState } from 'react'
import {
  type Order,
  type OrderStatus,
  type PaymentMethod,
  manualOverrideOrder,
  bypassDeliveryPin,
  unassignDriverFromOrder,
} from '../services/orderStore'
import { blacklistPhone, isPhoneBlacklisted, unblacklistPhone } from '../services/blacklistStore'
import { gbp, cx } from '../utils/format'

interface ManualOrderFixModalProps {
  order: Order
  isOpen: boolean
  onClose: () => void
  currentActorName?: string
  onOrderUpdated?: (updated: Order) => void
}

const ALL_STATUSES: { value: OrderStatus; label: string; group: string }[] = [
  { value: 'placed', label: 'Placed (New)', group: 'Kitchen Pipeline' },
  { value: 'accepted', label: 'Accepted by Kitchen', group: 'Kitchen Pipeline' },
  { value: 'baking', label: 'Baking in Oven', group: 'Kitchen Pipeline' },
  { value: 'quality_check', label: 'Quality Check & Packed', group: 'Kitchen Pipeline' },
  { value: 'ready_for_pickup', label: 'Ready for Collection (Counter)', group: 'Pickup' },
  { value: 'collected', label: 'Collected at Counter (Done)', group: 'Pickup' },
  { value: 'ready_for_delivery', label: 'Ready for Delivery (Dispatch)', group: 'Delivery' },
  { value: 'driver_assigned', label: 'Driver Assigned', group: 'Delivery' },
  { value: 'driver_arrived_at_store', label: 'Driver Arrived at Store', group: 'Delivery' },
  { value: 'order_collected', label: 'Driver Collected Food', group: 'Delivery' },
  { value: 'out_for_delivery', label: 'Out for Delivery (On Road)', group: 'Delivery' },
  { value: 'delivered', label: 'Delivered to Doorstep (Done)', group: 'Delivery' },
  { value: 'failed_delivery', label: 'Delivery Failed', group: 'Exceptions' },
  { value: 'cancelled', label: 'Cancelled / Refunded', group: 'Exceptions' },
]

export default function ManualOrderFixModal({
  order,
  isOpen,
  onClose,
  currentActorName = 'Store Manager',
  onOrderUpdated,
}: ManualOrderFixModalProps) {
  const [targetStatus, setTargetStatus] = useState<OrderStatus>(order.status)
  const [paymentStatus, setPaymentStatus] = useState<typeof order.payment.status>(order.payment.status)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(order.payment.method)
  const [totalPounds, setTotalPounds] = useState<string>((order.payment.total / 100).toFixed(2))
  const [reason, setReason] = useState<string>('')
  const [internalNote, setInternalNote] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isBlacklisted = isPhoneBlacklisted(order.customer.phone).blacklisted

  if (!isOpen) return null

  const handleApplyFix = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const parsedPounds = parseFloat(totalPounds)
    if (isNaN(parsedPounds) || parsedPounds < 0) {
      setErrorMessage('Please enter a valid order total.')
      return
    }

    const newTotalPence = Math.round(parsedPounds * 100)

    try {
      const updated = manualOverrideOrder(
        order.id,
        {
          status: targetStatus,
          paymentStatus,
          paymentMethod,
          adjustedTotal: newTotalPence,
          adminNote: internalNote.trim() || undefined,
        },
        reason.trim() || 'Operational adjustment by manager',
        currentActorName
      )

      if (updated) {
        setSuccessMessage('Manual fix saved successfully!')
        if (onOrderUpdated) onOrderUpdated(updated)
        setTimeout(() => {
          onClose()
        }, 1200)
      } else {
        setErrorMessage('Order could not be found.')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error applying manual fix.')
    }
  }

  const handleBypassPinDirect = () => {
    const res = bypassDeliveryPin(
      order.id,
      reason.trim() || 'Manual PIN Bypass on Doorstep (Customer verified)',
      currentActorName
    )
    if (res.ok && res.order) {
      setSuccessMessage(res.message)
      if (onOrderUpdated) onOrderUpdated(res.order)
      setTimeout(() => onClose(), 1200)
    } else {
      setErrorMessage(res.message)
    }
  }

  const handleUnassignDriverDirect = () => {
    const res = unassignDriverFromOrder(
      order.id,
      reason.trim() || 'Driver unassigned by manager (Courier vehicle/app breakdown)',
      currentActorName
    )
    if (res.ok && res.order) {
      setSuccessMessage(res.message)
      if (onOrderUpdated) onOrderUpdated(res.order)
      setTimeout(() => onClose(), 1200)
    } else {
      setErrorMessage(res.message)
    }
  }

  const handleToggleBlacklist = () => {
    if (isBlacklisted) {
      unblacklistPhone(order.customer.phone)
      setSuccessMessage(`Phone ${order.customer.phone} removed from blacklist.`)
    } else {
      blacklistPhone(
        order.customer.phone,
        reason.trim() || `Flagged from #${order.shortId} (Prank/abuse order)`,
        currentActorName,
        order.customer.name
      )
      setSuccessMessage(`Phone ${order.customer.phone} added to blacklist. Abusive orders blocked.`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-6 text-white my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛠️</span>
              <h2 className="display text-xl text-white font-bold">
                Manual Problem Fixer &amp; Override
              </h2>
              <span className="font-mono font-bold text-amber-400 text-sm bg-amber-400/10 px-2.5 py-0.5 rounded-lg border border-amber-400/30">
                #{order.shortId}
              </span>
            </div>
            <p className="font-body text-xs text-white/60 mt-1">
              Customer: <strong className="text-white">{order.customer.name}</strong> ({order.customer.phone}) • {order.fulfilment === 'delivery' ? '🛵 Home Delivery' : '🛍️ Pick Up'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 hover:text-white hover:bg-white/10 text-sm"
          >
            ✕ Close
          </button>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300 font-bold flex items-center gap-2">
            <span>⚠️</span> {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300 font-bold flex items-center gap-2">
            <span>✅</span> {successMessage}
          </div>
        )}

        <form onSubmit={handleApplyFix} className="space-y-6 font-body text-xs">
          {/* Quick Problem Fix Presets */}
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 space-y-2">
            <span className="text-[11px] uppercase tracking-wider font-black text-amber-300">
              ⚡ 1-Click Operational Quick Fixes:
            </span>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTargetStatus(order.fulfilment === 'delivery' ? 'delivered' : 'collected')
                  setPaymentStatus('paid')
                  setReason('Customer collected/received and paid in full.')
                }}
                className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 font-bold text-emerald-300 hover:bg-emerald-500/30"
              >
                ✅ Mark Finished &amp; Paid
              </button>

              {order.status === 'cancelled' && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetStatus('accepted')
                    setReason('Un-cancelled order; staff marked cancelled by mistake.')
                  }}
                  className="rounded-lg bg-blue-500/20 border border-blue-500/40 px-3 py-1.5 font-bold text-blue-300 hover:bg-blue-500/30"
                >
                  🔄 Revive Un-cancel to Accepted
                </button>
              )}

              {order.fulfilment === 'delivery' && (
                <button
                  type="button"
                  onClick={handleBypassPinDirect}
                  className="rounded-lg bg-purple-500/20 border border-purple-500/40 px-3 py-1.5 font-bold text-purple-300 hover:bg-purple-500/30"
                >
                  🚪 Bypass PIN &amp; Complete Delivery
                </button>
              )}

              {order.fulfilment === 'delivery' && (order.deliveryDetails?.assignedDriverId || order.driver) && (
                <button
                  type="button"
                  onClick={handleUnassignDriverDirect}
                  className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 font-bold text-amber-300 hover:bg-amber-500/30"
                >
                  🛵 Unassign Courier &amp; Return to Queue
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. ORDER STATUS */}
            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70">
                1. Order Pipeline Status
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as OrderStatus)}
                className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-white/40">
                Force jumps the order pipeline. Overrides kitchen line &amp; customer tracking.
              </p>
            </div>

            {/* 2. PAYMENT STATUS */}
            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70">
                2. Payment Status
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('paid')}
                  className={cx(
                    'rounded-xl py-2.5 px-3 font-bold text-center border transition',
                    paymentStatus === 'paid'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  )}
                >
                  ✅ Marked PAID
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus(order.fulfilment === 'delivery' ? 'pending_delivery' : 'pending_store')}
                  className={cx(
                    'rounded-xl py-2.5 px-3 font-bold text-center border transition',
                    paymentStatus !== 'paid' && paymentStatus !== 'refunded'
                      ? 'bg-amber-400 text-ink border-amber-300 font-black shadow'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  )}
                >
                  ⏳ UNPAID / DUE
                </button>
              </div>
            </div>

            {/* 3. PAYMENT METHOD */}
            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70">
                3. Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="in_store">In-Store Counter Card Machine</option>
                <option value="driver_device">Driver Mobile Card Terminal Device</option>
                <option value="cash">Cash (Counter or Doorstep)</option>
                <option value="card">Manual Card / Chip &amp; Pin</option>
                <option value="complimentary">Complimentary / Store Courtesy (Comped)</option>
              </select>
            </div>

            {/* 4. TOTAL PRICE ADJUSTMENT */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70">
                  4. Adjusted Total Due (£)
                </label>
                <span className="text-[10px] text-white/50">
                  Original: {gbp(order.payment.total)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-amber-400">£</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalPounds}
                  onChange={(e) => setTotalPounds(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-800 pl-7 pr-3 py-2.5 font-mono text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cur = parseFloat(totalPounds) || 0
                    setTotalPounds(Math.max(0, cur - 1).toFixed(2))
                    setReason('Courtesy £1 discount applied for delay.')
                  }}
                  className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:text-white"
                >
                  -£1.00 Discount
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cur = parseFloat(totalPounds) || 0
                    setTotalPounds(Math.max(0, cur - 2).toFixed(2))
                    setReason('£2 compensation applied.')
                  }}
                  className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:text-white"
                >
                  -£2.00 Comp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTotalPounds('0.00')
                    setPaymentMethod('complimentary')
                    setPaymentStatus('paid')
                    setReason('Order 100% comped / courtesy meal by management.')
                  }}
                  className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-amber-300 hover:text-amber-200"
                >
                  Make Free (£0.00)
                </button>
              </div>
            </div>
          </div>

          {/* 5. DELIVERY PIN & FRAUD TOOLS */}
          {order.fulfilment === 'delivery' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-black text-white/80">
                    🛵 Doorstep Delivery Verification
                  </span>
                  <p className="text-[11px] text-white/60">
                    Customer PIN: <strong className="font-mono text-amber-300 text-sm">{order.deliveryDetails?.deliveryPin || 'Not Generated'}</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleToggleBlacklist}
                    className={cx(
                      'rounded-xl border px-3 py-1.5 font-bold transition text-xs',
                      isBlacklisted
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : 'border-red-500/40 bg-red-950/40 text-red-400 hover:bg-red-900/50'
                    )}
                  >
                    {isBlacklisted ? '🟢 Unblock Phone Number' : '🚨 Flag / Blacklist Customer'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 6. MANDATORY REASON NOTE */}
          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider font-bold text-amber-300">
              ✍️ Reason for Manual Fix (Required for Audit Trail)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Customer paid £12 cash at counter; changed from card to cash."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* 7. INTERNAL NOTE */}
          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/60">
              📌 Internal Note (Optional - Visible to Staff)
            </label>
            <textarea
              rows={2}
              placeholder="Add any extra notes regarding customer phone call, allergy, or special arrangements..."
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 font-bold text-white hover:bg-white/10 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-400 px-6 py-2.5 font-black uppercase text-ink hover:bg-amber-300 transition shadow-lg active:scale-95"
            >
              💾 Save &amp; Apply Manual Fix
            </button>
          </div>
        </form>

        {/* Existing Overrides History on this Order */}
        {order.manualOverrides && order.manualOverrides.length > 0 && (
          <div className="border-t border-white/10 pt-4 space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              Previous Overrides on this Order ({order.manualOverrides.length}):
            </h4>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {order.manualOverrides.map((ovr) => (
                <div
                  key={ovr.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[11px] text-white/70"
                >
                  <div className="flex justify-between font-bold text-amber-300">
                    <span>{ovr.overriddenBy}</span>
                    <span className="text-white/40">{new Date(ovr.overriddenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-white text-[10px] mt-0.5">{ovr.changesSummary}</p>
                  <p className="text-white/50 italic text-[10px]">Reason: {ovr.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
