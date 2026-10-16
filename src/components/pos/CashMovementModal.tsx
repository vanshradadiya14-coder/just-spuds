import { useState } from 'react'
import { recordCashFloatAdjustment, type CashMovementKind } from '../../services/tillStore'
import { playPOSTouchTone } from '../../services/printerBridge'
import { gbp } from '../../utils/format'

/**
 * EPOS "Adjust Float", "Petty Cash" and "Tip Out" — money in or out of the
 * drawer that is not a sale. Each lands on its own line of the end-of-day
 * report, so a shortfall can be explained.
 */

const COPY: Record<CashMovementKind, { title: string; hint: string; reasons: string[] }> = {
  float: {
    title: 'Adjust float',
    hint: 'Change brought in, or notes taken out to the safe / bank.',
    reasons: ['Coins from the bank', 'Change from the safe', 'Bank drop (notes to safe)', 'Float correction'],
  },
  petty: {
    title: 'Petty cash',
    hint: 'Cash paid out of the drawer for shop supplies. Keep the receipt.',
    reasons: ['Milk', 'Butter / cheese', 'Cleaning supplies', 'Packaging', 'Gas / utilities top-up'],
  },
  tip_out: {
    title: 'Tip out',
    hint: 'Card or jar tips paid to the team in cash from the drawer.',
    reasons: ['Tips paid to team', 'Tips paid to kitchen', 'Tips paid to driver'],
  },
}

export default function CashMovementModal({ kind, staffName, onClose, onDone }: { kind: CashMovementKind; staffName: string; onClose: () => void; onDone?: (message: string) => void }) {
  const copy = COPY[kind]
  const [direction, setDirection] = useState<'pay_in' | 'pay_out'>(kind === 'float' ? 'pay_in' : 'pay_out')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const pence = Math.round((parseFloat(amount) || 0) * 100)
  const valid = pence > 0 && reason.trim().length > 1

  const press = (k: string) => {
    playPOSTouchTone('numpad')
    if (k === '⌫') return setAmount((v) => v.slice(0, -1))
    if (k === '.') return setAmount((v) => (v.includes('.') ? v : v ? `${v}.` : '0.'))
    setAmount((v) => {
      const [, dec] = v.split('.')
      if (dec && dec.length >= 2) return v
      if (v.replace('.', '').length >= 6) return v
      return v === '0' ? k : v + k
    })
  }

  const submit = () => {
    if (!valid) return
    recordCashFloatAdjustment(direction, pence, reason.trim(), staffName, kind)
    onDone?.(`${copy.title}: ${direction === 'pay_in' ? '+' : '−'}${gbp(pence)} — ${reason.trim()}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={copy.title}>
      <div className="w-full max-w-sm space-y-3 rounded-3xl border border-white/15 bg-slate-900 p-5 text-white shadow-2xl font-body">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-black">{copy.title}</h3>
            <p className="text-[11px] text-white/55">{copy.hint}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        {kind === 'float' && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection('pay_in')} className={`rounded-xl py-2.5 text-xs font-black transition ${direction === 'pay_in' ? 'bg-emerald-500 text-ink' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
              + Put money in
            </button>
            <button type="button" onClick={() => setDirection('pay_out')} className={`rounded-xl py-2.5 text-xs font-black transition ${direction === 'pay_out' ? 'bg-rose-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
              − Take money out
            </button>
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">{direction === 'pay_in' ? 'In' : 'Out'}</span>
          <span className="font-mono text-3xl font-black">£{amount || '0.00'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
            <button key={k} type="button" onClick={() => press(k)} className="h-12 rounded-xl border border-white/10 bg-white/5 font-mono text-lg font-black hover:bg-white/15 active:scale-95" aria-label={k === '⌫' ? 'Delete digit' : k}>
              {k}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {copy.reasons.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${reason === r ? 'bg-amber-400 text-ink' : 'bg-white/5 text-white/75 hover:bg-white/10'}`}>
              {r}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={reason}
          maxLength={80}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
        />

        <button type="button" disabled={!valid} onClick={submit} className="w-full rounded-2xl bg-amber-400 py-3.5 text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300 disabled:opacity-40">
          Record {pence > 0 ? gbp(pence) : ''} &amp; open drawer
        </button>
      </div>
    </div>
  )
}
