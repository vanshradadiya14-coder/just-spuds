import { useEffect, useMemo, useState } from 'react'
import {
  calculateDenominationsTotal,
  closeTillShift,
  EMPTY_DENOMINATIONS,
  performNoSaleDrawerKick,
  type CashDenominations,
  type TillShift,
} from '../../services/tillStore'
import { getStoredOrders, subscribeOrders, type Order } from '../../services/orderStore'
import { getCategories, getProducts } from '../../services/menuStore'
import { isVatRegistered } from '../../services/vat'
import { buildEndOfDayReport, type EndOfDayReport, type ReportRow } from '../../services/endOfDayReport'
import { subscribeSyncStatus, syncNow, type SyncStatus } from '../../services/cloudSync'
import { gbp } from '../../utils/format'

/**
 * EPOS "Close Till": a checklist (unsynced sales, open orders, held tickets),
 * the day's figures, then Print & Close — which freezes the end-of-day report
 * on the shift and prints it.
 *
 * Counting the drawer is optional: most days the shop closes on the figures the
 * till worked out. If nobody counts, the report simply has no counted column —
 * never a "Counted £0.00" that would read as a whole day's shortfall.
 */

const DENOMS: { key: keyof CashDenominations; label: string; value: number }[] = [
  { key: 'note50', label: '£50', value: 5000 },
  { key: 'note20', label: '£20', value: 2000 },
  { key: 'note10', label: '£10', value: 1000 },
  { key: 'note5', label: '£5', value: 500 },
  { key: 'coin2', label: '£2', value: 200 },
  { key: 'coin1', label: '£1', value: 100 },
  { key: 'coin50p', label: '50p', value: 50 },
  { key: 'coin20p', label: '20p', value: 20 },
  { key: 'coin10p', label: '10p', value: 10 },
  { key: 'coin5p', label: '5p', value: 5 },
  { key: 'coin2p', label: '2p', value: 2 },
  { key: 'coin1p', label: '1p', value: 1 },
]

type Tab = 'summary' | 'sales' | 'refunds' | 'voids' | 'tax'

const signed = (n: number) => (n > 0 ? `+${gbp(n)}` : gbp(n))
const toPence = (s: string) => {
  const v = parseFloat(s)
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : undefined
}

