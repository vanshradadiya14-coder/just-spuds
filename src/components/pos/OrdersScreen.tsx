import { useEffect, useMemo, useState } from 'react'
import {
  cancelOrder,
  getOpenTillChecks,
  getStoredOrders,
  isForLaterDay,
  refundOrder,
  subscribeOrders,
  type Order,
} from '../../services/orderStore'
import { getHeldTickets, subscribeHeldTickets, takeHeldTicket, type HeldTicket } from '../../services/heldTickets'
import { recordTillVoid } from '../../services/tillStore'
import { lineUnitPrice } from '../../hooks/useCart'
import { gbp } from '../../utils/format'

/**
 * EPOS "Orders": Held · Open (sent, not paid) · Complete, with a date filter,
 * search and the columns EPOS shows — time, order, customer, staff, tender,
 * total. Receipts, refunds, recalls and voids all start here.
 */

export type OrdersTab = 'held' | 'open' | 'complete'

const VOID_REASONS = ['Customer walked out', 'Customer changed mind', 'Wrong order entered', 'Kitchen unable to make', 'Duplicate check', 'No-show (online order)']
const REFUND_REASONS = ['Customer return', 'Wrong item made', 'Quality issue', 'Overcharged', 'Long wait / service', 'Other']

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—')
const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export function staffOf(o: Order): string {
  if (o.payment.takenBy) return o.payment.takenBy
  const m = /by ([^•]+?)(?:\s*$|\s*•)/.exec(o.payment.paidNote || '')
  return m ? m[1].trim() : o.source === 'WEBSITE' ? 'Website' : '—'
}

export function tenderOf(o: Order): string {
  const p = o.payment
  if (p.splitDetails && p.splitDetails.length > 1) {
    return p.splitDetails.map((s) => `${s.method === 'cash' ? 'Cash' : s.method === 'card' ? 'Card' : 'Link'} ${gbp(s.amount)}`).join(' + ')
  }
  switch (p.method) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'split':
      return 'Split'
    case 'apple_pay':
      return 'Apple Pay'
    case 'google_pay':
      return 'Google Pay'
    case 'complimentary':
      return 'Comp'
    case 'driver_device':
      return 'Driver'
    default:
      return 'Counter'
  }
}

const refundedSoFar = (o: Order) => (o.payment.manualAdjustment ? o.payment.manualAdjustment.originalTotal - o.payment.manualAdjustment.adjustedTotal : o.payment.status === 'refunded' ? o.payment.total : 0)

interface OrdersScreenProps {
  initialTab?: OrdersTab
  actor: string
  onClose: () => void
  onRecallHeld: (ticket: HeldTicket) => void
  onSettle: (order: Order) => void
  onReprint: (order: Order) => void
  requireManagerAuth: (title: string, description: string, onApproved: (managerName: string) => void) => void
  onFlash: (message: string) => void
}

