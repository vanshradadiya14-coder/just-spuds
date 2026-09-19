import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cx, gbp } from '../../../utils/format'
import { type Order } from '../../../services/orderStore'
import OrderDetailDrawer from './OrderDetailDrawer'
import { nextStepLabel, sourceBadge, statusTone } from './orderLabels'

interface AdminLiveOrdersProps {
  /** Every order, so the detail drawer can stay open on one that leaves the current filter. */
  allOrders: Order[];
  orderStatusFilter: string;
  setOrderStatusFilter: any;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  filteredOrders: Order[];
  exportOrdersCSV: (orders: Order[]) => void;
  handleAdvanceStatus: (id: string) => void;
  setPrintingOrder: (o: Order) => void;
  handleRefundCancel: (id: string) => void;
  setFixingOrder?: (o: Order) => void;
  setIsCreateManualOrderOpen?: (open: boolean) => void;
}

export default function AdminLiveOrders({
  allOrders,
  orderStatusFilter,
  setOrderStatusFilter,
  searchQuery,
  setSearchQuery,
  filteredOrders,
  exportOrdersCSV,
  handleAdvanceStatus,
  setPrintingOrder,
  handleRefundCancel,
  setFixingOrder,
  setIsCreateManualOrderOpen,
}: AdminLiveOrdersProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const openOrder = openId ? allOrders.find((o) => o.id === openId) : undefined

  return (
    <div className="space-y-6">
      {openOrder && (
        <OrderDetailDrawer
          order={openOrder}
          onClose={() => setOpenId(null)}
          onAdvance={handleAdvanceStatus}
          onPrint={setPrintingOrder}
          onCancel={handleRefundCancel}
          onFix={setFixingOrder}
        />
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'all', label: 'All Orders' },
              { key: 'new', label: '🔔 New (unaccepted)' },
              { key: 'active', label: '🔥 Active in Kitchen' },
              { key: 'delivery', label: '🛵 Delivery' },
              { key: 'pickup', label: '🛍️ Store Pick Up' },
              { key: 'completed', label: '✅ Completed' },
              { key: 'cancelled', label: '❌ Cancelled' },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setOrderStatusFilter(s.key)}
              className={cx(
                'rounded-xl px-3.5 py-1.5 font-body text-xs font-bold transition',
                orderStatusFilter === s.key
                  ? 'bg-amber-400 text-ink font-black shadow'
                  : 'bg-white/5 text-white/70 hover:text-white'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders, phone, customer..."
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none w-full sm:w-64"
          />
          {setIsCreateManualOrderOpen && (
            <button
              type="button"
              onClick={() => setIsCreateManualOrderOpen(true)}
              className="rounded-xl bg-amber-400 px-3.5 py-2 font-body text-xs font-black text-ink hover:bg-amber-300 shadow transition whitespace-nowrap active:scale-95"
            >
              📝 + Phone / Till Order
            </button>
          )}
          <button
            type="button"
            onClick={() => exportOrdersCSV(filteredOrders)}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 font-body text-xs font-bold text-white hover:bg-white/15 whitespace-nowrap"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 overflow-x-auto custom-scrollbar shadow-2xl">
        <table className="w-full min-w-[960px] text-left font-body text-xs">
          <thead className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase text-white/50">
            <tr>
              <th className="p-4">Order ID &amp; Time</th>
              <th className="p-4">Customer &amp; Address</th>
              <th className="p-4">Items &amp; Customizations</th>
              <th className="p-4">Type</th>
              <th className="p-4">Status</th>
              <th className="p-4">Total</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-white/50">
                  No orders match your active filter.
                </td>
              </tr>
            ) : (
              filteredOrders.map((ord) => (
                <tr
                  key={ord.id}
                  className="hover:bg-white/[0.04] transition cursor-pointer"
                  onClick={() => setOpenId(ord.id)}
                  title="Open order details"
                >
                  <td className="p-4">
                    <p className="font-mono font-bold text-white text-sm">#{ord.shortId}</p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </td>

                  <td className="p-4">
                    <p className="font-bold text-white">{ord.customer.name}</p>
                    <p className="text-[11px] text-white/60">{ord.customer.phone}</p>
                    {ord.customer.streetAddress && (
                      <p className="text-[10px] text-amber-300/80 truncate max-w-xs">
                        📍 {ord.customer.streetAddress}, {ord.customer.postcode}
                      </p>
                    )}
                  </td>

                  <td className="p-4 max-w-xs">
                    <div className="space-y-1">
                      {ord.lines.map((l, i) => (
                        <div key={i} className="text-[11px]">
                          <span className="font-bold text-white">{l.qty}x {l.name}</span>
                          {l.meal && <span className="text-amber-400 font-bold ml-1">(Meal Deal)</span>}
                          {l.extras.length > 0 && (
                            <p className="text-[10px] text-white/60 truncate">+ {l.extras.join(', ')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="space-y-1">
                      <span
                        className={cx(
                          'inline-block rounded-lg px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
                          ord.fulfilment === 'delivery'
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                            : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/40'
                        )}
                      >
                        {ord.fulfilment === 'delivery' ? '🛵 Delivery' : '🛍️ Pick Up'}
                      </span>
                      <span className={cx('block w-fit rounded-lg border px-2 py-0.5 text-[10px] font-bold', sourceBadge(ord).tone)}>
                        {sourceBadge(ord).label}
                      </span>
                      {ord.deliveryDetails?.deliveryPin && (
                        <p className="text-[10px] font-mono text-amber-300 font-bold">
                          PIN: {ord.deliveryDetails.deliveryPin}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="space-y-1">
                      <span className={cx('inline-block rounded-md border px-2 py-0.5 text-[10px] font-black uppercase', statusTone(ord.status), ord.status === 'baking' || ord.status === 'out_for_delivery' ? 'animate-pulse' : '')}>
                        {ord.status.replace(/_/g, ' ')}
                      </span>
                      {ord.deliveryDetails?.assignedDriverName && (
                        <p className="text-[10px] text-white/60">
                          🛵 {ord.deliveryDetails.assignedDriverName}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="p-4 font-bold text-white">
                    <p className="text-sm">{gbp(ord.payment.total)}</p>
                    <p className="text-[10px] text-white/50 uppercase">
                      {ord.payment.status === 'paid' ? 'PAID' : ord.fulfilment === 'delivery' ? 'DRIVER DEVICE' : 'AT COUNTER'}
                    </p>
                  </td>

                  <td className="p-4 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenId(ord.id)}
                      className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/15"
                    >
                      View
                    </button>
                    {setFixingOrder && (
                      <button
                        type="button"
                        onClick={() => setFixingOrder(ord)}
                        className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-400/25 transition"
                        title="Manual Problem Fixer & Operational Override"
                      >
                        🛠️ Manual Fix
                      </button>
                    )}

                    {nextStepLabel(ord) && (
                      <button
                        type="button"
                        onClick={() => handleAdvanceStatus(ord.id)}
                        className={cx(
                          'rounded-lg px-2.5 py-1 text-[11px] font-bold transition shadow active:scale-95',
                          ord.status === 'placed' ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 animate-pulse' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
                        )}
                        title="Move this order to its next step"
                      >
                        {nextStepLabel(ord)}
                      </button>
                    )}
                    {['ready_for_delivery', 'driver_assigned', 'driver_arrived_at_store'].includes(ord.status) && (
                      <span className="inline-block rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/50" title="Handled from the KDS / driver app">
                        with courier
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setPrintingOrder(ord)}
                      className="rounded-lg border border-white/20 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-white/10"
                    >
                      🖨️
                    </button>

                    {!['cancelled', 'delivered', 'collected'].includes(ord.status) && (
                      <button
                        type="button"
                        onClick={() => handleRefundCancel(ord.id)}
                        className="rounded-lg border border-red-500/30 bg-red-950/20 px-2 py-1 text-[11px] font-bold text-red-400 hover:bg-red-900/40"
                        title={ord.payment.status === 'paid' ? 'Cancel the order and refund the customer' : 'Cancel the order (nothing was charged)'}
                      >
                        {ord.payment.status === 'paid' ? 'Cancel & refund' : 'Cancel'}
                      </button>
                    )}

                    <Link
                      to={`/track/${ord.id}`}
                      className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20"
                    >
                      Track →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
