import { useMemo, useState } from 'react'
import type { Order } from '../services/orderStore'
import { kitchenTicketDoc } from '../services/receiptDoc'
import { paperWidthMm, printBlocks, receiptBlocks } from '../services/receiptPrinter'
import { getPrinterPrefs } from '../services/printerBridge'
import ReceiptPaper from './ReceiptPaper'

interface ThermalReceiptProps {
  order: Order
  onClose?: () => void
  isModal?: boolean
  /** Which slip to show: the customer's receipt (default) or the kitchen ticket. */
  kind?: 'receipt' | 'kitchen'
  /** Staff screens can switch between receipt and kitchen ticket; customers only see their receipt. */
  staff?: boolean
}

/**
 * On-screen copy of a slip, exactly as the printer will print it (same layout
 * code — services/receiptDoc), with a Print button. The till itself prints
 * without opening this; it is for reprints from Admin, the KDS and tracking.
 */
export default function ThermalReceipt({ order, onClose, isModal = true, kind: initialKind = 'receipt', staff = false }: ThermalReceiptProps) {
  const [kind, setKind] = useState<'receipt' | 'kitchen'>(initialKind)
  const [status, setStatus] = useState<string | null>(null)
  const widthMm = paperWidthMm(getPrinterPrefs().cols)
  const blocks = useMemo(() => (kind === 'kitchen' ? kitchenTicketDoc(order) : receiptBlocks(order)), [kind, order])

  const handlePrint = async () => {
    const res = await printBlocks(blocks, { title: kind === 'kitchen' ? 'Kitchen ticket' : 'Receipt' })
    setStatus(res.message)
  }

  const kindSwitch = !staff ? (
    <span className="font-body text-sm font-bold text-ink">Receipt</span>
  ) : (
    <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-bold">
      {(['receipt', 'kitchen'] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => setKind(k)}
          className={`rounded-full px-3 py-1 ${kind === k ? 'bg-black text-white' : 'text-gray-600 hover:text-black'}`}
        >
          {k === 'receipt' ? 'Receipt' : 'Kitchen ticket'}
        </button>
      ))}
    </div>
  )

  const paper = (
    <div className="mx-auto w-fit rounded-sm border border-dashed border-gray-300 bg-white px-3 py-2 shadow-lg">
      <ReceiptPaper blocks={blocks} widthMm={widthMm} />
    </div>
  )

  if (!isModal) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
          {kindSwitch}
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-black px-4 py-2 font-body text-xs font-bold uppercase tracking-wider text-white shadow hover:bg-gray-800"
          >
            🖨️ Print
          </button>
        </div>
        {status && <p className="mb-2 text-center text-[11px] font-bold text-emerald-700">{status}</p>}
        {paper}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-ink/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Receipt">
      <div className="relative my-8 w-full max-w-md rounded-2xl border border-ink/20 bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-ink/10 pb-3">
          {kindSwitch}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-full bg-amber-400 px-4 py-1.5 font-body text-xs font-black uppercase text-ink shadow hover:bg-amber-300"
            >
              Print
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink"
                aria-label="Close receipt"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {status && <p className="mb-2 text-center text-[11px] font-bold text-emerald-700">{status}</p>}
        <div className="max-h-[70vh] overflow-y-auto pr-1">{paper}</div>
      </div>
    </div>
  )
}
