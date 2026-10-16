import { useEffect, useState } from 'react'
import { getPastZReports, subscribeShift, type TillShift } from '../services/tillStore'
import { getStoredOrders } from '../services/orderStore'
import { getCategories, getProducts } from '../services/menuStore'
import { isVatRegistered } from '../services/vat'
import { buildEndOfDayReport, type EndOfDayReport } from '../services/endOfDayReport'
import { gbp } from '../utils/format'
import EndOfDayReportModal from './EndOfDayReportSlip'

/** The frozen report from the close, or — for shifts closed before reports were kept — one rebuilt from the orders. */
export function reportForShift(shift: TillShift): EndOfDayReport {
  if (shift.report) return shift.report
  return buildEndOfDayReport({
    shift,
    orders: getStoredOrders(),
    products: getProducts(),
    categories: getCategories(),
    vatRegistered: isVatRegistered(),
    kind: shift.status === 'closed' ? 'Z' : 'X',
  })
}

/** Every closed till day, newest first, each one reprintable. */
export default function EndOfDayHistoryModal({ onClose }: { onClose: () => void }) {
  const [shifts, setShifts] = useState<TillShift[]>(() => getPastZReports())
  const [viewing, setViewing] = useState<EndOfDayReport | null>(null)

  useEffect(() => subscribeShift(() => setShifts(getPastZReports())), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !viewing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, viewing])

  return (
    <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Past end-of-day reports">
      <div className="flex w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900 text-white shadow-2xl font-body">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 p-4">
          <div>
            <h3 className="text-base font-black">End-of-day reports</h3>
            <p className="text-[11px] text-white/55">Every closed till, newest first. Tap one to view or reprint.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {shifts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-xs text-white/45">No closed tills yet.</p>
          ) : (
            <ul className="space-y-2">
              {shifts.map((s) => {
                const taken = s.cashSalesTotal + s.cardSalesTotal + (s.otherTenderTotal || 0) - (s.refundsTotal || 0)
                const variance = s.discrepancy ?? 0
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setViewing(reportForShift(s))}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-left hover:border-amber-400/50 hover:bg-white/5"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black">
                          {s.closedAt ? new Date(s.closedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          <span className="ml-2 font-mono text-[11px] font-bold text-amber-300">{s.tillName || 'Till 1'} • #{s.shiftNumber}</span>
                        </span>
                        <span className="block text-[11px] text-white/50">
                          {s.openedBy} {new Date(s.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} → {s.closedBy || '—'}{' '}
                          {s.closedAt ? new Date(s.closedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-right">
                        <span>
                          <span className="block font-mono text-sm font-black">{gbp(taken)}</span>
                          <span className={`block font-mono text-[11px] ${Math.abs(variance) < 100 ? 'text-emerald-300' : variance < 0 ? 'text-rose-300' : 'text-amber-300'}`}>
                            {Math.abs(variance) < 1 ? 'balanced' : `${variance > 0 ? '+' : ''}${gbp(variance)}`}
                          </span>
                        </span>
                        <span className="text-white/40">›</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      {viewing && <EndOfDayReportModal report={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
