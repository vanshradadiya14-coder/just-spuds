import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { processCheckout } from '../services/checkout'
import { getMenuStockOverrides, type PaymentMethod, type CustomerInfo } from '../services/orderStore'
import { gbp, cx } from '../utils/format'
import { SITE } from '../data/site'
import { validateDeliveryPostcode } from '../data/deliveryZones'
import { getNotificationPermission, requestNotificationPermission } from '../services/notificationService'
import { getProductById, isProductSoldOut } from '../services/menuStore'
import { getCurrentUser, loginWithGoogle, subscribeAuth, type AuthUser } from '../services/authStore'
interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
}

const TIPS = [0, 100, 200, 300] // in pence
const SERVICE_FEE = 49 // 49p packaging & service fee

const SCHEDULE_TIMES = [
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '1:00 PM',
  '1:30 PM',
  '2:00 PM',
  '2:30 PM',
  '3:00 PM',
  '3:30 PM',
  '4:00 PM',
  '4:30 PM',
  '5:00 PM',
  '5:30 PM',
  '6:00 PM',
  '6:30 PM',
  '7:00 PM',
  '7:30 PM',
  '8:00 PM',
  '8:30 PM',
  '9:00 PM',
  '9:30 PM',
]

function getScheduleDates(): string[] {
  const days: string[] = ['Today', 'Tomorrow']
  const now = new Date()
  for (let i = 2; i <= 6; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    days.push(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))
  }
  return days
}

