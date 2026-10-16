import { useEffect, type ReactNode } from 'react'
import type { EndOfDayReport, ReportRow } from '../services/endOfDayReport'
import { getBusinessDetails } from '../services/menuStore'
import { gbp } from '../utils/format'
import PrintSlip, { printSlip } from './PrintSlip'

const dt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'
const pct = (n: number) => `${n.toFixed(2)}%`
const signed = (n: number) => (n > 0 ? `+${gbp(n)}` : gbp(n))

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2.5 mt-2.5 border-t border-dashed border-black">
      <h3 className="text-[13px] font-black uppercase tracking-wide">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  )
}

function Line({ label, value, bold }: { label: ReactNode; value: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'font-black' : ''}`}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  )
}

/** EPOS-style table: the item on one line, its figures underneath. */
function RowsTable({ rows, vat, empty, showShare = true }: { rows: ReportRow[]; vat: boolean; empty: string; showShare?: boolean }) {
  if (rows.length === 0) return <p className="italic">{empty}</p>
  const cols = vat ? 'grid-cols-[2.2rem_1fr_1fr_1fr_1fr]' : showShare ? 'grid-cols-[2.2rem_1fr_1fr_1fr]' : 'grid-cols-[2.2rem_1fr_1fr]'
  const totals = rows.reduce((t, r) => ({ qty: t.qty + r.qty, discount: t.discount + r.discount, net: t.net + r.net, tax: t.tax + r.tax, total: t.total + r.total }), { qty: 0, discount: 0, net: 0, tax: 0, total: 0 })
  return (
    <div className="text-[11px]">
      <div className={`grid ${cols} gap-x-1 font-bold border-b border-black pb-0.5`}>
        <span>QTY</span>
        <span className="text-right">DISC</span>
        {vat && <span className="text-right">NET</span>}
        {vat && <span className="text-right">TAX</span>}
        <span className="text-right">TOTAL</span>
        {!vat && showShare && <span className="text-right">%</span>}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="py-0.5 border-b border-dotted border-gray-400 break-inside-avoid">
          <p className="font-bold leading-tight">{r.label}</p>
          <div className={`grid ${cols} gap-x-1 tabular-nums`}>
            <span>{r.qty}</span>
            <span className="text-right">{gbp(r.discount)}</span>
            {vat && <span className="text-right">{gbp(r.net)}</span>}
            {vat && <span className="text-right">{gbp(r.tax)}</span>}
            <span className="text-right font-bold">{gbp(r.total)}</span>
            {!vat && showShare && <span className="text-right">{pct(r.share)}</span>}
          </div>
        </div>
      ))}
      <div className={`grid ${cols} gap-x-1 pt-0.5 font-black tabular-nums`}>
        <span>{totals.qty}</span>
        <span className="text-right">{gbp(totals.discount)}</span>
        {vat && <span className="text-right">{gbp(totals.net)}</span>}
        {vat && <span className="text-right">{gbp(totals.tax)}</span>}
        <span className="text-right">{gbp(totals.total)}</span>
        {!vat && showShare && <span className="text-right">100%</span>}
      </div>
    </div>
  )
}

export function EndOfDayReportSlip({ report }: { report: EndOfDayReport }) {
  const business = getBusinessDetails()
  const r = report
  const vat = r.vatRegistered
  const d = r.drawer
  const isZ = r.kind === 'Z'
  const balanced = typeof d.variance === 'number' && Math.abs(d.variance) < 1

  return (
    <div className="eod-slip bg-white text-black font-mono text-[12px] leading-snug w-full max-w-[380px] mx-auto p-4" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
      <header className="text-center">
        <p className="text-[15px] font-black uppercase">{business.name}</p>
        <p className="text-[10px]">{business.address}</p>
        <p className="text-[10px]">Tel: {business.phone}{business.vatNumber ? ` • VAT ${business.vatNumber}` : ''}</p>
        <p className="mt-2 text-[15px] font-black uppercase tracking-wide">{isZ ? 'End of Day Report' : 'X Read — Till Still Open'}</p>
        {!isZ && <p className="text-[10px] font-bold">Mid-day reading. The till has not been closed.</p>}
      </header>

      <div className="mt-2 text-[11px]">
        <Line label="Till name:" value={r.tillName} />
        <Line label="Shift:" value={`#${r.shiftNumber}`} />
        <Line label="Opened by:" value={r.openedBy} />
        <Line label="Opened:" value={dt(r.openedAt)} />
        {isZ && <Line label="Closed by:" value={r.closedBy || '—'} />}
        {isZ && <Line label="Closed:" value={dt(r.closedAt)} />}
        <Line label="Printed:" value={dt(r.generatedAt)} />
        {r.note && <p className="mt-1">Note: {r.note}</p>}
        {r.basis === 'time' && <p className="mt-1 italic">Rebuilt from orders paid during this shift (older till version).</p>}
      </div>

      <Section title="Cash drawer">
        <div className="text-[11px]">
          <Line label="Opening balance (float)" value={gbp(d.float)} />
          {d.floatAdjust !== 0 && <Line label="Withdrawn / deposited" value={signed(d.floatAdjust)} />}
          {d.petty > 0 && <Line label="Petty cash" value={gbp(-d.petty)} />}
          {d.tipOuts > 0 && <Line label="Cash tip outs" value={gbp(-d.tipOuts)} />}
          <Line label="Cash sales" value={`+${gbp(d.cashSales)}`} />
          {d.cashRefunds > 0 && <Line label="Cash refunds" value={gbp(-d.cashRefunds)} />}
          <div className="border-t border-black mt-0.5 pt-0.5">
            <Line label="Expected in drawer" value={gbp(d.expected)} bold />
            <Line label="Counted in drawer" value={typeof d.counted === 'number' ? gbp(d.counted) : 'not counted'} bold />
          </div>
          {typeof d.variance === 'number' && (
            <p className={`mt-1 border border-black p-1 text-center font-black ${balanced ? '' : 'bg-black text-white'}`}>
              {balanced ? 'DRAWER BALANCED (£0.00)' : d.variance > 0 ? `CASH OVER ${signed(d.variance)}` : `CASH SHORT ${gbp(d.variance)}`}
            </p>
          )}
          {d.noSales > 0 && <p className="mt-1">Drawer opened with no sale: {d.noSales}×</p>}
        </div>
      </Section>

      <Section title="Tender">
        <div className="text-[11px]">
          <div className="grid grid-cols-[1fr_4.2rem_4.2rem_4.2rem] gap-x-1 font-bold border-b border-black pb-0.5">
            <span />
            <span className="text-right">COUNTED</span>
            <span className="text-right">TAKEN</span>
            <span className="text-right">VAR.</span>
          </div>
          {r.tenders.map((t) => (
            <div key={t.key} className="grid grid-cols-[1fr_4.2rem_4.2rem_4.2rem] gap-x-1 tabular-nums">
              <span className="min-w-0 truncate">{t.label}</span>
              <span className="text-right">{typeof t.counted === 'number' ? gbp(t.counted) : '—'}</span>
              <span className="text-right">{gbp(t.taken)}</span>
              <span className="text-right">{typeof t.variance === 'number' ? signed(t.variance) : '—'}</span>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_4.2rem_4.2rem_4.2rem] gap-x-1 tabular-nums font-black border-t border-black mt-0.5 pt-0.5">
            <span>Total</span>
            <span className="text-right">{typeof r.takings.counted === 'number' ? gbp(r.takings.counted) : '—'}</span>
            <span className="text-right">{gbp(r.takings.taken)}</span>
            <span className="text-right">{typeof r.takings.variance === 'number' ? signed(r.takings.variance) : '—'}</span>
          </div>
        </div>
      </Section>

      <Section title="Sales breakdown">
        <div className="text-[11px]">
          <Line label="Transactions" value={r.sales.transactions} />
          <Line label="Items sold" value={r.sales.items} />
          <Line label="Gross sales" value={gbp(r.sales.gross)} />
          <Line label="Discounts" value={r.sales.discount > 0 ? gbp(-r.sales.discount) : gbp(0)} />
          <Line label="Sales total" value={gbp(r.sales.total)} bold />
          {vat && <Line label="of which VAT" value={gbp(r.sales.tax)} />}
          <Line label="Average sale" value={gbp(r.sales.average)} />
          {r.sales.tips > 0 && <Line label="Tips taken" value={gbp(r.sales.tips)} />}
          {r.sales.refunds > 0 && <Line label="Refunds" value={gbp(-r.sales.refunds)} />}
        </div>
      </Section>

      <Section title="Wet / Dry">
        <RowsTable rows={r.wetDry} vat={vat} empty="No sales." />
      </Section>

      <Section title="Sales by product">
        <RowsTable rows={r.byProduct} vat={vat} empty="No sales." />
      </Section>

      <Section title="Sales by employee">
        {r.byEmployee.length === 0 ? (
          <p className="italic">No sales.</p>
        ) : (
          <div className="text-[11px]">
            {r.byEmployee.map((e) => (
              <div key={e.key} className="py-0.5 border-b border-dotted border-gray-400">
                <p className="font-bold">{e.label}</p>
                <div className="grid grid-cols-4 gap-x-1 tabular-nums">
                  <span>{e.transactions} sale{e.transactions === 1 ? '' : 's'}</span>
                  <span className="text-right">{e.qty} items</span>
                  <span className="text-right">{e.tips > 0 ? `tips ${gbp(e.tips)}` : ''}</span>
                  <span className="text-right font-bold">{gbp(e.total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Refunds">
        {r.refunds.length === 0 ? (
          <p className="italic">No refunds have been processed.</p>
        ) : (
          <div className="text-[11px]">
            {r.refunds.map((f, i) => (
              <div key={i} className="py-0.5 border-b border-dotted border-gray-400">
                <Line label={`${new Date(f.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} #${f.orderShortId || '—'} ${f.method.toUpperCase()}`} value={gbp(-f.amount)} />
                <p>{f.reason} — {f.staff}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Sales by category">
        <RowsTable rows={r.byCategory} vat={vat} empty="No sales." />
      </Section>

      <Section title="Voids">
        {r.voids.length === 0 ? (
          <p className="italic">No voids have been processed.</p>
        ) : (
          <div className="text-[11px]">
            {r.voids.map((v) => (
              <div key={v.id} className="py-0.5 border-b border-dotted border-gray-400">
                <Line label={`${new Date(v.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ${v.item}`} value={gbp(v.value)} />
                <p>
                  {v.reason} — {v.staff}
                  {v.approvedBy && v.approvedBy !== v.staff ? `, approved by ${v.approvedBy}` : ''}
                </p>
              </div>
            ))}
            <Line label="Total voided" value={gbp(r.voids.reduce((n, v) => n + v.value, 0))} bold />
          </div>
        )}
      </Section>

      <Section title="Tax">
        {r.tax.length === 0 ? (
          <p className="italic">No sales.</p>
        ) : (
          <div className="text-[11px]">
            <div className="grid grid-cols-[1fr_2rem_4rem_3.6rem_3.2rem] gap-x-1 font-bold border-b border-black pb-0.5">
              <span>RATE</span>
              <span className="text-right">QTY</span>
              <span className="text-right">NET</span>
              <span className="text-right">TAX</span>
              <span className="text-right">%</span>
            </div>
            {r.tax.map((t) => (
              <div key={t.rate} className="grid grid-cols-[1fr_2rem_4rem_3.6rem_3.2rem] gap-x-1 tabular-nums">
                <span className="min-w-0">{t.label}</span>
                <span className="text-right">{t.qty}</span>
                <span className="text-right">{gbp(t.net)}</span>
                <span className="text-right">{gbp(t.tax)}</span>
                <span className="text-right">{t.share.toFixed(0)}%</span>
              </div>
            ))}
            <Line label="Total tax" value={gbp(r.sales.tax)} bold />
          </div>
        )}
      </Section>

      {r.byHour.length > 0 && (
        <Section title="Sales by hour">
          <div className="text-[11px]">
            {r.byHour.map((h) => (
              <Line key={h.hour} label={`${String(h.hour).padStart(2, '0')}:00–${String((h.hour + 1) % 24).padStart(2, '0')}:00  (${h.transactions})`} value={gbp(h.total)} />
            ))}
          </div>
        </Section>
      )}

      {r.website.orders > 0 && (
        <Section title="Website orders">
          <div className="text-[11px]">
            <Line label={`Placed during shift (${r.website.orders})`} value={gbp(r.website.total)} />
            <p>Counted above only when paid on this till.</p>
          </div>
        </Section>
      )}

      {isZ && (
        <div className="mt-4 space-y-5 text-[11px]">
          <div>
            <p>Cashier signature:</p>
            <div className="mt-5 border-b border-black" />
          </div>
          <div>
            <p>Manager signature:</p>
            <div className="mt-5 border-b border-black" />
          </div>
        </div>
      )}

      <p className="mt-4 pt-2 border-t border-dashed border-black text-center text-[10px] font-bold">*** END OF {isZ ? 'DAY REPORT' : 'X READ'} ***</p>
    </div>
  )
}

interface EndOfDayReportModalProps {
  report: EndOfDayReport
  onClose: () => void
  /** Send it to the printer as soon as it opens (Print & Close). */
  autoPrint?: boolean
}

/** On-screen copy of the report with a Print button; the paper copy prints on its own. */
export default function EndOfDayReportModal({ report, onClose, autoPrint = false }: EndOfDayReportModalProps) {
  const slipId = `eod-${report.kind}-${report.shiftNumber}`

  useEffect(() => {
    if (!autoPrint) return
    const t = window.setTimeout(() => printSlip(slipId), 350)
    return () => window.clearTimeout(t)
  }, [autoPrint, slipId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[130] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={report.kind === 'Z' ? 'End of day report' : 'X read'}>
      <div className="my-4 w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-black">{report.kind === 'Z' ? 'End of Day Report' : 'X Read (till still open)'}</h2>
            <p className="text-[11px] text-white/50">
              {report.tillName} • Shift #{report.shiftNumber} • {report.sales.transactions} sale{report.sales.transactions === 1 ? '' : 's'} • {gbp(report.takings.taken)} taken
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => printSlip(slipId)}
              className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300"
            >
              🖨️ Print
            </button>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white" aria-label="Close report">
              ✕
            </button>
          </div>
        </div>
        <div className="rounded-2xl bg-white shadow-inner">
          <EndOfDayReportSlip report={report} />
        </div>
      </div>
      <PrintSlip id={slipId}>
        <EndOfDayReportSlip report={report} />
      </PrintSlip>
    </div>
  )
}