export default function CloseTillScreen({
  shift,
  userName,
  blindClose,
  heldCount,
  openChecksDue,
  onBack,
  onOpenOrders,
  onShowReport,
  onShowHistory,
  onClosed,
}: {
  shift: TillShift
  userName: string
  blindClose: boolean
  heldCount: number
  openChecksDue: Order[]
  onBack: () => void
  onOpenOrders: (tab: 'held' | 'open' | 'complete') => void
  onShowReport: (report: EndOfDayReport) => void
  onShowHistory: () => void
  onClosed: (closed: TillShift) => void
}) {
  const [orders, setOrders] = useState<Order[]>(() => getStoredOrders())
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [denoms, setDenoms] = useState<CashDenominations>({ ...EMPTY_DENOMINATIONS })
  const [counting, setCounting] = useState(false)
  const [cashDone, setCashDone] = useState(false)
  const [cardText, setCardText] = useState('')
  const [otherText, setOtherText] = useState('')
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('summary')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeOrders(setOrders), [])
  useEffect(() => subscribeSyncStatus(setSync), [])

  const live = useMemo(
    () => buildEndOfDayReport({ shift, orders, products: getProducts(), categories: getCategories(), vatRegistered: isVatRegistered(), kind: 'X' }),
    [shift, orders],
  )

  const countedCash = calculateDenominationsTotal(denoms)
  const cashVariance = countedCash - shift.expectedCash
  const showExpected = !blindClose || cashDone
  const cardTaken = live.tenders.find((t) => t.key === 'card')?.taken ?? 0
  const otherTaken = live.tenders.find((t) => t.key === 'other')?.taken ?? 0
  const countedCard = toPence(cardText)
  const countedOther = toPence(otherText)
  const cardVariance = typeof countedCard === 'number' ? countedCard - cardTaken : undefined
  const totalVariance = cashDone ? cashVariance + (cardVariance ?? 0) + (typeof countedOther === 'number' ? countedOther - otherTaken : 0) : undefined

  // With no cloud sync set up nothing is waiting to upload — everything lives on this till.
  const syncOff = !sync || sync.state === 'off'
  const pending = syncOff ? 0 : sync?.pending ?? 0
  const blocked = openChecksDue.length > 0

  const doClose = () => {
    if (busy) return
    setBusy(true)
    try {
      const { closedShift } = closeTillShift(userName, cashDone ? denoms : null, note, {
        countedCard,
        countedOther: otherTaken > 0 ? countedOther : undefined,
        buildReport: (closed) =>
          buildEndOfDayReport({ shift: closed, orders: getStoredOrders(), products: getProducts(), categories: getCategories(), vatRegistered: isVatRegistered(), kind: 'Z' }),
      })
      onClosed(closedShift)
    } finally {
      setBusy(false)
    }
  }

  const requestClose = () => {
    if (blocked) return
    if (!cashDone) {
      doClose()
      return
    }
    if (countedCash === 0 && shift.expectedCash > 0) {
      setConfirm(`You counted £0.00 but ${gbp(shift.expectedCash)} should be in the drawer. Close with an empty count?`)
      return
    }
    if (Math.abs(cashVariance) >= 500) {
      setConfirm(`The drawer is ${cashVariance < 0 ? 'short' : 'over'} by ${gbp(Math.abs(cashVariance))}. Count it again before closing?`)
      return
    }
    doClose()
  }

  const Check = ({ ok, warn, title, detail, action }: { ok: boolean; warn?: boolean; title: string; detail: string; action?: { label: string; run: () => void } }) => (
    <li className="flex items-center gap-3 py-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black ${ok ? 'bg-emerald-500/20 text-emerald-300' : warn ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'}`} aria-hidden>
        {ok ? '✓' : '!'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] text-white/50">{detail}</span>
      </span>
      {action && (
        <button type="button" onClick={action.run} className="shrink-0 rounded-lg border border-sky-400/50 px-3 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/15">
          {action.label}
        </button>
      )}
    </li>
  )

  const TabButton = ({ id, label }: { id: Tab; label: string }) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`relative shrink-0 px-3 py-3 text-xs font-black uppercase tracking-wider transition ${tab === id ? 'text-amber-300' : 'text-white/55 hover:text-white'}`}
    >
      {label}
      {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white font-body" role="dialog" aria-modal="true" aria-label="Close till">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-900 px-2 py-1">
        <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg text-white/70 hover:bg-white/10 hover:text-white" aria-label="Back to till">
          ←
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black">Close till — {shift.tillName || 'Till 1'}</h2>
          <p className="truncate text-[11px] text-white/50">
            Shift #{shift.shiftNumber} • opened by {shift.openedBy} • {new Date(shift.openedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* Left: checklist + actions (EPOS left column) */}
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-white/45">Checklist</p>
              <ul className="divide-y divide-white/5">
                <Check
                  ok={pending === 0}
                  warn
                  title={syncOff ? 'Cloud sync off' : `${pending} unsynced transaction${pending === 1 ? '' : 's'}`}
                  detail={syncOff ? 'Sales are kept on this till only.' : pending === 0 ? 'Everything is uploaded.' : 'They upload automatically once online.'}
                  action={pending > 0 ? { label: 'Sync now', run: () => void syncNow() } : undefined}
                />
                <Check
                  ok={openChecksDue.length === 0}
                  title={`${openChecksDue.length} open order${openChecksDue.length === 1 ? '' : 's'}`}
                  detail={openChecksDue.length === 0 ? 'Nothing waiting for payment.' : 'Take payment or void before closing.'}
                  action={openChecksDue.length > 0 ? { label: 'View', run: () => onOpenOrders('open') } : undefined}
                />
                <Check
                  ok={heldCount === 0}
                  warn
                  title={`${heldCount} held ticket${heldCount === 1 ? '' : 's'}`}
                  detail={heldCount === 0 ? 'No parked tickets.' : 'Optional — they stay on this till.'}
                  action={heldCount > 0 ? { label: 'View', run: () => onOpenOrders('held') } : undefined}
                />
                <Check
                  ok
                  title="Cash up"
                  detail={cashDone ? `Counted ${gbp(countedCash)}` : 'Optional — close on the expected figures, or count the drawer.'}
                  action={{ label: cashDone ? 'Recount' : 'Count', run: () => setCounting(true) }}
                />
                <Check
                  ok={typeof countedCard === 'number'}
                  warn
                  title="Card machine total"
                  detail={typeof countedCard === 'number' ? `Entered ${gbp(countedCard)}` : 'Optional — from the card machine end-of-day slip.'}
                />
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] font-bold">
              <button type="button" onClick={() => onShowReport(live)} className="rounded-xl border border-white/10 bg-slate-900 px-2 py-3 hover:bg-white/10">
                🖨️<br />X read
              </button>
              <button type="button" onClick={() => performNoSaleDrawerKick(userName, 'Cash up count')} className="rounded-xl border border-white/10 bg-slate-900 px-2 py-3 hover:bg-white/10">
                🔓<br />Open drawer
              </button>
              <button type="button" onClick={() => setNoteOpen((v) => !v)} className={`rounded-xl border px-2 py-3 hover:bg-white/10 ${note ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-slate-900'}`}>
                ✎<br />{note ? 'Note added' : 'Add note'}
              </button>
              <button type="button" onClick={() => onOpenOrders('complete')} className="rounded-xl border border-white/10 bg-slate-900 px-2 py-3 hover:bg-white/10">
                ✓<br />Completed
              </button>
              <button type="button" onClick={onShowHistory} className="col-span-2 rounded-xl border border-white/10 bg-slate-900 px-2 py-3 hover:bg-white/10">
                🗂️<br />History
              </button>
            </div>
            {noteOpen && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Anything the owner should know (e.g. £5 short — gave wrong change at 2pm)"
                className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
              />
            )}

            <button
              type="button"
              disabled={blocked || busy}
              onClick={requestClose}
              className="w-full rounded-2xl bg-blue-500 py-4 text-sm font-black uppercase tracking-wider text-white shadow-glow hover:bg-blue-400 disabled:opacity-40"
            >
              Print &amp; close
            </button>
            {blocked && <p className="text-center text-[11px] text-white/50">Settle or void the open orders first.</p>}
          </div>

          {/* Right: figures (EPOS Summary / Sales / Refunds / Void / Tax) */}
          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: 'Transactions', value: String(live.sales.transactions) },
                { label: 'Counted', value: cashDone ? gbp(countedCash + (countedCard ?? 0) + (countedOther ?? 0)) : '—' },
                { label: 'Takings', value: showExpected ? gbp(live.takings.taken) : '🔒' },
                { label: 'Float', value: gbp(shift.startingFloat) },
                { label: 'Variance', value: typeof totalVariance === 'number' && showExpected ? signed(totalVariance) : '—', tone: typeof totalVariance === 'number' && Math.abs(totalVariance) >= 100 ? 'text-rose-300' : 'text-emerald-300' },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-slate-900 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-white/45">{s.label}</p>
                  <p className={`mt-0.5 font-mono text-lg font-black ${s.tone || 'text-white'}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900">
              <div className="flex overflow-x-auto border-b border-white/10 px-1 scrollbar-none" role="tablist">
                <TabButton id="summary" label="Summary" />
                <TabButton id="sales" label="Sales" />
                <TabButton id="refunds" label="Refunds" />
                <TabButton id="voids" label="Voids" />
                <TabButton id="tax" label="Tax" />
              </div>
              <div className="p-3">
                {tab === 'summary' && (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-white/45">Cash drawer</p>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
                        <span className="text-white/70">Opening float</span>
                        <span className="text-right font-mono">{gbp(live.drawer.float)}</span>
                        {live.drawer.floatAdjust !== 0 && (
                          <>
                            <span className="text-white/70">Float in / out</span>
                            <span className="text-right font-mono">{signed(live.drawer.floatAdjust)}</span>
                          </>
                        )}
                        <span className="text-white/70">Cash sales</span>
                        <span className="text-right font-mono">+{gbp(live.drawer.cashSales)}</span>
                        {live.drawer.cashRefunds > 0 && (
                          <>
                            <span className="text-white/70">Cash refunds</span>
                            <span className="text-right font-mono">{gbp(-live.drawer.cashRefunds)}</span>
                          </>
                        )}
                        {live.drawer.petty > 0 && (
                          <>
                            <span className="text-white/70">Petty cash</span>
                            <span className="text-right font-mono">{gbp(-live.drawer.petty)}</span>
                          </>
                        )}
                        {live.drawer.tipOuts > 0 && (
                          <>
                            <span className="text-white/70">Tip outs</span>
                            <span className="text-right font-mono">{gbp(-live.drawer.tipOuts)}</span>
                          </>
                        )}
                        <span className="border-t border-white/10 pt-1 font-bold">Expected in drawer</span>
                        <span className="border-t border-white/10 pt-1 text-right font-mono font-bold">{showExpected ? gbp(shift.expectedCash) : '🔒 after count'}</span>
                        <span className="font-bold">Counted</span>
                        <span className="text-right font-mono font-bold">
                          {cashDone ? gbp(countedCash) : (
                            <button type="button" onClick={() => setCounting(true)} className="rounded-lg border border-white/20 px-3 py-1 text-xs font-bold text-white/70 hover:bg-white/10">
                              Not counted — count
                            </button>
                          )}
                        </span>
                        {cashDone && showExpected && (
                          <>
                            <span className="font-bold">Variance</span>
                            <span className={`text-right font-mono font-black ${Math.abs(cashVariance) < 1 ? 'text-emerald-300' : cashVariance < 0 ? 'text-rose-300' : 'text-amber-300'}`}>
                              {Math.abs(cashVariance) < 1 ? 'Balanced' : signed(cashVariance)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-white/45">Card &amp; other</p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[22rem] text-left">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-white/45">
                              <th className="py-1 font-black">Tender</th>
                              <th className="py-1 text-right font-black">Counted</th>
                              <th className="py-1 text-right font-black">Expected</th>
                              <th className="py-1 text-right font-black">Variance</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="py-1.5">Card machine</td>
                              <td className="py-1.5 text-right">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={cardText}
                                  onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setCardText(e.target.value)}
                                  placeholder="0.00"
                                  className="w-24 rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-right font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                                  aria-label="Card machine end-of-day total"
                                />
                              </td>
                              <td className="py-1.5 text-right font-mono">{showExpected ? gbp(cardTaken) : '🔒'}</td>
                              <td className="py-1.5 text-right font-mono">{typeof cardVariance === 'number' && showExpected ? signed(cardVariance) : '—'}</td>
                            </tr>
                            {otherTaken > 0 && (
                              <tr>
                                <td className="py-1.5">Payment link</td>
                                <td className="py-1.5 text-right">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={otherText}
                                    onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setOtherText(e.target.value)}
                                    placeholder="0.00"
                                    className="w-24 rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-right font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                                    aria-label="Payment link total"
                                  />
                                </td>
                                <td className="py-1.5 text-right font-mono">{showExpected ? gbp(otherTaken) : '🔒'}</td>
                                <td className="py-1.5 text-right font-mono">{typeof countedOther === 'number' && showExpected ? signed(countedOther - otherTaken) : '—'}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {live.website.orders > 0 && (
                      <p className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-2.5 text-[11px] text-sky-100">
                        {live.website.orders} website order{live.website.orders === 1 ? '' : 's'} ({gbp(live.website.total)}) placed today — counted in takings only once paid on the till.
                      </p>
                    )}
                  </div>
                )}

                {tab === 'sales' && (
                  <div className="space-y-4">
                    <MiniRows title="By category" rows={live.byCategory} />
                    <MiniRows title="By product" rows={live.byProduct} />
                    <div>
                      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-white/45">By employee</p>
                      {live.byEmployee.length === 0 ? (
                        <p className="text-xs text-white/50">No sales yet.</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {live.byEmployee.map((e) => (
                            <li key={e.key} className="flex justify-between gap-2">
                              <span className="truncate">
                                {e.label} <span className="text-white/45">({e.transactions})</span>
                              </span>
                              <span className="font-mono">{gbp(e.total)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'refunds' &&
                  (live.refunds.length === 0 ? (
                    <p className="text-xs text-white/50">No refunds have been processed.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {live.refunds.map((r, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="min-w-0">
                            <span className="font-mono text-white/50">{new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> #{r.orderShortId} {r.method} —{' '}
                            <span className="text-white/60">{r.reason}</span>
                          </span>
                          <span className="shrink-0 font-mono text-rose-300">{gbp(-r.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ))}

                {tab === 'voids' &&
                  (live.voids.length === 0 ? (
                    <p className="text-xs text-white/50">No voids have been processed.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {live.voids.map((v) => (
                        <li key={v.id} className="flex justify-between gap-2">
                          <span className="min-w-0">
                            <span className="font-mono text-white/50">{new Date(v.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> {v.item}
                            <span className="block text-[11px] text-white/50">
                              {v.reason} — {v.staff}
                              {v.approvedBy && v.approvedBy !== v.staff ? `, approved by ${v.approvedBy}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono">{gbp(v.value)}</span>
                        </li>
                      ))}
                    </ul>
                  ))}

                {tab === 'tax' &&
                  (live.tax.length === 0 ? (
                    <p className="text-xs text-white/50">No sales yet.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {live.tax.map((t) => (
                        <li key={t.rate} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
                          <span className="truncate">{t.label}</span>
                          <span className="font-mono text-white/60">{gbp(t.net)} net</span>
                          <span className="font-mono">{gbp(t.tax)}</span>
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Count the drawer */}
      {counting && (
        <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Count the cash drawer">
          <div className="w-full max-w-2xl space-y-3 rounded-3xl border border-amber-400/40 bg-slate-900 p-4 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-black">Count the drawer</h3>
                <p className="text-[11px] text-white/55">How many of each note and coin, float included. Optional — you can close without counting.</p>
              </div>
              <p className="font-mono text-2xl font-black text-amber-300">{gbp(countedCash)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {DENOMS.map((d) => {
                const n = denoms[d.key]
                return (
                  <div key={d.key} className={`rounded-xl border p-2 ${n > 0 ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-black/40'}`}>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="font-mono text-sm font-black text-amber-200">{d.label}</span>
                      <span className="font-mono text-[11px] text-white/50">{n > 0 ? gbp(n * d.value) : ''}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <button type="button" onClick={() => setDenoms((p) => ({ ...p, [d.key]: Math.max(0, p[d.key] - 1) }))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 font-black hover:bg-white/20" aria-label={`One fewer ${d.label}`}>
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={n ? String(n) : ''}
                        placeholder="0"
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
                          setDenoms((p) => ({ ...p, [d.key]: digits ? parseInt(digits, 10) : 0 }))
                        }}
                        className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-black/60 text-center font-mono text-base font-bold text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
                        aria-label={`Number of ${d.label}`}
                      />
                      <button type="button" onClick={() => setDenoms((p) => ({ ...p, [d.key]: p[d.key] + 1 }))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 font-black hover:bg-white/20" aria-label={`One more ${d.label}`}>
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCounting(false)} className="rounded-xl border border-white/15 py-3 text-xs font-bold text-white/70 hover:bg-white/10">
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setCashDone(true)
                  setCounting(false)
                }}
                className="rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase text-ink hover:bg-emerald-400"
              >
                Done — {gbp(countedCash)}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-rose-500/40 bg-slate-900 p-5 text-white shadow-2xl">
            <p className="text-sm font-bold">{confirm}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirm(null)
                  setCounting(true)
                }}
                className="rounded-xl bg-amber-400 py-3 text-xs font-black uppercase text-ink hover:bg-amber-300"
              >
                Count again
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null)
                  doClose()
                }}
                className="rounded-xl border border-rose-500/40 bg-rose-950/40 py-3 text-xs font-black uppercase text-rose-200 hover:bg-rose-900/60"
              >
                Close anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniRows({ title, rows }: { title: string; rows: ReportRow[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-white/45">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-white/50">No sales yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2">
              <span className="font-mono text-white/50">{r.qty}×</span>
              <span className="truncate">{r.label}</span>
              <span className="font-mono">{gbp(r.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
