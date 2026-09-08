import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { gbp } from '../utils/format'
import { SITE } from '../data/site'
import { type ZReportData } from '../services/orderStore'

interface AdminZReportModalProps {
  isOpen: boolean
  onClose: () => void
  report: ZReportData
}

export default function AdminZReportModal({ isOpen, onClose, report }: AdminZReportModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handlePrint = () => {
    window.print()
  }

  const handleCopySummary = () => {
    const text = `JUST SPUDS END-OF-DAY Z-REPORT #${report.reportNumber}\nDate: ${report.date}\nGross Sales: ${gbp(report.grandTotal)}\nCard: ${gbp(report.cardTotal)}\nApple/Google Pay: ${gbp(report.digitalPayTotal)}\nCash: ${gbp(report.cashTotal)}\nTips Pool: ${gbp(report.tipsTotal)}\nTotal Orders: ${report.orderCount}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto" role="dialog">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-amber-400/40 p-6 text-slate-100 shadow-2xl my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400 text-xl text-ink shadow-glow">
                🧾
              </span>
              <div>
                <h2 className="display text-lg font-bold text-white tracking-wide">
                  End-of-Day Z-Report
                </h2>
                <p className="font-body text-xs text-white/60">
                  Ref #{report.reportNumber} &bull; {report.date}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
            >
              ✕
            </button>
          </div>

          {/* Printable Thermal Paper Slip Preview */}
          <div className="rounded-2xl bg-amber-50 text-slate-900 p-5 font-mono text-xs shadow-inner space-y-3 print:border-none print:shadow-none">
            <div className="text-center border-b border-dashed border-slate-400 pb-3">
              <h3 className="font-black text-sm uppercase tracking-wider">{SITE.name}</h3>
              <p className="text-[10px] text-slate-600">Market Square, Aylesbury HP20 1EY</p>
              <p className="text-[10px] text-slate-600">Tel: {SITE.phone} &bull; VAT # GB 394 8812 09</p>
              <p className="mt-1 font-bold text-xs uppercase bg-slate-900 text-white px-2 py-0.5 rounded inline-block">
                OFFICIAL Z-CLOSE REPORT
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Generated: {report.generatedAt}</p>
            </div>

            {/* Sales Volume Summary */}
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2.5">
              <div className="flex justify-between font-bold">
                <span>TOTAL ORDERS COMPLETED:</span>
                <span>{report.orderCount}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>- Home Delivery:</span>
                <span>{report.deliveryCount} ({gbp(report.deliveryRevenue)})</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>- Store Pick Up:</span>
                <span>{report.pickupCount} ({gbp(report.pickupRevenue)})</span>
              </div>
              {report.cancelledCount > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>- Cancelled / Refunded:</span>
                  <span>{report.cancelledCount} (-{gbp(report.refundedTotal)})</span>
                </div>
              )}
            </div>

            {/* Financial Revenue Breakdown */}
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2.5">
              <div className="flex justify-between">
                <span>Gross Food Subtotal:</span>
                <span>{gbp(report.grossFoodSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fees Collected:</span>
                <span>{gbp(report.deliveryFeesTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Packaging / Service Fees:</span>
                <span>{gbp(report.serviceFeesTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Promotional Discounts:</span>
                <span>-{gbp(report.discountsTotal)}</span>
              </div>
              <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300">
                <span>NET TOTAL TAKINGS:</span>
                <span className="text-amber-900">{gbp(report.grandTotal)}</span>
              </div>
            </div>

            {/* Payment Method Reconciliation */}
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">Tender Reconciliation</div>
              <div className="flex justify-between">
                <span>Debit / Credit Cards:</span>
                <span>{gbp(report.cardTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Apple Pay / Google Pay:</span>
                <span>{gbp(report.digitalPayTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash Register:</span>
                <span>{gbp(report.cashTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-amber-800 pt-1">
                <span>Staff Gratuity / Tip Pool:</span>
                <span>{gbp(report.tipsTotal)}</span>
              </div>
            </div>

            {/* UK VAT / Tax Breakdown */}
            <div className="space-y-1 text-[10px] text-slate-600">
              <div className="flex justify-between font-bold text-slate-800">
                <span>VAT Breakdown (UK 20%):</span>
                <span>Included</span>
              </div>
              <div className="flex justify-between">
                <span>Standard Rate (20% Hot Food):</span>
                <span>{gbp(report.vatStandardAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Net Sales (Excl. VAT):</span>
                <span>{gbp(report.netSalesExVat)}</span>
              </div>
            </div>

            <div className="text-center pt-2 text-[10px] text-slate-400">
              *** END OF Z-REPORT #${report.reportNumber} ***
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCopySummary}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 font-body text-xs font-bold text-white hover:bg-white/10 transition"
            >
              {copied ? '✓ Copied Summary!' : '📋 Copy Text Summary'}
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/20 px-4 py-2 font-body text-xs font-bold text-white hover:bg-white/10 transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-xl bg-amber-400 px-5 py-2 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition flex items-center gap-2"
              >
                <span>🖨️</span>
                <span>Print Z-Slip</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