export default function CheckoutModal({ isOpen, onClose }: CheckoutModalProps) {
  const navigate = useNavigate()
  const {
    lines, rawSubtotal, subtotal, discount, fulfilment, deliveryFee,
    deliveryAddress, setDeliveryAddress, kitchenNotes, clear, close: closeCart,
    timingMode, setTimingMode, isScheduled, formattedScheduledTime, scheduleDate, setScheduleDate, scheduleTime, setScheduleTime,
    postcodeValidation, minOrderPence, isMinOrderMet, storeStatus, kitchenPause,
    isOnlineOrderingEnabled, orderingPausedMessage,
  } = useCart()

  const [paymentPreference, setPaymentPreference] = useState<'device' | 'cash'>('device')
  const paymentMethod: PaymentMethod = paymentPreference === 'cash' ? 'cash' : (fulfilment === 'delivery' ? 'driver_device' : 'in_store')
  const [selectedTip, setSelectedTip] = useState(100) // £1.00 default tip
  const [customTipInput, setCustomTipInput] = useState('')
  const [isCustomTip, setIsCustomTip] = useState(false)

  // Customer contact info
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser())

  const [customer, setCustomer] = useState<CustomerInfo>(() => {
    const user = getCurrentUser()
    const guestDataStr = localStorage.getItem('just_spuds_guest_customer')
    const guestData = guestDataStr ? JSON.parse(guestDataStr) : null
    
    return {
      name: user?.name || guestData?.name || '',
      phone: user?.phone || guestData?.phone || '',
      email: user?.email || guestData?.email || '',
      streetAddress: deliveryAddress.street || guestData?.streetAddress || '',
      postcode: deliveryAddress.postcode || guestData?.postcode || '',
      instructions: deliveryAddress.instructions || guestData?.instructions || '',
    }
  })

  // Keep auth state in sync
  useEffect(() => {
    return subscribeAuth((user) => {
      setCurrentUser(user)
      if (user) {
        setCustomer(prev => ({
          ...prev,
          name: user.name || prev.name,
          phone: user.phone || prev.phone,
          email: user.email || prev.email,
        }))
      }
    })
  }, [])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * The delivery address is ONE concept with one owner: the cart.
   *
   * These fields used to live only in local `customer` state, while
   * `postcodeValidation` was derived from the cart's copy — so the postcode being
   * validated was not the postcode being ordered. A customer could type an
   * out-of-area postcode here, keep a stale `canDeliver: true`, and place an
   * undeliverable order at in-zone pricing. Always write through to the cart so
   * validation, fee, free-delivery threshold and minimum order all follow the
   * value actually on screen.
   */
  const updateDeliveryField = (
    field: 'streetAddress' | 'postcode' | 'instructions',
    value: string,
  ) => {
    setCustomer((prev) => ({ ...prev, [field]: value }))
    setDeliveryAddress((prev) => ({
      ...prev,
      ...(field === 'streetAddress' && { street: value }),
      ...(field === 'postcode' && { postcode: value }),
      ...(field === 'instructions' && { instructions: value }),
    }))
  }

  const activeTip = isCustomTip ? Math.round(parseFloat(customTipInput || '0') * 100) : selectedTip
  const grandTotal = subtotal + (fulfilment === 'delivery' ? deliveryFee : 0) + SERVICE_FEE + activeTip

  const handlePlaceOrder = async () => {
    if (storeStatus.isKitchenPaused || kitchenPause.isPaused) {
      if (!isScheduled) {
        setError(`Kitchen Notice: Orders are temporarily paused by staff ("${storeStatus.pauseReason || 'Kitchen is catching up with orders'}"). Please select a scheduled time slot to order ahead.`)
        setTimingMode('scheduled')
        return
      }
    } else if (!storeStatus.isOpen && !isScheduled) {
      setError(`Kitchen Notice: Standard ordering hours are 11:00 AM – 10:00 PM. Please choose a scheduled order slot to place a pre-order!`)
      setTimingMode('scheduled')
      return
    }
    // A basket can outlive the menu it was built from — it is persisted across
    // sessions, and staff can 86 an item after it was added. Re-check here so the
    // kitchen never receives a ticket for something it cannot make.
    const stock = getMenuStockOverrides()
    const soldOut = lines.filter((l) => {
      const product = getProductById(l.productId)
      return product ? isProductSoldOut(product, stock) : false
    })
    if (!isOnlineOrderingEnabled) {
      setError(orderingPausedMessage)
      return
    }

    if (soldOut.length > 0) {
      const names = [...new Set(soldOut.map((l) => l.name))].join(', ')
      setError(
        `Sorry — ${names} just sold out. Please remove ${soldOut.length > 1 ? 'these items' : 'it'} from your basket to continue.`,
      )
      return
    }

    if (!customer.name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!customer.phone.trim()) {
      setError('Please enter your phone number for order updates.')
      return
    }
    if (customer.phone.trim().length < 8) {
      setError('Please enter a valid phone number.')
      return
    }
    if (customer.email.trim() && !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(customer.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (fulfilment === 'delivery') {
      // Last orders for delivery close before the kitchen does. This was computed
      // and shown in the banner but never enforced, so a delivery order placed
      // after the cutoff still went through.
      if (!storeStatus.isAcceptingDelivery && !isScheduled) {
        setError(
          `${storeStatus.message} Please switch to Store Pick Up, or schedule this order for tomorrow.`,
        )
        return
      }
      if (!customer.streetAddress?.trim()) {
        setError('Please enter your delivery street address.')
        return
      }
      if (!isMinOrderMet) {
        setError(`Minimum delivery order is £${(minOrderPence / 100).toFixed(2)}. Please add more items.`)
        return
      }
      // Validate the postcode actually being submitted, not a derived copy of it.
      // `postcodeValidation` follows cart state; re-checking `customer.postcode`
      // here means the gate holds even if the two ever drift apart again.
      const submittedPostcode = validateDeliveryPostcode(customer.postcode || '')
      if (!submittedPostcode.canDeliver || !postcodeValidation.canDeliver) {
        setError(submittedPostcode.message)
        return
      }
    }

    setBusy(true)
    setError(null)

    const res = await processCheckout({
      lines,
      fulfilment,
      customer,
      paymentMethod,
      cardLast4: undefined,
      cardBrand: undefined,
      subtotal: rawSubtotal,
      deliveryFee: fulfilment === 'delivery' ? deliveryFee : 0,
      serviceFee: SERVICE_FEE,
      tip: activeTip,
      discount,
      total: grandTotal,
      kitchenNotes,
      isScheduled,
      scheduledFor: isScheduled ? formattedScheduledTime : undefined,
      scheduleDate: isScheduled ? scheduleDate : undefined,
      scheduleTime: isScheduled ? scheduleTime : undefined,
    })

    setBusy(false)

    if (res.ok && res.orderId) {
      // Ask for notification permission here — the moment the customer has just
      // committed to an order is when live updates are obviously worth having, and
      // it keeps the prompt tied to a real user action rather than a cold page load.
      // Fire-and-forget: a refusal must never block the order from completing.
      if (getNotificationPermission() === 'default') {
        void requestNotificationPermission()
      }
      
      // Save guest details if they aren't logged in
      if (!getCurrentUser()) {
        localStorage.setItem('just_spuds_guest_customer', JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          streetAddress: customer.streetAddress,
          postcode: customer.postcode,
          instructions: customer.instructions,
        }))
      }
      
      clear()
      onClose()
      closeCart()
      navigate(`/track/${res.orderId}`)
    } else {
      setError(res.reason || 'Payment failed. Please check your details.')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 overflow-y-auto" role="dialog" aria-modal="true">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl glass-modal overflow-hidden my-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4 bg-paper/60">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400 text-base">
                  💳
                </span>
                <div>
                  <h3 className="display text-xl text-ink leading-tight">Checkout &amp; Payment</h3>
                  <p className="font-body text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span>{fulfilment === 'delivery' ? '🛵 Home Delivery' : '🛍️ Store Pick Up'}</span>
                    <span>&bull;</span>
                    <span className={isScheduled ? 'text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full' : 'text-slate-600'}>
                      {isScheduled ? `📅 ${formattedScheduledTime}` : '⚡ Instant ASAP'}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink/5 hover:text-ink"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* SECTION 1: Customer Contact & Delivery Info */}
              <div className="rounded-2xl border border-ink/10 bg-paper/40 p-4 space-y-3">
                {!currentUser && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 font-body text-xs text-ink shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🥔</span>
                      <div className="flex flex-col">
                        <span className="font-bold text-amber-900">Have an account?</span>
                        <span className="text-[11px] text-amber-800">Sign in for Spud Points & fast checkout</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await loginWithGoogle()
                          if (res.ok && res.user) {
                            setCustomer((prev) => ({
                              ...prev,
                              name: res.user!.name,
                              email: res.user!.email,
                            }))
                          }
                        }}
                        className="rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-slate-400 transition shadow-xs flex items-center gap-2 active:scale-95"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                    <span>👤</span>
                    <span>1. Contact &amp; {fulfilment === 'delivery' ? 'Delivery Address' : 'Pick Up Details'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      placeholder="e.g. Sarah Mitchell"
                      className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Phone (SMS ETA)</label>
                    <input
                      type="tel"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      placeholder="e.g. 07890 123456"
                      className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Email (Optional)</label>
                    <input
                      type="email"
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      placeholder="e.g. sarah@example.com"
                      className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {fulfilment === 'delivery' ? (
                  <div className="space-y-2 pt-1 border-t border-ink/8">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Street Address / Flat</label>
                        <input
                          type="text"
                          value={customer.streetAddress || ''}
                          onChange={(e) => updateDeliveryField('streetAddress', e.target.value)}
                          placeholder="e.g. 14 Oxford Road, Flat 2B"
                          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Postcode</label>
                        <input
                          type="text"
                          value={customer.postcode || ''}
                          onChange={(e) => updateDeliveryField('postcode', e.target.value.toUpperCase())}
                          placeholder="HP19 8EQ"
                          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs uppercase text-ink focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Postcode validation feedback */}
                    {customer.postcode && (
                      <div className={`rounded-xl p-2 text-[11px] font-body flex items-start gap-1.5 ${postcodeValidation.canDeliver ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                        <span>{postcodeValidation.canDeliver ? '✓' : 'ℹ️'}</span>
                        <span>{postcodeValidation.message}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={customer.instructions || ''}
                        onChange={(e) => updateDeliveryField('instructions', e.target.value)}
                        placeholder="Driver note: e.g. Ring flat 2B buzzer, leave at front door"
                        className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {['🚪 Leave at door', '🤝 Hand to me', '🔔 Ring buzzer', '📦 Leave in porch'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCustomer({ ...customer, instructions: preset })}
                            className="rounded-lg border border-ink/10 bg-white px-2 py-1 font-body text-[10px] font-medium text-slate-700 hover:bg-amber-100 hover:text-ink transition"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-100/50 p-2.5 font-body text-xs text-amber-900 flex items-center gap-2">
                    <span>📍</span>
                    <span>Pick up at <strong>{SITE.name}</strong>, Market Square, Aylesbury HP20 1SN (~15 mins)</span>
                  </div>
                )}

                {/* Timing & Scheduled Order Section */}
                <div className="pt-3 border-t border-ink/8 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="block font-body text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {fulfilment === 'delivery' ? '🛵 Delivery Time & Schedule' : '🛍️ Pick Up Time & Schedule'}
                    </label>
                    {isScheduled && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                        📅 {formattedScheduledTime}
                      </span>
                    )}
                  </div>

                  {/* Pause Warning Banner if Kitchen is Paused */}
                  {(storeStatus.isKitchenPaused || kitchenPause.isPaused) && (
                    <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-rose-900 text-xs font-body space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-700">
                        <span>⏸️</span>
                        <span>Kitchen Live Orders Paused by Staff</span>
                      </div>
                      <p className="text-[11px] text-rose-800 leading-snug">
                        {storeStatus.pauseReason || 'Staff have temporarily paused instant live orders to catch up with tickets.'}
                        {storeStatus.pauseResumeTime ? ` Auto-resumes at ~${storeStatus.pauseResumeTime}.` : ''}
                      </p>
                      <p className="text-[10px] font-bold text-rose-900">
                        👉 Please pick an advance scheduled pre-order time slot below to order ahead!
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (storeStatus.isKitchenPaused || kitchenPause.isPaused) {
                          setError(`Kitchen live orders are currently paused ("${storeStatus.pauseReason || 'Catching up with orders'}"). Please select a scheduled time slot below to order ahead.`)
                          return
                        }
                        setTimingMode('asap')
                      }}
                      className={cx(
                        'flex flex-col items-center justify-center rounded-xl p-2.5 border text-center transition-all',
                        timingMode === 'asap' && !storeStatus.isKitchenPaused && !kitchenPause.isPaused
                          ? 'border-amber-400 bg-amber-400/20 text-ink font-bold shadow-xs'
                          : (storeStatus.isKitchenPaused || kitchenPause.isPaused)
                          ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                          : 'border-ink/10 bg-white text-slate-600 hover:bg-paper'
                      )}
                    >
                      <span className="text-sm">⚡</span>
                      <span className="font-body text-xs font-bold mt-0.5">
                        {fulfilment === 'delivery' ? 'Deliver ASAP' : 'Pick Up ASAP'}
                      </span>
                      <span className="font-body text-[10px] text-slate-500">
                        {fulfilment === 'delivery' ? '~25-35 mins' : '~15 mins'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTimingMode('scheduled')}
                      className={cx(
                        'flex flex-col items-center justify-center rounded-xl p-2.5 border text-center transition-all',
                        timingMode === 'scheduled' || storeStatus.isKitchenPaused || kitchenPause.isPaused
                          ? 'border-amber-400 bg-amber-400 text-ink font-black shadow-xs'
                          : 'border-ink/10 bg-white text-slate-600 hover:bg-paper'
                      )}
                    >
                      <span className="text-sm">📅</span>
                      <span className="font-body text-xs font-bold mt-0.5">Schedule for Later</span>
                      <span className="font-body text-[10px] text-slate-700">Advance Pre-Order Slot</span>
                    </button>
                  </div>

                  {/* Day & Time Slot Pickers when scheduled */}
                  {(timingMode === 'scheduled' || storeStatus.isKitchenPaused || kitchenPause.isPaused) && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block font-body text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Select Delivery Day
                          </label>
                          <select
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs font-bold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
                          >
                            {getScheduleDates().map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-body text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Select Time Slot (11am – 9:30pm)
                          </label>
                          <select
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs font-bold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
                          >
                            {SCHEDULE_TIMES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-amber-950 font-medium">
                        🎯 Order will be freshly baked &amp; {fulfilment === 'delivery' ? 'delivered for' : 'ready for pickup at'} <strong>{formattedScheduledTime}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: Payment Method (In-Store for Pickup, Driver Device for Delivery) */}
              <div className="space-y-3">
                <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <span>{fulfilment === 'delivery' ? '🛵' : '🏪'}</span>
                  <span>2. Payment Details ({fulfilment === 'delivery' ? 'Pay on Delivery' : 'In-Store Counter Payment'})</span>
                </span>

                <div className="rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent p-4 sm:p-5 text-ink space-y-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400 text-xl shadow-glow shrink-0">
                        {fulfilment === 'delivery' ? '📟' : '🛍️'}
                      </span>
                      <div>
                        <h4 className="font-body text-sm font-black text-ink">
                          {fulfilment === 'delivery' ? 'Pay on Delivery via Driver Device' : 'In-Store Payment at Counter'}
                        </h4>
                        <p className="font-body text-xs text-slate-600">
                          {fulfilment === 'delivery' ? 'Driver takes payment at your door' : 'Pay when you collect your fresh order'}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100 border border-amber-300 px-3 py-1 font-body text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-amber-900 shrink-0">
                      {fulfilment === 'delivery' ? 'Pay at Door' : 'Pay on Collection'}
                    </span>
                  </div>

                  {/* Payment Preference Selector: Card Device vs Cash */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block font-body text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Choose How You Will Pay {fulfilment === 'delivery' ? 'the Courier' : 'at the Till'}:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentPreference('device')}
                        className={cx(
                          'flex items-center justify-center gap-2 rounded-xl p-3 border text-center transition-all',
                          paymentPreference === 'device'
                            ? 'border-amber-500 bg-amber-400 text-ink font-black shadow-sm'
                            : 'border-ink/15 bg-white text-slate-700 hover:bg-paper'
                        )}
                      >
                        <span className="text-lg">💳</span>
                        <div className="text-left">
                          <p className="font-body text-xs font-bold leading-tight">
                            {fulfilment === 'delivery' ? 'Driver Card Device' : 'Counter Card Machine'}
                          </p>
                          <p className="font-body text-[10px] opacity-75">Contactless / Apple Pay / PIN</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentPreference('cash')}
                        className={cx(
                          'flex items-center justify-center gap-2 rounded-xl p-3 border text-center transition-all',
                          paymentPreference === 'cash'
                            ? 'border-emerald-600 bg-emerald-600 text-white font-black shadow-sm'
                            : 'border-ink/15 bg-white text-slate-700 hover:bg-paper'
                        )}
                      >
                        <span className="text-lg">💵</span>
                        <div className="text-left">
                          <p className="font-body text-xs font-bold leading-tight">
                            {fulfilment === 'delivery' ? 'Cash to Driver' : 'Cash at Counter'}
                          </p>
                          <p className="font-body text-[10px] opacity-75">Exact change appreciated</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Clarification Box */}
                  <div className="rounded-xl bg-white/90 border border-ink/10 p-3 text-xs font-body text-slate-700 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-ink text-[11px]">
                      <span>ℹ️</span>
                      <span>No online payment taken on website</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {fulfilment === 'delivery'
                        ? `Your order will be freshly baked and dispatched. Our courier carries a portable mobile card terminal for contactless / chip & PIN cards, and also accepts cash at your doorstep (${gbp(grandTotal)}).`
                        : `Your order will be prepared fresh for pickup. Please pay ${gbp(grandTotal)} at our Market Square shop counter when you arrive.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Driver / Staff Tip */}
              {fulfilment === 'delivery' && (
                <div className="rounded-2xl border border-ink/10 bg-paper/40 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                      <span>🛵</span>
                      <span>3. Add Driver Tip (100% goes to courier)</span>
                    </span>
                    <span className="font-body text-xs font-bold text-amber-700">{gbp(activeTip)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {TIPS.map((tipAmount) => {
                      const isSelected = !isCustomTip && selectedTip === tipAmount
                      return (
                        <button
                          key={tipAmount}
                          type="button"
                          onClick={() => { setSelectedTip(tipAmount); setIsCustomTip(false) }}
                          className={cx(
                            'flex-1 rounded-xl py-2 font-body text-xs font-bold transition-all',
                            isSelected
                              ? 'bg-amber-400 text-ink shadow-sm font-black'
                              : 'bg-white text-slate-700 border border-ink/10 hover:bg-paper'
                          )}
                        >
                          {tipAmount === 0 ? 'No Tip' : gbp(tipAmount)}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setIsCustomTip(true)}
                      className={cx(
                        'flex-1 rounded-xl py-2 font-body text-xs font-bold transition-all',
                        isCustomTip
                          ? 'bg-amber-400 text-ink shadow-sm font-black'
                          : 'bg-white text-slate-700 border border-ink/10 hover:bg-paper'
                      )}
                    >
                      Custom
                    </button>
                  </div>

                  {isCustomTip && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-body text-xs font-bold text-ink">£</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={customTipInput}
                        onChange={(e) => setCustomTipInput(e.target.value)}
                        placeholder="Enter tip (e.g. 2.50)"
                        className="flex-1 rounded-xl border border-ink/15 bg-white px-3 py-1.5 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 4: Order Breakdown Summary */}
              <div className="rounded-2xl border border-ink/10 bg-slate-50 p-4 space-y-1.5 text-xs font-body">
                <div className="flex justify-between text-slate-600">
                  <span>Items Subtotal ({lines.length} items)</span>
                  <span>{gbp(rawSubtotal)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>First Visit Promo</span>
                    <span>-{gbp(discount)}</span>
                  </div>
                )}

                {fulfilment === 'delivery' && (
                  <div className="flex justify-between text-slate-600">
                    <span>Delivery Fee</span>
                    <span className={deliveryFee === 0 ? 'text-emerald-600 font-bold' : ''}>
                      {deliveryFee === 0 ? 'FREE' : gbp(deliveryFee)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>Packaging &amp; Service</span>
                  <span>{gbp(SERVICE_FEE)}</span>
                </div>

                {activeTip > 0 && (
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>Courier Tip</span>
                    <span>{gbp(activeTip)}</span>
                  </div>
                )}

                <div className="flex items-baseline justify-between pt-2 border-t border-ink/10">
                  <div>
                    <span className="font-bold text-sm text-ink uppercase tracking-wider">Total to Pay</span>
                    <span className="ml-1.5 text-[10px] text-slate-500">
                      ({fulfilment === 'delivery' ? (paymentPreference === 'cash' ? 'Cash on Delivery' : 'Pay via Driver Device') : (paymentPreference === 'cash' ? 'Cash at Counter' : 'Pay at Counter')})
                    </span>
                  </div>
                  <span className="display text-2xl text-ink font-bold">{gbp(grandTotal)}</span>
                </div>
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 border border-red-200 p-3 font-body text-xs text-red-600 text-center">
                  {error}
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 shrink-0 z-30 border-t border-ink/10 p-4 sm:p-5 bg-white flex items-center justify-between gap-4 shadow-2xl">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-3 font-body text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-ink"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={busy || !isOnlineOrderingEnabled}
                className="flex-1 rounded-full bg-amber-400 py-3.5 px-6 font-body text-[12px] font-black uppercase tracking-[0.14em] text-ink shadow-glow transition-all hover:bg-amber-300 active:scale-95 disabled:opacity-60 flex items-center justify-between"
              >
                <span>
                  {!isOnlineOrderingEnabled
                    ? '📢 Ordering Launching Soon'
                    : busy
                    ? 'Confirming Order...'
                    : fulfilment === 'delivery'
                    ? 'Confirm Order (Pay on Delivery) →'
                    : 'Confirm Order (Pay In-Store) →'}
                </span>
                <span className="tabular-nums">{gbp(grandTotal)}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
