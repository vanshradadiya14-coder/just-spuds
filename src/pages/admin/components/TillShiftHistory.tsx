import { useEffect, useState } from 'react'
import { getCurrentShift, getPastZReports, subscribeShift, type TillShift } from '../../../services/tillStore'
import { gbp } from '../../../utils/format'

/**
 * Every closed till shift with its cash reconciliation, so a manager can spot
 * a drawer that keeps coming up short without pulling paper Z-reports.
 */
export default function TillShiftHistory() {
  const [current, setCurrent] = useState<TillShift | null>(() => getCurrentShift())
  const [past, setPast] = useState<TillShift[]>(() => getPastZReports())
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    // Closing a shift moves it into the past list, so refresh both on any change.
    return subscribeShift((s) => {
      setCurrent(s)
      setPast(getPastZReports())
    })
  }, [])

  const totalVariance = past.reduce((sum, s) => sum + (s.discrepancy ?? 0), 0)
  const shortShifts = past.filter((s) => (s.discrepancy ?? 0) < -100).length

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="display text-lg text-white font-bold">🧾 Till Shifts &amp; Cash Reconciliation</h3>
          <p className="font-body text-[11px] text-white/50 mt-0.5">
            {past.length} closed shift{past.length === 1 ? '' : 's'}
            {past.length > 0 && (
              <>
                {' '}&bull; net variance{' '}
                <span className={totalVariance < 0 ? 'text-rose-300 font-bold' : 'text-emerald-300 font-bold'}>
                  {totalVariance >= 0 ? '+' : '−'}{gbp(Math.abs(totalVariance))}
                </span>
                {shortShifts > 0 && <span className="text-rose-300"> &bull; {shortShifts} short by over £1</span>}
              </>
            )}
          </p>
        </div>
        {current && current.status === 'open' && (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-body text-[11px] font-bold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Shift #{current.shiftNumber} open &bull; {current.openedBy} &bull; expected cash {gbp(current.expectedCash)}
          </span>
        )}
      </div>

      {past.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center font-body text-xs text-white/40">
          No closed shifts yet. Z-reports appear here once the till is closed at the end of a day.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/50">
                <th className="py-2 pr-3">Shift</th>
                <th className="py-2 pr-3">Closed</th>
                <th className="py-2 pr-3">Cashier</th>
                <th className="py-2 pr-3 text-right">Cash</th>
                <th className="py-2 pr-3 text-right">Card</th>
                <th className="py-2 pr-3 text-right">Online</th>
                <th className="py-2 pr-3 text-right">Orders</th>
                <th className="py-2 pr-3 text-right">Expected</th>
                <th className="py-2 pr-3 text-right">Counted</th>
                <th className="py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {past.map((s) => {
                const variance = s.discrepancy ?? 0
                const isOpen = expanded === s.id
                return (
                  <ShiftRow
                    key={s.id}
                    shift={s}
                    variance={variance}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : s.id)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ShiftRow({ shift: s, variance, isOpen, onToggle }: { shift: TillShift; variance: number; isOpen: boolean; onToggle: () => void }) {
  const closed = s.closedAt ? new Date(s.closedAt) : null
  const varianceClass = variance < -100 ? 'text-rose-300' : variance > 100 ? 'text-amber-300' : 'text-emerald-300'
  const cashMovements = s.movements.filter((m) => m.type !== 'sale_cash' && m.type !== 'open_shift' && m.type !== 'close_shift')
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-white/5 text-white/85 hover:bg-white/5 cursor-pointer"
        aria-expanded={isOpen}
      >
        <td className="py-2.5 pr-3 font-mono font-bold text-amber-300">#{s.shiftNumber}</td>
        <td className="py-2.5 pr-3 whitespace-nowrap">
          {closed ? closed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
          <span className="text-white/40"> {closed ? closed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </td>
        <td className="py-2.5 pr-3">{s.closedBy || s.openedBy}</td>
        <td className="py-2.5 pr-3 text-right font-mono">{gbp(s.cashSalesTotal)}</td>
        <td className="py-2.5 pr-3 text-right font-mono">{gbp(s.cardSalesTotal)}</td>
        <td className="py-2.5 pr-3 text-right font-mono">{gbp(s.onlineOrdersTotal)}</td>
        <td className="py-2.5 pr-3 text-right font-mono">{s.inStoreOrdersCount + s.onlineOrdersCount}</td>
        <td className="py-2.5 pr-3 text-right font-mono">{gbp(s.expectedCash)}</td>
        <td className="py-2.5 pr-3 text-right font-mono">{typeof s.countedCash === 'number' ? gbp(s.countedCash) : '—'}</td>
        <td className={`py-2.5 text-right font-mono font-bold ${varianceClass}`}>
          {variance >= 0 ? '+' : '−'}{gbp(Math.abs(variance))}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-white/5 bg-black/30">
          <td colSpan={10} className="p-3">
            <div className="grid gap-3 sm:grid-cols-3 text-[11px] text-white/70">
              <div>
                <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Float &amp; discounts</p>
                <p>Opening float {gbp(s.startingFloat)} by {s.openedBy}</p>
                <p>Discounts given {gbp(s.totalDiscountGiven)}</p>
                {s.notes && <p className="mt-1 italic text-white/50">“{s.notes}”</p>}
              </div>
              <div className="sm:col-span-2">
                <p className="text-white/40 uppercase tracking-wider text-[10px] mb-1">Drawer movements ({cashMovements.length})</p>
                {cashMovements.length === 0 ? (
                  <p className="text-white/40">No pay-ins, pay-outs or no-sales.</p>
                ) : (
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {cashMovements.map((m) => (
                      <li key={m.id} className="flex justify-between gap-3">
                        <span>
                          <span className="font-mono text-white/40">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                          {m.reason} <span className="text-white/40">— {m.staffName}</span>
                        </span>
                        <span className="font-mono">{m.amount === 0 ? '—' : gbp(m.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