export default function OrdersScreen({ initialTab = 'complete', actor, onClose, onRecallHeld, onSettle, onReprint, requireManagerAuth, onFlash }: OrdersScreenProps) {
  const [tab, setTab] = useState<OrdersTab>(initialTab)
  const [orders, setOrders] = useState<Order[]>(() => getStoredOrders())
  const [held, setHeld] = useState<HeldTicket[]>(() => getHeldTickets())
  const [day, setDay] = useState(() => isoDay(new Date()))
  const [source, setSource] = useState<'all' | 'TILL' | 'PHONE' | 'WEBSITE'>('all')
  const [query, setQuery] = useState('')
  const [voiding, setVoiding] = useState<Order | null>(null)
  const [refunding, setRefunding] = useState<Order | null>(null)

  useEffect(() => subscribeOrders((all) => setOrders(all)), [])
  useEffect(() => subscribeHeldTickets(setHeld), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !voiding && !refunding) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, voiding, refunding])

  const open = useMemo(() => {
    void orders
    return getOpenTillChecks().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [orders])

  const complete = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders
      .filter((o) => !o.isTest && (o.payment.status === 'paid' || o.payment.status === 'refunded'))
      .filter((o) => isoDay(new Date(o.payment.paidAt || o.createdAt)) === day)
      .filter((o) => source === 'all' || o.source === source)
      .filter((o) => !q || o.shortId.toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) || (o.customer.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')))
      .sort((a, b) => (b.payment.paidAt || b.createdAt).localeCompare(a.payment.paidAt || a.createdAt))
  }, [orders, day, source, query])

  const completeTotal = complete.reduce((n, o) => n + o.payment.total - refundedSoFar(o), 0)

  const shiftDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`)
    d.setDate(d.getDate() + delta)
    setDay(isoDay(d))
  }

  const TabButton = ({ id, label, count }: { id: OrdersTab; label: string; count?: number }) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`relative shrink-0 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${tab === id ? 'text-amber-300' : 'text-white/55 hover:text-white'}`}
    >
      {label}
      {typeof count === 'number' && count > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 font-mono text-[10px] text-ink">{count}</span>}
      {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white font-body" role="dialog" aria-modal="true" aria-label="Orders">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-900 px-2">
        <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg text-white/70 hover:bg-white/10 hover:text-white" aria-label="Back to till">
          ←
        </button>
        <h2 className="hidden shrink-0 text-sm font-black sm:block">Orders</h2>
        <div className="flex min-w-0 flex-1 justify-center overflow-x-auto scrollbar-none" role="tablist">
          <TabButton id="held" label="Held" count={held.length} />
          <TabButton id="open" label="Open" count={open.length} />
          <TabButton id="complete" label="Complete" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className="mx-auto max-w-5xl space-y-3">
          {tab === 'held' &&
            (held.length === 0 ? (
              <Empty text="No held tickets. Use Hold on the till to park a ticket and serve the next customer." />
            ) : (
              <ul className="space-y-2">
                {held.map((t) => {
                  const total = t.lines.reduce((n, l) => n + lineUnitPrice(l) * l.qty, 0)
                  return (
                    <li key={t.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black">{t.customer}</p>
                        <p className="text-[11px] text-white/50">
                          Held {time(t.heldAt)} by {t.heldBy} • {t.type.replace('_', ' ')}
                          {t.buzzer ? ` • buzzer ${t.buzzer}` : ''}
                          {t.table ? ` • table ${t.table}` : ''}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-white/60">{t.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-base font-black text-amber-300">{gbp(total)}</span>
                        <button type="button" onClick={() => onRecallHeld(t)} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black uppercase text-ink hover:bg-amber-300">
                          Recall
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            requireManagerAuth('Delete held ticket', `${t.customer} • ${gbp(total)}`, (mgr) => {
                              const gone = takeHeldTicket(t.id)
                              if (!gone) return
                              recordTillVoid({
                                kind: 'ticket',
                                staff: gone.heldBy,
                                approvedBy: mgr,
                                item: `Held ticket: ${gone.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')}`,
                                qty: gone.lines.reduce((n, l) => n + l.qty, 0),
                                value: total,
                                reason: 'Held ticket deleted',
                              })
                              onFlash(`Held ticket for ${gone.customer} deleted`)
                            })
                          }
                          className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-900/60"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ))}

          {tab === 'open' &&
            (open.length === 0 ? (
              <Empty text="Nothing waiting for payment. Sent tickets and website orders paid on collection appear here." />
            ) : (
              <ul className="space-y-2">
                {open.map((o) => {
                  const later = isForLaterDay(o)
                  const stale = !later && Date.now() - new Date(o.createdAt).getTime() > 45 * 60000
                  return (
                    <li key={o.id} className="rounded-2xl border border-white/10 bg-slate-900 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-ink">#{o.shortId}</span>
                            {o.source === 'WEBSITE' && <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-black text-sky-200">WEB</span>}
                            {o.source === 'PHONE' && <span className="rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-black text-purple-200">PHONE</span>}
                            <span className="text-sm font-bold">{o.customer.name}</span>
                            {o.customer.buzzerNumber && <span className="text-[11px] text-amber-300">🔔 {o.customer.buzzerNumber}</span>}
                            {o.customer.tableNumber && <span className="text-[11px] text-indigo-300">🪑 {o.customer.tableNumber}</span>}
                          </div>
                          <p className={`mt-0.5 text-[11px] ${stale ? 'font-bold text-rose-300' : 'text-white/50'}`}>
                            {later ? `Pre-order for ${o.scheduledFor || o.scheduleDate}` : `${ago(o.createdAt)} • ${o.status.replace(/_/g, ' ')}`}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-white/60">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
                        </div>
                        <span className="shrink-0 font-mono text-lg font-black text-amber-300">{gbp(o.payment.total)}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => onSettle(o)} className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-xs font-black uppercase tracking-wider text-ink hover:bg-emerald-400">
                          💷 Take payment
                        </button>
                        <button type="button" onClick={() => onReprint(o)} className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold text-white/80 hover:bg-white/15">
                          🖨️ Ticket
                        </button>
                        <button type="button" onClick={() => setVoiding(o)} className="flex-1 rounded-xl border border-rose-500/40 bg-rose-950/40 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-900/60">
                          Void
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ))}

          {tab === 'complete' && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 p-2">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => shiftDay(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" aria-label="Previous day">
                    ‹
                  </button>
                  <input
                    type="date"
                    value={day}
                    max={isoDay(new Date())}
                    onChange={(e) => e.target.value && setDay(e.target.value)}
                    className="h-10 rounded-xl border border-white/10 bg-black/50 px-2 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none"
                    aria-label="Day"
                  />
                  <button type="button" onClick={() => shiftDay(1)} disabled={day >= isoDay(new Date())} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30" aria-label="Next day">
                    ›
                  </button>
                </div>
                <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="h-10 rounded-xl border border-white/10 bg-black/50 px-2 text-sm text-white focus:border-amber-400 focus:outline-none" aria-label="Channel">
                  <option value="all">All channels</option>
                  <option value="TILL">Till</option>
                  <option value="PHONE">Phone</option>
                  <option value="WEBSITE">Website</option>
                </select>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Order #, name or phone"
                  className="h-10 min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-black/50 px-3 text-sm text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <p className="px-1 text-[11px] text-white/50">
                {complete.length} order{complete.length === 1 ? '' : 's'} • {gbp(completeTotal)} after refunds
              </p>

              {complete.length === 0 ? (
                <Empty text="No completed orders for this day." />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <div className="hidden grid-cols-[4rem_7rem_minmax(0,1fr)_minmax(0,8rem)_minmax(0,9rem)_5.5rem_10rem] gap-2 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/45 lg:grid">
                    <span>Time</span>
                    <span>Order</span>
                    <span>Customer</span>
                    <span>Staff</span>
                    <span>Tender</span>
                    <span className="text-right">Total</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-white/5">
                    {complete.map((o) => {
                      const refunded = refundedSoFar(o)
                      const fully = o.payment.status === 'refunded'
                      const ref = (
                        <span className="font-mono font-bold text-amber-300">
                          #{o.shortId}
                          {fully && <span className="ml-1 rounded bg-rose-500/20 px-1 text-[9px] text-rose-200">REFUNDED</span>}
                          {!fully && refunded > 0 && <span className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-200">PART REFUND</span>}
                        </span>
                      )
                      const actions = (
                        <span className="flex shrink-0 justify-end gap-1.5">
                          <button type="button" onClick={() => onReprint(o)} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold hover:bg-white/15">
                            🖨️ Receipt
                          </button>
                          {!fully && (
                            <button type="button" onClick={() => setRefunding(o)} className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-900/60">
                              ↩ Refund
                            </button>
                          )}
                        </span>
                      )
                      return (
                        <li key={o.id} className="bg-slate-950 px-3 py-2.5 text-xs">
                          {/* Phone / tablet: a small card */}
                          <div className="space-y-1 lg:hidden">
                            <div className="flex items-center justify-between gap-2">
                              {ref}
                              <span className="font-mono text-sm font-black">{gbp(o.payment.total)}</span>
                            </div>
                            <div className="flex justify-between gap-3 text-white/60">
                              <span className="truncate">
                                {time(o.payment.paidAt || o.createdAt)} • {o.customer.name}
                              </span>
                              <span className="shrink-0">{tenderOf(o)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-white/45">{staffOf(o)}</span>
                              {actions}
                            </div>
                          </div>
                          {/* Desktop: the EPOS columns */}
                          <div className="hidden grid-cols-[4rem_7rem_minmax(0,1fr)_minmax(0,8rem)_minmax(0,9rem)_5.5rem_10rem] items-center gap-2 lg:grid">
                            <span className="font-mono text-white/60">{time(o.payment.paidAt || o.createdAt)}</span>
                            {ref}
                            <span className="truncate">{o.customer.name}</span>
                            <span className="truncate text-white/60">{staffOf(o)}</span>
                            <span className="truncate text-white/60">{tenderOf(o)}</span>
                            <span className="text-right font-mono font-black">{gbp(o.payment.total)}</span>
                            {actions}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {voiding && (
        <VoidDialog
          order={voiding}
          onCancel={() => setVoiding(null)}
          onConfirm={(reason) => {
            const target = voiding
            requireManagerAuth('Void open order', `#${target.shortId} • ${gbp(target.payment.total)} • ${reason}`, (mgr) => {
              const res = cancelOrder(target.id, `Till void: ${reason}`)
              if (res.ok) {
                recordTillVoid({
                  kind: 'check',
                  staff: actor,
                  approvedBy: mgr,
                  item: `#${target.shortId}: ${target.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')}`,
                  qty: target.lines.reduce((n, l) => n + l.qty, 0),
                  value: target.payment.total,
                  reason,
                  orderShortId: target.shortId,
                })
              }
              onFlash(res.ok ? `#${target.shortId} voided — ${reason}` : res.message)
              setVoiding(null)
            })
          }}
        />
      )}

      {refunding && (
        <RefundDialog
          order={refunding}
          onCancel={() => setRefunding(null)}
          onConfirm={(amount, reason, method) => {
            const target = refunding
            requireManagerAuth('Refund', `#${target.shortId} • ${gbp(amount)} by ${method} • ${reason}`, (mgr) => {
              const res = refundOrder(target.id, amount, reason, mgr, method)
              onFlash(res.ok ? `#${target.shortId}: ${gbp(amount)} refunded by ${method} — ${mgr}` : res.message)
              setRefunding(null)
            })
          }}
        />
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-xs text-white/45">{text}</p>
}

function VoidDialog({ order, onCancel, onConfirm }: { order: Order; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(order.source === 'WEBSITE' ? VOID_REASONS[5] : VOID_REASONS[0])
  return (
    <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Void order">
      <div className="w-full max-w-sm space-y-3 rounded-3xl border border-rose-500/40 bg-slate-900 p-5 text-white shadow-2xl">
        <p className="text-sm font-black">
          Void #{order.shortId} ({gbp(order.payment.total)})
        </p>
        <p className="text-xs text-white/60">The kitchen ticket is cancelled and stock goes back. Pick a reason — a manager PIN confirms it.</p>
        <div className="grid gap-1.5">
          {VOID_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${reason === r ? 'bg-rose-400 text-ink' : 'bg-white/5 text-white/80 hover:bg-white/10'}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-white/15 py-3 text-xs font-bold text-white/70 hover:bg-white/10">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(reason)} className="rounded-xl bg-rose-500 py-3 text-xs font-black uppercase text-white hover:bg-rose-400">
            Void
          </button>
        </div>
      </div>
    </div>
  )
}

function RefundDialog({ order, onCancel, onConfirm }: { order: Order; onCancel: () => void; onConfirm: (amount: number, reason: string, method: 'cash' | 'card') => void }) {
  const left = Math.max(0, order.payment.total - refundedSoFar(order))
  const paidCash = order.payment.method === 'cash' || order.payment.method === 'in_store' || (order.payment.splitDetails || []).some((s) => s.method === 'cash')
  const [amountText, setAmountText] = useState((left / 100).toFixed(2))
  const [reason, setReason] = useState(REFUND_REASONS[0])
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<'cash' | 'card'>(order.payment.method === 'card' ? 'card' : paidCash ? 'cash' : 'card')
  const amount = Math.round((parseFloat(amountText) || 0) * 100)
  const valid = amount > 0 && amount <= left
  const finalReason = reason === 'Other' ? note.trim() || 'Other' : reason

  return (
    <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Refund">
      <div className="w-full max-w-sm space-y-3 rounded-3xl border border-rose-500/40 bg-slate-900 p-5 text-white shadow-2xl">
        <p className="text-sm font-black">Refund #{order.shortId}</p>
        <p className="text-xs text-white/60">
          Paid {gbp(order.payment.total)} ({tenderOf(order)}). Up to {gbp(left)} can be refunded.
        </p>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
          Amount
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-lg">£</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmountText(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-right font-mono text-xl font-black text-white focus:border-rose-400 focus:outline-none"
            />
            <button type="button" onClick={() => setAmountText((left / 100).toFixed(2))} className="shrink-0 rounded-lg border border-white/15 px-2 py-2 text-[11px] font-bold normal-case tracking-normal text-white/70 hover:bg-white/10">
              All
            </button>
          </div>
        </label>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/50">Give back by</p>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'card'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-xl py-2.5 text-xs font-black uppercase transition ${method === m ? 'bg-amber-400 text-ink' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
                {m === 'cash' ? '💵 Cash from drawer' : '💳 Card machine'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {REFUND_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-xl px-2.5 py-2 text-left text-[11px] font-bold transition ${reason === r ? 'bg-rose-400 text-ink' : 'bg-white/5 text-white/75 hover:bg-white/10'}`}>
              {r}
            </button>
          ))}
        </div>
        {reason === 'Other' && (
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-rose-400 focus:outline-none" />
        )}
        {!valid && amount > left && <p className="text-[11px] font-bold text-rose-300">That is more than is left to refund.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-white/15 py-3 text-xs font-bold text-white/70 hover:bg-white/10">
            Cancel
          </button>
          <button type="button" disabled={!valid} onClick={() => onConfirm(amount, finalReason, method)} className="rounded-xl bg-rose-500 py-3 text-xs font-black uppercase text-white hover:bg-rose-400 disabled:opacity-40">
            Refund {valid ? gbp(amount) : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
