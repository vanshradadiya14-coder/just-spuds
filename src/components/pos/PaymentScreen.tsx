import { useEffect, useMemo, useState } from 'react'
import { lineUnitPrice, type CartLine } from '../../hooks/useCart'
import { playPOSTouchTone } from '../../services/printerBridge'
import { gbp } from '../../utils/format'

/**
 * EPOS-style payment screen. Money is taken in one or more tenders — all cash,
 * all card, or e.g. £5 cash and the rest on card — until nothing is left to
 * pay; then the sale completes with every tender recorded.
 *
 * Card payments are taken on the shop's own card machine (it is not connected
 * to the till): the cashier keys the amount in there and taps Approved here
 * once the machine says so. Nothing pretends to talk to a bank.
 */

export interface Tender {
  method: 'cash' | 'card' | 'other'
  /** Pence applied to the bill. */
  amount: number
  /** Cash handed over (for change); defaults to amount. */
  tendered?: number
}

export type PaymentTab = 'payment' | 'discount' | 'items' | 'covers'
type Tab = PaymentTab

const COMP_PRESETS = [
  { percent: 10, label: '10% NHS / Blue light' },
  { percent: 20, label: '20% Regulars' },
  { percent: 50, label: '50% Staff meal' },
  { percent: 100, label: '100% Full comp' },
]

export const COMP_REASONS = [
  'Spillage / Food Remake',
  'Customer Courtesy / Service Delay',
  'VIP / Owner Courtesy',
  'Staff Meal Allowance',
  'Waste / Texture or Quality Issue',
]

/** £5, £10, £20 and the next round amounts above what is owed (EPOS shows e.g. £7 for £6.95). */
export function quickCashOptions(remaining: number): number[] {
  if (remaining <= 0) return []
  const up = (step: number) => Math.ceil(remaining / step) * step
  const candidates = [remaining, up(100), up(500), up(1000), 2000, 5000]
  return [...new Set(candidates)].filter((v) => v >= remaining).sort((a, b) => a - b).slice(0, 5)
}

interface PaymentScreenProps {
  className?: string
  initialTab?: PaymentTab
  /** Why split-by-item is unavailable (e.g. settling a check already sent to the kitchen). */
  splitItemsDisabledReason?: string
  title: string
  subtotalPence: number
  discountPence: number
  discountLabel?: string
  tipPence: number
  vatPence: number
  showVat: boolean
  lines: CartLine[]
  tipPromptEnabled: boolean
  onSetTip: (pence: number) => void
  onApplyComp: (percent: number, reason: string) => void
  onClearDiscount: () => void
  /** Keep these lines on this bill; the rest goes to Held as its own ticket. */
  onSplitItems: (keepLineIds: string[]) => void
  onComplete: (tenders: Tender[], changeDuePence: number) => void
  onClose: () => void
}

