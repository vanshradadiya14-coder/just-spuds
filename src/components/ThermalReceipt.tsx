import { useRef } from 'react'
import type { Order } from '../services/orderStore'
import { lineUnitPrice } from '../hooks/useCart'
import { gbp } from '../utils/format'
import { SITE } from '../data/site'

interface ThermalReceiptProps {
  order: Order
  onClose?: () => void
  isModal?: boolean
}

export default function ThermalReceipt({ order, onClose, isModal = true }: ThermalReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const isDelivery = order.fulfilment === 'delivery'
  const isPaid = order.payment.status === 'paid'

  const content = (
    <div
      ref={receiptRef}
      className="thermal-receipt font-mono text-[13px] leading-relaxed text-black bg-white p-6 max-w-[380px] mx-auto border border-dashed border-gray-400 shadow-lg rounded-sm selection:bg-amber-200"
      style={{ fontFamily: '"Courier New", Courier, monospace' }}
    >
      {/* STORE HEADER */}
      <div className="text-center pb-3 border-b border-black">
        <h2 className="text-xl font-black uppercase tracking-wider">{SITE.name}</h2>
        <p className="text-[11px] font-bold uppercase">{SITE.tagline}</p>
        <p className="text-[11px] mt-1">{SITE.address.line1}, {SITE.address.town}</p>
        <p className="text-[11px] font-bold">{SITE.address.postcode} &bull; Tel: {SITE.phone}</p>
        <p className="text-[10px] text-gray-600 mt-0.5">VAT Reg: GB 492 8192 10</p>
      </div>

      {/* ORDER NUMBER & TYPE */}
      <div className="text-center py-3 border-b border-black my-1">
        <p className="text-[11px] font-bold text-gray-700">KITCHEN &bull; RECEIPT</p>
        <p className="text-2xl font-black tracking-tight my-0.5">
          ORDER #{order.shortId}
        </p>
        <div className="inline-block mt-1 px-3 py-0.5 bg-black text-white font-black text-xs uppercase tracking-wider rounded-xs">
          {isDelivery ? '🛵 HOME DELIVERY' : '🛍️ STORE PICK UP'}
        </div>
        {order.isScheduled && (
          <div className="mt-2 p-1.5 bg-black text-white font-black text-xs uppercase tracking-wider border border-black">
            *** SCHEDULED PRE-ORDER: {order.scheduledFor || order.estimatedDeliveryTime} ***
          </div>
        )}
        <p className="text-[10px] mt-1.5 font-bold">
          Placed: {new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <p className="text-[11px] font-bold text-black mt-0.5">
          {order.isScheduled ? 'Scheduled Due Time:' : 'Target Time:'} {order.scheduledFor || order.estimatedDeliveryTime}
        </p>
      </div>

      {/* CUSTOMER & DELIVERY INFO */}
      <div className="py-2.5 border-b border-dashed border-black text-xs space-y-1">
        <p><strong>CUSTOMER:</strong> {order.customer.name}</p>
        <p><strong>PHONE:</strong> {order.customer.phone}</p>
        {isDelivery && (
          <>
            <p><strong>ADDRESS:</strong> {order.customer.streetAddress || 'Aylesbury'}</p>
            <p><strong>POSTCODE:</strong> {order.customer.postcode}</p>
            {order.customer.instructions && (
              <p className="p-1.5 bg-gray-100 border border-gray-400 font-bold mt-1 text-[11px]">
                DRIVER NOTE: {order.customer.instructions}
              </p>
            )}
          </>
        )}
      </div>

      {/* CRITICAL: ALLERGEN / KITCHEN NOTES ALERT */}
      {order.kitchenNotes && (
        <div className="my-2.5 p-2 bg-black text-white text-xs font-black uppercase tracking-wide border-2 border-black">
          <p className="text-[11px] underline">⚠️ ALLERGEN / KITCHEN ALERT:</p>
          <p className="mt-0.5 text-xs">{order.kitchenNotes}</p>
        </div>
      )}

      {/* LINE ITEMS */}
      <div className="py-3 border-b border-black space-y-3">
        <div className="flex justify-between font-black text-xs border-b border-black pb-1">
          <span>QTY &bull; ITEM DESCRIPTION</span>
          <span>PRICE</span>
        </div>

        {order.lines.map((line, idx) => {
          return (
            <div key={line.lineId || idx} className="text-xs space-y-0.5">
              <div className="flex justify-between font-black text-[13px]">
                <span>{line.qty}x {line.name}</span>
                <span>{gbp(lineUnitPrice(line) * line.qty)}</span>
              </div>

              {/* Extras */}
              {line.extras && line.extras.length > 0 && (
                <div className="pl-4 text-[11px] text-gray-800">
                  {line.extras.map((ext, i) => (
                    <p key={i}>+ {ext.replace(/-/g, ' ')}</p>
                  ))}
                </div>
              )}

              {/* Sauces */}
              {line.sauces && line.sauces.length > 0 && (
                <p className="pl-4 text-[11px] font-bold">
                  Sauce: {line.sauces.join(', ')}
                </p>
              )}

              {/* Meal Deal */}
              {line.meal && (
                <div className="pl-4 text-[11px] font-bold text-gray-900">
                  <p>✓ MEAL DEAL COMBO (+£1.80):</p>
                  {line.mealDrink && <p className="pl-2">- Drink: {line.mealDrink.replace(/-/g, ' ')}</p>}
                  {line.mealSnack && <p className="pl-2">- Snack: {line.mealSnack.replace(/-/g, ' ')}</p>}
                </div>
              )}

              {/* Line Specific Notes */}
              {line.notes && (
                <p className="pl-4 text-[11px] italic font-bold text-red-800">
                  * Note: {line.notes}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* PAYMENT & TOTALS */}
      <div className="py-2.5 border-b border-black text-xs space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{gbp(order.payment.subtotal)}</span>
        </div>

        {order.payment.discount > 0 && (
          <div className="flex justify-between font-bold">
            <span>Discount</span>
            <span>-{gbp(order.payment.discount)}</span>
          </div>
        )}

        {isDelivery && (
          <div className="flex justify-between">
            <span>Delivery Fee</span>
            <span>{order.payment.deliveryFee === 0 ? 'FREE' : gbp(order.payment.deliveryFee)}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span>Service / Bag</span>
          <span>{gbp(order.payment.serviceFee)}</span>
        </div>

        {order.payment.tip > 0 && (
          <div className="flex justify-between font-bold">
            <span>Driver Tip</span>
            <span>{gbp(order.payment.tip)}</span>
          </div>
        )}

        <div className="flex justify-between font-black text-base pt-2 border-t border-dashed border-black">
          <span>TOTAL</span>
          <span>{gbp(order.payment.total)}</span>
        </div>

        <div className="pt-2 text-center text-[11px] font-bold">
          {isPaid ? (
            <p className="p-1 bg-gray-100 border border-black">
              ✓ PAID ({gbp(order.payment.total)}) &bull; {order.payment.method === 'cash' ? 'CASH' : 'CARD DEVICE / TILL'}
            </p>
          ) : (
            <p className="p-1 bg-black text-white font-black">
              ⚠️ PAYMENT DUE UPON {isDelivery ? 'DELIVERY (DRIVER CARD DEVICE / CASH)' : 'COLLECTION AT COUNTER'} ({gbp(order.payment.total)})
            </p>
          )}
        </div>
      </div>

      {/* BARCODE & FOOTER */}
      <div className="text-center pt-3 space-y-2">
        <div className="font-mono text-2xl tracking-[0.25em] font-bold py-1">
          ||| | |||| | ||| || |||| |
        </div>
        <p className="text-[10px] uppercase font-bold text-gray-700">
          Thank you for supporting local Aylesbury food!
        </p>
        <p className="text-[9px] text-gray-500">
          Order Online: www.justspuds.uk &bull; Fresh Daily
        </p>
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
            🖨️ Print to POS Printer (58mm/80mm)
          </button>
        </div>
        {content}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm overflow-y-auto" role="dialog">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 my-8 border border-ink/20">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-ink/10">
          <div className="flex items-center gap-2">
            <span className="text-xl">🖨️</span>
            <h3 className="font-body text-base font-bold text-ink">Thermal Receipt Preview</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-full bg-amber-400 px-4 py-1.5 font-body text-xs font-black uppercase text-ink shadow hover:bg-amber-300"
            >
              Print Ticket
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
