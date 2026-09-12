import { useEffect, useState } from 'react'
import { cancelOrder, getOpenTillChecks, subscribeOrders, type Order } from '../../services/orderStore'
import { gbp } from '../../utils/format'

const VOID_REASONS = [
  'Customer walked out',
  'Customer changed mind',
  'Wrong order entered',
  'Kitchen unable to make',
  'Duplicate check',
  'Other (see note)',
]

interface OpenChecksModalProps {
  onClose: () => void
  /** Load the check into the till to take payment. */
  onSettle: (order: Order) => void
  onReprint: (order: Order) => void
  /** Wraps a manager-PIN prompt; the callback receives the approving manager's name. */
  requireManagerAuth: (title: string, description: string, onApproved: (managerName: string) => void) => void
}

function ageLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function OpenChecksModal({ onClose, onSettle, onReprint, requireManagerAuth }: OpenChecksModalProps) {
  const [checks, setChecks] = useState<Order[]>(() => getOpenTillChecks())
  const [voiding, setVoiding] = useState<Order | null>(null)
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0])
  const [voidNote, setVoidNote] = useState('')

  useEffect(() => subscribeOrders(() => setChecks(getOpenTillChecks())), [])

  const confirmVoid = () => {
    if (!voiding) return
    const reason = voidReason === 'Other (see note)' ? voidNote.trim() || 'Other' : voidReason
    const target = voiding
    requireManagerAuth('Void Open Check', `#${target.shortId} • ${gbp(target.payment.total)} • ${reason}`, () => {
      cancelOrder(target.id, `Till void: ${reason}`)
      setVoiding(null)
      setVoidNote('')
    })
  }

  const outstanding = checks.reduce((sum, c) => sum + c.payment.total, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
          <div>
            <h3 className="font-bold text-sm text-white">🧾 Open Checks</h3>
            <p className="text-[10px] text-white/50">
              {checks.length} unpaid {checks.length === 1 ? 'check' : 'checks'} sent to kitchen &bull; {gbp(outstanding)} outstanding
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close open checks">
            ✕
          </button>
        </div>

        {checks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-white/40">
            No open checks. Use <strong className="text-white/70">Send to Kitchen</strong> to fire an order and take payment when the customer collects.
          </p>
        ) : (
          <ul className="space-y-2 overflow-y-auto flex-1 pr-1">
            {checks.map((c) => {
              const itemsSummary = c.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')
              const isStale = Date.now() - new Date(c.createdAt).getTime() > 45 * 60000
              return (
                <li key={c.id} className="rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-md bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-ink">#{c.shortId}</span>
                        <span className="text-xs font-bold text-white truncate">{c.customer.name}</span>
                        {c.customer.buzzerNumber && <span className="text-[10px] text-amber-300">🔔 {c.customer.buzzerNumber}</span>}
                        {c.customer.tableNumber && <span className="text-[10px] text-indigo-300">🪑 {c.customer.tableNumber}</span>}
                        <span className={`text-[10px] ${isStale ? 'text-rose-300 font-bold' : 'text-white/40'}`}>{ageLabel(c.createdAt)} ago</span>
                        <span className="text-[10px] uppercase tracking-wider text-white/40">{c.status.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/60 line-clamp-2">{itemsSummary}</p>
                    </div>
                    <span className="font-mono text-lg font-black text-amber-300 shrink-0">{gbp(c.payment.total)}</span>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSettle(c)}
                      className="flex-[2] rounded-xl bg-emerald-500 py-2 text-[11px] font-black uppercase tracking-wider text-ink hover:bg-emerald-400"
                    >
                      💷 Settle / Pay
                    </button>
                    <button
                      type="button"
                      onClick={() => onReprint(c)}
                      className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-[11px] font-bold text-white/80 hover:bg-white/15"
                    >
                      🖨️ Ticket
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVoiding(c)
                        setVoidReason(VOID_REASONS[0])
                      }}
                      className="flex-1 rounded-xl border border-rose-500/40 bg-rose-950/40 py-2 text-[11px] font-bold text-rose-300 hover:bg-rose-900/60"
                    >
                      Void
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {voiding && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-3 space-y-2 shrink-0">
            <p className="text-xs font-bold text-rose-200">
              Void check #{voiding.shortId} ({gbp(voiding.payment.total)}) — reason required, manager PIN to confirm.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {VOID_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setVoidReason(r)}
                  className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-bold transition ${
                    voidReason === r ? 'bg-rose-400 text-ink' : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {voidReason === 'Other (see note)' && (
              <input
                type="text"
                value={voidNote}
                onChange={(e) => setVoidNote(e.target.value)}
                placeholder="What happened?"
                className="w-full rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white focus:border-rose-400 focus:outline-none"
              />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setVoiding(null)} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-bold text-white/60">
                Cancel
              </button>
              <button type="button" onClick={confirmVoid} className="flex-[2] rounded-xl bg-rose-500 py-2 text-xs font-black uppercase text-white hover:bg-rose-400">
                Void check →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