export default function PaymentScreen({
  className = '',
  initialTab = 'payment',
  splitItemsDisabledReason,
  title,
  subtotalPence,
  discountPence,
  discountLabel,
  tipPence,
  vatPence,
  showVat,
  lines,
  tipPromptEnabled,
  onSetTip,
  onApplyComp,
  onClearDiscount,
  onSplitItems,
  onComplete,
  onClose,
}: PaymentScreenProps) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [entry, setEntry] = useState('')
  const [tenders, setTenders] = useState<Tender[]>([])
  const [cardStep, setCardStep] = useState<null | { stage: 'tip' | 'confirm'; requested: number | null }>(null)
  const [otherOpen, setOtherOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [compReason, setCompReason] = useState(COMP_REASONS[0])
  const [splitIds, setSplitIds] = useState<string[]>([])
  const [covers, setCovers] = useState(0)

  const due = Math.max(0, subtotalPence - discountPence) + tipPence
  const paid = tenders.reduce((n, t) => n + t.amount, 0)
  const remaining = Math.max(0, due - paid)
  const entryPence = entry ? Math.round(parseFloat(entry) * 100) || 0 : 0
  const locked = tenders.length > 0
  const coverPortion = covers > 1 ? Math.ceil(due / covers) : 0
  const coversPaid = covers > 1 ? tenders.length : 0

  // Split by guest: line the next guest's share up in the amount box.
  useEffect(() => {
    if (covers > 1 && remaining > 0) setEntry((Math.min(coverPortion, remaining) / 100).toFixed(2))
  }, [covers, coverPortion, remaining])

  const finish = (all: Tender[], change: number) => {
    playPOSTouchTone('action')
    onComplete(all, change)
  }

  const takeCash = (handedOver: number) => {
    if (remaining <= 0 || handedOver <= 0) return
    const applied = Math.min(handedOver, remaining)
    const next = [...tenders, { method: 'cash' as const, amount: applied, tendered: handedOver }]
    setEntry('')
    if (applied >= remaining) finish(next, handedOver - applied)
    else {
      playPOSTouchTone('tap')
      setTenders(next)
    }
  }

  const startCard = () => {
    if (remaining <= 0) return
    playPOSTouchTone('tap')
    const requested = entryPence > 0 ? Math.min(entryPence, remaining) : null
    setCardStep({ stage: tipPromptEnabled && tipPence === 0 && !locked ? 'tip' : 'confirm', requested })
  }

  const cardAmount = cardStep ? (cardStep.requested !== null ? Math.min(cardStep.requested, remaining) : remaining) : 0

  const approveCard = () => {
    const amount = cardAmount
    setCardStep(null)
    setEntry('')
    if (amount <= 0) return
    const next = [...tenders, { method: 'card' as const, amount }]
    if (amount >= remaining) finish(next, 0)
    else {
      playPOSTouchTone('action')
      setTenders(next)
    }
  }

  const takeOther = () => {
    const amount = entryPence > 0 ? Math.min(entryPence, remaining) : remaining
    setOtherOpen(false)
    setEntry('')
    if (amount <= 0) return
    const next = [...tenders, { method: 'other' as const, amount }]
    if (amount >= remaining) finish(next, 0)
    else setTenders(next)
  }

  const press = (k: string) => {
    playPOSTouchTone('numpad')
    if (k === 'C') return setEntry('')
    if (k === '⌫') return setEntry((v) => v.slice(0, -1))
    if (k === '.') return setEntry((v) => (v.includes('.') ? v : v ? `${v}.` : '0.'))
    setEntry((v) => {
      const [, dec] = v.split('.')
      if (dec && dec.length >= 2) return v
      if (v.replace('.', '').length >= 6) return v
      return v === '0' ? k : v + k
    })
  }

  // Keyboard: digits / . / Backspace on the amount, Enter = cash, Esc = back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'SELECT' || el?.tagName === 'TEXTAREA') return
      if (cardStep || otherOpen || confirmCancel) {
        if (e.key === 'Escape') {
          setCardStep(null)
          setOtherOpen(false)
          setConfirmCancel(false)
        }
        return
      }
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === '.') press('.')
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Enter') {
        e.preventDefault()
        takeCash(entryPence > 0 ? entryPence : remaining)
      } else if (e.key === 'Escape') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const back = () => {
    if (locked) setConfirmCancel(true)
    else onClose()
  }

  const quick = useMemo(() => quickCashOptions(remaining), [remaining])
  const tenderTotals = {
    cash: tenders.filter((t) => t.method === 'cash').reduce((n, t) => n + t.amount, 0),
    card: tenders.filter((t) => t.method === 'card').reduce((n, t) => n + t.amount, 0),
    other: tenders.filter((t) => t.method === 'other').reduce((n, t) => n + t.amount, 0),
  }

  const TabButton = ({ id, label }: { id: Tab; label: string }) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-xs font-bold uppercase tracking-wider transition ${tab === id ? 'text-amber-300' : 'text-white/55 hover:text-white'}`}
    >
      {label}
      {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}
    </button>
  )

  return (
    <section className={`flex min-h-0 flex-col bg-slate-950 text-white font-body ${className}`} aria-label="Take payment">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-900 px-2">
        <button type="button" onClick={back} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-white/70 hover:bg-white/10 hover:text-white" aria-label="Back to menu">
          ←
        </button>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none" role="tablist">
          <TabButton id="payment" label="Payment" />
          <TabButton id="discount" label="Discount" />
          <TabButton id="items" label="Split by item" />
          <TabButton id="covers" label="Split by guest" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className="mx-auto grid max-w-3xl gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* Amount summary (EPOS left box) */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-900 p-3 text-xs">
            <p className="truncate text-[11px] font-bold text-white/50">{title}</p>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/50">{locked ? 'Left to pay' : 'Amount due'}</p>
              <p className="font-mono text-4xl font-black text-amber-400" aria-live="polite">{gbp(remaining)}</p>
            </div>
            <div className="space-y-1 border-t border-white/10 pt-2">
              <div className="flex justify-between"><span className="text-white/60">Items</span><span className="font-mono">{gbp(subtotalPence)}</span></div>
              {discountPence > 0 && (
                <div className="flex justify-between gap-2 text-amber-300" title={discountLabel}>
                  <span className="min-w-0 truncate">Discount{discountLabel ? ` (${discountLabel})` : ''}</span>
                  <span className="shrink-0 font-mono">−{gbp(discountPence)}</span>
                </div>
              )}
              {tipPence > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Tip</span>
                  <span className="font-mono">
                    {gbp(tipPence)}
                    {!locked && (
                      <button type="button" onClick={() => onSetTip(0)} className="ml-1 text-white/40 hover:text-white" aria-label="Remove tip">✕</button>
                    )}
                  </span>
                </div>
              )}
              {showVat && <div className="flex justify-between text-white/40"><span>VAT included</span><span className="font-mono">{gbp(vatPence)}</span></div>}
              <div className="flex justify-between border-t border-white/10 pt-1 font-black"><span>Total</span><span className="font-mono">{gbp(due)}</span></div>
            </div>
            {tenders.length > 0 && (
              <div className="space-y-1 border-t border-white/10 pt-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/50">Paid so far</p>
                {tenders.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span>{t.method === 'cash' ? '💵 Cash' : t.method === 'card' ? '💳 Card' : '🔗 Link'}</span>
                    <span className="flex items-center gap-1 font-mono">
                      {gbp(t.amount)}
                      <button
                        type="button"
                        onClick={() => setTenders((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-white/40 hover:text-rose-300"
                        title={t.method === 'card' ? 'Remove — reverse it on the card machine' : 'Remove — hand the cash back'}
                        aria-label="Remove this payment"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right side: the active tab */}
          <div className="space-y-3">
            {tab === 'payment' && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">Amount</span>
                  <span className="font-mono text-3xl font-black text-white">{entry ? `£${entry}` : gbp(remaining)}</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,5.5rem)] gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => press(k)}
                        className="h-14 rounded-xl border border-white/10 bg-white/5 font-mono text-xl font-black text-white hover:bg-white/15 active:scale-95"
                        aria-label={k === '⌫' ? 'Delete digit' : k}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <div className="grid content-start gap-2">
                    {quick.map((v, i) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => takeCash(v)}
                        className="h-14 rounded-xl border border-emerald-400/40 bg-emerald-500/15 font-mono text-base font-black text-emerald-200 hover:bg-emerald-500/30 active:scale-95"
                        title={i === 0 ? 'Exact cash' : `Customer hands over ${gbp(v)}`}
                      >
                        {i === 0 ? 'Exact' : gbp(v).replace('.00', '')}
                      </button>
                    ))}
                  </div>
                </div>
                {due === 0 && tenders.length === 0 && (
                  <button
                    type="button"
                    onClick={() => finish([], 0)}
                    className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400"
                  >
                    ✓ Complete — nothing to pay
                  </button>
                )}
                <p className="text-[11px] font-black uppercase tracking-wider text-white/50">Pay by</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => takeCash(entryPence > 0 ? entryPence : remaining)}
                    disabled={remaining <= 0}
                    className="rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400 disabled:opacity-40"
                  >
                    💵 Cash
                  </button>
                  <button
                    type="button"
                    onClick={startCard}
                    disabled={remaining <= 0}
                    className="rounded-2xl bg-blue-500 py-4 text-sm font-black uppercase tracking-wider text-white shadow-glow hover:bg-blue-400 disabled:opacity-40"
                  >
                    💳 Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtherOpen(true)}
                    disabled={remaining <= 0}
                    className="rounded-2xl border border-white/15 bg-white/5 py-4 text-xs font-black uppercase tracking-wider text-white/80 hover:bg-white/10 disabled:opacity-40"
                  >
                    ⋯ More
                  </button>
                </div>
                {entryPence > 0 && entryPence < remaining && (
                  <p className="text-[11px] text-white/50">Part payment: {gbp(entryPence)} now, {gbp(remaining - entryPence)} left to pay after.</p>
                )}
              </>
            )}

            {tab === 'discount' && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900 p-3">
                {locked ? (
                  <p className="text-xs text-white/60">Part of this bill is already paid — remove those payments to change the discount.</p>
                ) : (
                  <>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-white/50">
                      Reason
                      <select value={compReason} onChange={(e) => setCompReason(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-white focus:border-amber-400 focus:outline-none">
                        {COMP_REASONS.map((r) => (
                          <option key={r} value={r} className="bg-slate-900">
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {COMP_PRESETS.map((c) => (
                        <button key={c.percent} type="button" onClick={() => onApplyComp(c.percent, compReason)} className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-left hover:bg-amber-500/20">
                          <span className="block text-sm font-black text-amber-200">{c.percent}%</span>
                          <span className="block text-[11px] text-white/60">{c.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/40">Over 20% needs a manager PIN.</p>
                    {discountPence > 0 && (
                      <button type="button" onClick={onClearDiscount} className="w-full rounded-xl border border-rose-500/40 bg-rose-950/40 py-2.5 text-xs font-black text-rose-200 hover:bg-rose-900/60">
                        ✕ Remove discount ({gbp(discountPence)})
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'items' && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900 p-3">
                {splitItemsDisabledReason ? (
                  <p className="text-xs text-white/60">{splitItemsDisabledReason}</p>
                ) : locked ? (
                  <p className="text-xs text-white/60">Part of this bill is already paid — finish it, or remove those payments, before splitting by item.</p>
                ) : lines.length < 2 ? (
                  <p className="text-xs text-white/60">There is only one item on this bill.</p>
                ) : (
                  <>
                    <p className="text-xs text-white/60">Tick what this customer is paying for now. Everything else goes to <strong className="text-white">Held</strong> as its own bill.</p>
                    <ul className="space-y-1.5">
                      {lines.map((l) => {
                        const on = splitIds.includes(l.lineId)
                        return (
                          <li key={l.lineId}>
                            <button
                              type="button"
                              onClick={() => setSplitIds((prev) => (on ? prev.filter((id) => id !== l.lineId) : [...prev, l.lineId]))}
                              className={`flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left text-xs font-bold transition ${on ? 'border-sky-400 bg-sky-500/20 text-sky-100' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}
                              aria-pressed={on}
                            >
                              <span>
                                {on ? '☑' : '☐'} {l.qty}× {l.name}
                              </span>
                              <span className="font-mono">{gbp(lineUnitPrice(l) * l.qty)}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    <button
                      type="button"
                      disabled={splitIds.length === 0 || splitIds.length === lines.length}
                      onClick={() => {
                        onSplitItems(splitIds)
                        setSplitIds([])
                        setTab('payment')
                      }}
                      className="w-full rounded-xl bg-sky-400 py-3 text-xs font-black uppercase tracking-wider text-ink hover:bg-sky-300 disabled:opacity-40"
                    >
                      Pay for {splitIds.length || 'the ticked'} item{splitIds.length === 1 ? '' : 's'} now →
                    </button>
                  </>
                )}
              </div>
            )}

            {tab === 'covers' && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900 p-3">
                <p className="text-xs text-white/60">Split the bill evenly. Each guest pays their share by cash or card; the last guest pays whatever is left.</p>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setCovers(n)
                        setTab('payment')
                      }}
                      className={`rounded-xl border py-3 text-sm font-black transition ${covers === n ? 'border-amber-300 bg-amber-400 text-ink' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
                    >
                      {n}
                    </button>
                  ))}
                  {covers > 1 && (
                    <button type="button" onClick={() => setCovers(0)} className="rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-white/70 hover:bg-white/10">
                      Off
                    </button>
                  )}
                </div>
                {covers > 1 && (
                  <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-center text-sm font-bold text-amber-200">
                    {covers} guests • {gbp(coverPortion)} each
                  </p>
                )}
              </div>
            )}

            {covers > 1 && tab === 'payment' && remaining > 0 && (
              <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-bold text-amber-200">
                Guest {Math.min(coversPaid + 1, covers)} of {covers} — {gbp(Math.min(coverPortion, remaining))}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Card machine (standalone): key the amount in, wait for APPROVED */}
      {cardStep && (
        <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Card payment">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-blue-400/40 bg-slate-900 p-5 text-center text-white shadow-2xl">
            {cardStep.stage === 'tip' ? (
              <>
                <p className="text-sm font-black">Add a tip?</p>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 50, 100, 200].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onSetTip(t)
                        setCardStep((s) => (s ? { ...s, stage: 'confirm' } : s))
                      }}
                      className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-400 hover:text-ink"
                    >
                      {t === 0 ? 'None' : gbp(t)}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-white/40">Tips go to the team and are shown separately on the report.</p>
              </>
            ) : (
              <>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/20 text-3xl">💳</div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-white/50">Key into the card machine</p>
                  <p className="font-mono text-4xl font-black text-amber-400">{gbp(cardAmount)}</p>
                </div>
                <p className="text-xs text-white/60">When the machine shows <strong className="text-white">APPROVED</strong>, tap Approved. If it is declined, tap Declined and ask for another card or cash.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setCardStep(null)} className="rounded-xl border border-rose-500/40 bg-rose-950/40 py-3.5 text-xs font-black uppercase text-rose-200 hover:bg-rose-900/60">
                    Declined
                  </button>
                  <button type="button" onClick={approveCard} className="rounded-xl bg-emerald-500 py-3.5 text-xs font-black uppercase text-ink shadow-glow hover:bg-emerald-400">
                    ✓ Approved
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {otherOpen && (
        <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Other payment">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/15 bg-slate-900 p-5 text-white shadow-2xl">
            <p className="text-sm font-black">Other payment</p>
            <p className="text-xs text-white/60">
              Payment link, bank transfer or app — only once the money has arrived. {gbp(entryPence > 0 ? Math.min(entryPence, remaining) : remaining)} will be recorded as “Payment link / online”.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOtherOpen(false)} className="rounded-xl border border-white/15 py-3 text-xs font-bold text-white/70 hover:bg-white/10">
                Cancel
              </button>
              <button type="button" onClick={takeOther} className="rounded-xl bg-purple-500 py-3 text-xs font-black uppercase text-white hover:bg-purple-400">
                Received
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-rose-500/40 bg-slate-900 p-5 text-white shadow-2xl">
            <p className="text-sm font-black">Cancel this payment?</p>
            <p className="text-xs text-white/70">
              {gbp(paid)} has been taken so far
              {tenderTotals.cash > 0 && <> — hand back {gbp(tenderTotals.cash)} cash</>}
              {tenderTotals.card > 0 && <> — refund {gbp(tenderTotals.card)} on the card machine</>}
              {tenderTotals.other > 0 && <> — return the {gbp(tenderTotals.other)} link payment</>}. Nothing is recorded until the bill is fully paid.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase text-ink hover:bg-emerald-400">
                Keep paying
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCancel(false)
                  setTenders([])
                  onClose()
                }}
                className="rounded-xl border border-rose-500/40 bg-rose-950/40 py-3 text-xs font-black uppercase text-rose-200 hover:bg-rose-900/60"
              >
                Cancel payment
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
