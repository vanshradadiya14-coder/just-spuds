import { useRef } from 'react'
import type { TillShift } from '../services/tillStore'
import { gbp } from '../utils/format'
import { SITE } from '../data/site'

interface ZReportReceiptProps {
  shift: TillShift
  onClose?: () => void
  isModal?: boolean
}

export default function ZReportReceipt({ shift, onClose, isModal = true }: ZReportReceiptProps) {
  const reportRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const durationMs = shift.closedAt
    ? new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()
    : 0
  const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1)

  const discrepancy = shift.discrepancy ?? 0
  const isBalanced = Math.abs(discrepancy) < 1
  const isOver = discrepancy > 0

  const denoms = shift.closingDenominations

  const content = (
    <div
      ref={reportRef}
      className="z-report font-mono text-[12px] leading-relaxed text-black bg-white p-6 max-w-[380px] mx-auto border border-dashed border-gray-400 shadow-lg rounded-sm selection:bg-amber-200"
      style={{ fontFamily: '"Courier New", Courier, monospace' }}
    >
      {/* STORE HEADER */}
      <div className="text-center pb-3 border-b-2 border-black">
        <h2 className="text-lg font-black uppercase tracking-wider">{SITE.name}</h2>
        <p className="text-[11px] font-bold uppercase tracking-wide">END OF DAY &bull; Z-REPORT</p>
        <p className="text-[10px] text-gray-700">{SITE.address.line1}, {SITE.address.town}</p>
        <p className="text-[10px] font-bold">VAT Reg: GB 492 8192 10 &bull; Tel: {SITE.phone}</p>
      </div>

      {/* SHIFT & AUDIT METADATA */}
      <div className="py-2.5 border-b border-black text-xs space-y-1">
        <div className="flex justify-between font-bold">
          <span>REPORT TYPE:</span>
          <span>DAILY Z-REPORT (FINAL)</span>
        </div>
        <div className="flex justify-between">
          <span>SHIFT NUMBER:</span>
          <span className="font-black">#{shift.shiftNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>TERMINAL:</span>
          <span>TILL 01 (MARKET SQUARE)</span>
        </div>
        <div className="flex justify-between">
          <span>OPENED BY:</span>
          <span>{shift.openedBy}</span>
        </div>
        {shift.closedBy && (
          <div className="flex justify-between">
            <span>CLOSED BY:</span>
            <span>{shift.closedBy}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>SHIFT OPEN:</span>
          <span>{new Date(shift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(shift.openedAt).toLocaleDateString()})</span>
        </div>
        {shift.closedAt && (
          <div className="flex justify-between">
            <span>SHIFT CLOSE:</span>
            <span>{new Date(shift.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(shift.closedAt).toLocaleDateString()})</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>DURATION:</span>
          <span>{durationHours} Hours</span>
        </div>
      </div>

      {/* SALES BREAKDOWN */}
      <div className="py-3 border-b border-black space-y-1 text-xs">
        <p className="font-black border-b border-dashed border-black pb-1">REVENUE BREAKDOWN</p>
        <div className="flex justify-between">
          <span>IN-STORE CASH SALES ({shift.inStoreOrdersCount} orders):</span>
          <span className="font-bold">{gbp(shift.cashSalesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>IN-STORE CARD SALES:</span>
          <span className="font-bold">{gbp(shift.cardSalesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>ONLINE ORDERS ({shift.onlineOrdersCount} orders):</span>
          <span>{gbp(shift.onlineOrdersTotal)}</span>
        </div>
        {shift.totalDiscountGiven > 0 && (
          <div className="flex justify-between text-gray-700">
            <span>DISCOUNTS GRANTED:</span>
            <span>-{gbp(shift.totalDiscountGiven)}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-sm pt-2 border-t border-black">
          <span>TOTAL STORE TAKINGS:</span>
          <span>{gbp(shift.cashSalesTotal + shift.cardSalesTotal)}</span>
        </div>
      </div>

      {/* CASH DRAWER RECONCILIATION */}
      <div className="py-3 border-b-2 border-black space-y-1.5 text-xs">
        <p className="font-black border-b border-dashed border-black pb-1">CASH RECONCILIATION</p>
        <div className="flex justify-between">
          <span>STARTING FLOAT:</span>
          <span>{gbp(shift.startingFloat)}</span>
        </div>
        <div className="flex justify-between">
          <span>CASH TAKINGS:</span>
          <span>+{gbp(shift.cashSalesTotal)}</span>
        </div>
        <div className="flex justify-between font-bold pt-1 border-t border-gray-300">
          <span>EXPECTED CASH IN DRAWER:</span>
          <span>{gbp(shift.expectedCash)}</span>
        </div>
        <div className="flex justify-between font-black text-sm">
          <span>ACTUAL COUNTED CASH:</span>
          <span>{gbp(shift.countedCash ?? 0)}</span>
        </div>

        {/* VARIANCE / DISCREPANCY */}
        <div
          className={`mt-2 p-2 text-center font-black text-xs border ${
            isBalanced
              ? 'bg-gray-100 border-black text-black'
              : isOver
              ? 'bg-amber-100 border-black text-black'
              : 'bg-black text-white border-black'
          }`}
        >
          {isBalanced && '✓ REGISTER BALANCED (£0.00 VARIANCE)'}
          {!isBalanced && isOver && `⚠️ CASH OVER: +${gbp(discrepancy)}`}
          {!isBalanced && !isOver && `⚠️ CASH SHORT: -${gbp(Math.abs(discrepancy))}`}
        </div>
      </div>

      {/* COUNTED DENOMINATIONS AUDIT */}
      {denoms && (
        <div className="py-3 border-b border-black text-[11px] space-y-1">
          <p className="font-black border-b border-dashed border-black pb-0.5">PHYSICAL CASH COUNT BREAKDOWN</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {denoms.note50 > 0 && <div>£50 Notes: {denoms.note50} ({gbp(denoms.note50 * 5000)})</div>}
            {denoms.note20 > 0 && <div>£20 Notes: {denoms.note20} ({gbp(denoms.note20 * 2000)})</div>}
            {denoms.note10 > 0 && <div>£10 Notes: {denoms.note10} ({gbp(denoms.note10 * 1000)})</div>}
            {denoms.note5 > 0 && <div>£5 Notes: {denoms.note5} ({gbp(denoms.note5 * 500)})</div>}
            {denoms.coin2 > 0 && <div>£2 Coins: {denoms.coin2} ({gbp(denoms.coin2 * 200)})</div>}
            {denoms.coin1 > 0 && <div>£1 Coins: {denoms.coin1} ({gbp(denoms.coin1 * 100)})</div>}
            {denoms.coin50p > 0 && <div>50p Coins: {denoms.coin50p} ({gbp(denoms.coin50p * 50)})</div>}
            {denoms.coin20p > 0 && <div>20p Coins: {denoms.coin20p} ({gbp(denoms.coin20p * 20)})</div>}
            {denoms.coin5p > 0 && <div>5p Coins: {denoms.coin5p} ({gbp(denoms.coin5p * 5)})</div>}
            {denoms.coin2p > 0 && <div>2p Coins: {denoms.coin2p} ({gbp(denoms.coin2p * 2)})</div>}
            {denoms.coin1p > 0 && <div>1p Coins: {denoms.coin1p} ({gbp(denoms.coin1p * 1)})</div>}
          </div>
        </div>
      )}

      {/* SHIFT MOVEMENTS AUDIT LOG */}
      {shift.movements && shift.movements.length > 0 && (
        <div className="py-2.5 border-b border-black text-[10px] space-y-1">
          <p className="font-black border-b border-dashed border-black pb-0.5">REGISTER EVENTS ({shift.movements.length})</p>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {shift.movements.map((m) => (
              <div key={m.id} className="flex justify-between text-[9px]">
                <span>
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {m.reason}
                </span>
                <span className="font-bold">{m.amount > 0 ? gbp(m.amount) : 'POP'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SIGN OFF LINES */}
      <div className="pt-4 pb-2 space-y-5 text-xs">
        <div>
          <p className="text-[10px] font-bold text-gray-700">CASHIER SIGNATURE:</p>
          <div className="border-b border-black mt-4" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-700">MANAGER / SUPERVISOR SIGNATURE:</p>
          <div className="border-b border-black mt-4" />
        </div>
      </div>

      {/* FOOTER */}
      <div className="text-center pt-3 text-[9px] text-gray-600 border-t border-dashed border-black">
        <p>*** END OF FINANCIAL RECORD &bull; PLEASE ATTACH TO CASH BAG ***</p>
        <p className="font-bold mt-0.5">JUST SPUDS AYLESBURY &bull; EPOS TERMINAL 01</p>
      </div>
    </div>
  )

  if (!isModal) {
    return (
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-black px-4 py-2 text-white font-body text-xs font-bold uppercase tracking-wider shadow hover:bg-gray-800"
          >
            🖨️ Print Z-Report to Thermal Printer
          </button>
        </div>
        {content}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm overflow-y-auto" role="dialog">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 my-8 border border-ink/20">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-ink/10">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h3 className="font-body text-base font-bold text-ink">Daily Z-Report</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-full bg-amber-400 px-4 py-1.5 font-body text-xs font-black uppercase text-ink shadow hover:bg-amber-300"
            >
              Print Receipt
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:text-ink hover:bg-paper"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {content}
        </div>
      </div>
    </div>
  )
}
