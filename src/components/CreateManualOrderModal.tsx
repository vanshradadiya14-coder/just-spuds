import { useState } from 'react'
import { getProducts } from '../services/menuStore'
import { createManualCounterOrder, type Order, type PaymentMethod } from '../services/orderStore'
import { type Product } from '../data/menu'
import { gbp, cx } from '../utils/format'
import type { CartLine } from '../hooks/useCart'

interface CreateManualOrderModalProps {
  isOpen: boolean
  onClose: () => void
  currentActorName?: string
  onOrderCreated?: (newOrder: Order) => void
}

export default function CreateManualOrderModal({
  isOpen,
  onClose,
  currentActorName = 'Store Manager',
  onOrderCreated,
}: CreateManualOrderModalProps) {
  const products: Product[] = getProducts()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>('pickup')
  const [streetAddress, setStreetAddress] = useState('')
  const [postcode, setPostcode] = useState('HP20')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('in_store')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending_store' | 'pending_delivery'>('paid')
  const [notes, setNotes] = useState('')

  // Order lines
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '')
  const [selectedQty, setSelectedQty] = useState<number>(1)
  const [isMealDeal, setIsMealDeal] = useState(false)
  const [orderLines, setOrderLines] = useState<CartLine[]>([])

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleAddLine = () => {
    const prod = products.find((p) => p.id === selectedProductId)
    if (!prod) return

    const basePrice = prod.price

    const newLine: CartLine = {
      lineId: `${prod.id}-${Date.now()}`,
      productId: prod.id,
      name: prod.name,
      base: basePrice,
      meal: isMealDeal,
      extras: [],
      sauces: [],
      image: prod.image,
      category: prod.category,
      qty: selectedQty,
    }

    setOrderLines((prev) => [...prev, newLine])
    setSelectedQty(1)
    setIsMealDeal(false)
  }

  const handleRemoveLine = (index: number) => {
    setOrderLines((prev) => prev.filter((_, i) => i !== index))
  }

  const getLineTotal = (l: CartLine) => (l.base + (l.meal ? 250 : 0)) * l.qty
  const subtotal = orderLines.reduce((acc, l) => acc + getLineTotal(l), 0)
  const deliveryFee = fulfilment === 'delivery' ? 399 : 0
  const serviceFee = 99
  const total = subtotal + deliveryFee + serviceFee

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (orderLines.length === 0) {
      setErrorMessage('Please add at least one item to the order.')
      return
    }

    if (fulfilment === 'delivery' && (!streetAddress.trim() || !postcode.trim())) {
      setErrorMessage('Please enter street address and postcode for delivery orders.')
      return
    }

    try {
      const newOrder = createManualCounterOrder(
        {
          customerName: customerName.trim() || 'Counter Customer',
          customerPhone: customerPhone.trim() || '01296 423456',
          fulfilment,
          streetAddress: fulfilment === 'delivery' ? streetAddress.trim() : undefined,
          postcode: fulfilment === 'delivery' ? postcode.trim() : undefined,
          lines: orderLines,
          paymentMethod,
          paymentStatus,
          notes: notes.trim() || undefined,
        },
        currentActorName
      )

      if (onOrderCreated) onOrderCreated(newOrder)
      onClose()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error creating order.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-6 text-white my-8 font-body">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📝</span>
              <h2 className="display text-xl text-white font-bold">
                Create Phone-In / Counter Order
              </h2>
            </div>
            <p className="font-body text-xs text-white/60 mt-1">
              Directly enter walk-in or telephone orders into the kitchen KDS queue.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 hover:text-white hover:bg-white/10 text-sm"
          >
            ✕ Close
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300 font-bold">
            ⚠️ {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {/* FULFILMENT TOGGLE */}
          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70">
              Fulfilment Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setFulfilment('pickup')
                  setPaymentMethod('in_store')
                  setPaymentStatus('paid')
                }}
                className={cx(
                  'rounded-xl py-2.5 px-4 font-bold text-center border transition flex items-center justify-center gap-2',
                  fulfilment === 'pickup'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <span>🛍️</span> Store Pick Up (At Counter)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFulfilment('delivery')
                  setPaymentMethod('driver_device')
                  setPaymentStatus('pending_delivery')
                }}
                className={cx(
                  'rounded-xl py-2.5 px-4 font-bold text-center border transition flex items-center justify-center gap-2',
                  fulfilment === 'delivery'
                    ? 'bg-amber-400 text-ink border-amber-300 font-black shadow'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <span>🛵</span> Home Delivery
              </button>
            </div>
          </div>

          {/* CUSTOMER DETAILS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sarah Jenkins"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70 mb-1">
                Customer Phone
              </label>
              <input
                type="tel"
                required
                placeholder="07700 900123"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* DELIVERY ADDRESS IF DELIVERY */}
          {fulfilment === 'delivery' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="sm:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-amber-300 mb-1">
                  Street Address &amp; House Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 14 High Street, Flat 2"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-bold text-amber-300 mb-1">
                  Postcode
                </label>
                <input
                  type="text"
                  required
                  placeholder="HP20 1SN"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs font-mono uppercase text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* ITEM BUILDER */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <span className="text-[11px] uppercase tracking-wider font-black text-white/80">
              Add Items to Ticket:
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 rounded-xl border border-white/20 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({gbp(p.price)})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-xl border border-white/20 bg-slate-800 px-2 py-2 text-xs text-center font-bold text-white focus:border-amber-400 focus:outline-none"
                />
                <label className="flex items-center gap-1.5 text-white/70 text-[11px] cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={isMealDeal}
                    onChange={(e) => setIsMealDeal(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  + Meal (+£2.50)
                </label>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="rounded-xl bg-amber-400 px-4 py-2 font-black uppercase text-ink hover:bg-amber-300 transition whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* ORDER LINES LIST */}
            {orderLines.length > 0 ? (
              <div className="divide-y divide-white/10 pt-2">
                {orderLines.map((line, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{line.qty}x {line.name}</span>
                      {line.meal && <span className="text-amber-400 font-bold ml-1.5">(Meal Deal)</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-amber-300">{gbp(getLineTotal(line))}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-red-400 hover:text-red-300 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/40 italic pt-1">
                No items added yet. Choose an item above.
              </p>
            )}
          </div>

          {/* PAYMENT OPTIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-white/20 bg-slate-800 px-3 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="in_store">In-Store Counter Card Machine</option>
                <option value="driver_device">Driver Mobile Card Terminal Device</option>
                <option value="cash">Cash (Till / Doorstep)</option>
                <option value="card">Card Terminal / Manual</option>
                <option value="complimentary">Complimentary / Free Meal</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70 mb-1">
                Payment Status
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('paid')}
                  className={cx(
                    'rounded-xl py-2 px-3 font-bold text-center border transition',
                    paymentStatus === 'paid'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  )}
                >
                  PAID
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus(fulfilment === 'delivery' ? 'pending_delivery' : 'pending_store')}
                  className={cx(
                    'rounded-xl py-2 px-3 font-bold text-center border transition',
                    paymentStatus !== 'paid'
                      ? 'bg-amber-400 text-ink border-amber-300 font-black'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  )}
                >
                  UNPAID / DUE
                </button>
              </div>
            </div>
          </div>

          {/* KITCHEN NOTES */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/70 mb-1">
              Kitchen Instructions / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Extra hot, no butter, call on arrival"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* TOTAL & SUBMIT */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div>
              <p className="text-xs text-white/60">Estimated Total:</p>
              <p className="text-xl font-bold font-mono text-amber-400">{gbp(total)}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 font-bold text-white hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-amber-400 px-6 py-2.5 font-black uppercase text-ink hover:bg-amber-300 transition shadow-lg active:scale-95"
              >
                🚀 Send to Kitchen KDS
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
