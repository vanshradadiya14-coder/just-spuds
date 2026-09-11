import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getOrderById,
  getActiveCustomerOrderId,
  getAllActiveCustomerOrders,
  subscribeOrders,
  cancelOrder,
  isCustomerAuthorizedForOrder,
  verifyCustomerOrderAccess,
  addCustomerPlacedOrderId,
  submitOrderReview,
  type Order,
  type OrderStatus,
} from '../services/orderStore'
import { getCurrentUser, hasRole, SHOP_FLOOR_ROLES } from '../services/authStore'
import { lineUnitPrice } from '../hooks/useCart'
import { SITE } from '../data/site'
import ThermalReceipt from '../components/ThermalReceipt'
import { gbp, cx } from '../utils/format'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

const STAGES: { key: OrderStatus; label: string; icon: string; desc: string }[] = [
  { key: 'placed', label: 'Order Placed', icon: '📝', desc: 'Received and payment verified' },
  { key: 'accepted', label: 'Accepted', icon: '👨‍🍳', desc: 'Kitchen printed your ticket' },
  { key: 'baking', label: 'Baking in Oven', icon: '🔥', desc: 'King Edwards roasting & toppings prepared' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🛵', desc: 'Courier on the road to your door' },
  { key: 'delivered', label: 'Delivered', icon: '🎉', desc: 'Handed to you. Enjoy!' },
]

const PICKUP_STAGES: { key: OrderStatus; label: string; icon: string; desc: string }[] = [
  { key: 'placed', label: 'Order Placed', icon: '📝', desc: 'Received and payment verified' },
  { key: 'accepted', label: 'Accepted', icon: '👨‍🍳', desc: 'Kitchen printed your ticket' },
  { key: 'baking', label: 'Baking in Oven', icon: '🔥', desc: 'King Edwards roasting hot' },
  { key: 'ready_for_pickup', label: 'Ready for Collection', icon: '🛍️', desc: 'Waiting at Market Square counter' },
  { key: 'collected', label: 'Collected', icon: '🎉', desc: 'Handed over at counter. Enjoy!' },
]

/**
 * Maps EVERY OrderStatus onto a stage index in the 5-step arrays above.
 *
 * These are typed as Record<OrderStatus, number> deliberately: the previous
 * implementation did a findIndex over the stage array and fell back to 0 for
 * anything it didn't find. Since the arrays only list 5 of the 14 statuses, the
 * whole driver-handoff range (ready_for_delivery, driver_assigned,
 * driver_arrived_at_store) collapsed to 0 — so the moment the kitchen dispatched
 * an order, the customer's tracker jumped backwards to "Order Placed" and stayed
 * there. failed_delivery rendered as "Order Placed" too, so a customer whose
 * delivery had actually failed was never told.
 *
 * The Record type means adding a new OrderStatus is now a compile error until it
 * is mapped here, which is what stops this regressing again.
 *
 * -1 = off the happy path (cancelled / failed), rendered as an error state.
 */
const DELIVERY_STAGE_INDEX: Record<OrderStatus, number> = {
  placed: 0,
  accepted: 1,
  baking: 2,
  quality_check: 2,
  ready_for_delivery: 2,       // packed, waiting for a courier to claim
  driver_assigned: 2,          // courier en route to the store
  driver_arrived_at_store: 2,  // courier at the counter
  order_collected: 3,          // courier has the food — genuinely on the road now
  out_for_delivery: 3,
  ready_for_pickup: 3,         // not expected on a delivery order
  delivered: 4,
  collected: 4,
  failed_delivery: -1,
  cancelled: -1,
}

const PICKUP_STAGE_INDEX: Record<OrderStatus, number> = {
  placed: 0,
  accepted: 1,
  baking: 2,
  quality_check: 2,
  ready_for_delivery: 2,
  driver_assigned: 2,
  driver_arrived_at_store: 2,
  order_collected: 3,
  out_for_delivery: 3,
  ready_for_pickup: 3,         // waiting on the counter rack
  delivered: 4,
  collected: 4,
  failed_delivery: -1,
  cancelled: -1,
}

function getStageIndex(status: OrderStatus, isDelivery: boolean): number {
  return (isDelivery ? DELIVERY_STAGE_INDEX : PICKUP_STAGE_INDEX)[status] ?? 0
}

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Need to change delivery address or phone',
  'Delivery time is longer than expected',
  'Forgot to add extra toppings or drinks',
  'Ordered duplicate meal',
  'Other reason',
]

export default function OrderTrackingPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()

  // Staff bypass check
  const currentUser = getCurrentUser()
  const isStaff = hasRole(currentUser, SHOP_FLOOR_ROLES)

  const [allActiveOrders, setAllActiveOrders] = useState<Order[]>(() => getAllActiveCustomerOrders())

  // Current order state
  const [order, setOrder] = useState<Order | undefined>(() => {
    const targetId = orderId || getActiveCustomerOrderId()
    return targetId ? getOrderById(targetId) : undefined
  })

  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    const targetId = orderId || getActiveCustomerOrderId()
    const targetOrder = targetId ? getOrderById(targetId) : undefined
    return targetOrder ? isCustomerAuthorizedForOrder(targetOrder, isStaff) : false
  })

  // Verification Form State (for protecting customer privacy when opening on another device)
  const [verificationInput, setVerificationInput] = useState('')
  const [verificationError, setVerificationError] = useState<string | null>(null)

  // Generic Order Lookup Form State (when landing on /track with no active order)
  const [lookupOrderId, setLookupOrderId] = useState('')
  const [lookupVerification, setLookupVerification] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [isCancelModalOpen, setCancelModalOpen] = useState(false)
  const [isReceiptModalOpen, setReceiptModalOpen] = useState(false)
  const [selectedReason, setSelectedReason] = useState(CANCEL_REASONS[0])
  const [cancelBusy, setCancelBusy] = useState(false)

  // Post-delivery review state
  const [reviewRating, setReviewRating] = useState<number>(order?.review?.rating || 5)
  const [reviewComment, setReviewComment] = useState<string>(order?.review?.comment || '')
  const [selectedTags, setSelectedTags] = useState<string[]>(order?.review?.tags || [])
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(!!order?.review)
  const [reviewSavedMessage, setReviewSavedMessage] = useState<string | null>(null)

  useDocumentMeta({
    title: order ? `Track Order #${order.shortId} (${order.status.toUpperCase()})` : 'Track Your Order',
    description:
      'Live order tracking with real-time kitchen baking progress and courier route for Just Spuds Aylesbury.',
  })

  // Real-time synchronization
  useEffect(() => {
    const updateAll = () => {
      setAllActiveOrders(getAllActiveCustomerOrders())
    }
    updateAll()

    const unsub = subscribeOrders((orders) => {
      updateAll()
      const targetId = orderId || getActiveCustomerOrderId()
      const found = targetId
        ? orders.find((o) => o.id === targetId || o.shortId.toLowerCase() === targetId.toLowerCase())
        : undefined
      setOrder(found)
      if (found) {
        setIsAuthorized(isCustomerAuthorizedForOrder(found, isStaff))
      }
    })
    return unsub
  }, [orderId, isStaff])

  // Handle Verification for specific order
  const handleVerifyOrder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!order) return
    const ok = verifyCustomerOrderAccess(order, verificationInput)
    if (ok) {
      setIsAuthorized(true)
      setVerificationError(null)
    } else {
      setVerificationError('Verification failed. Please enter the correct phone number (e.g. last 4 digits) or delivery postcode.')
    }
  }

  // Handle Lookup for unknown order
  const handleLookupOrder = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanId = lookupOrderId.trim()
    const found = getOrderById(cleanId)
    if (!found) {
      setLookupError(`Could not find an order matching "${cleanId}". Please check your order confirmation.`)
      return
    }

    if (isStaff || isCustomerAuthorizedForOrder(found, false)) {
      navigate(`/track/${found.id}`)
      return
    }

    const ok = verifyCustomerOrderAccess(found, lookupVerification)
    if (ok) {
      addCustomerPlacedOrderId(found.id)
      navigate(`/track/${found.id}`)
    } else {
      setLookupError('Order found, but the phone number or postcode did not match. Please verify and try again.')
    }
  }

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!order) return
    const updated = submitOrderReview(order.id, {
      rating: reviewRating,
      tags: selectedTags,
      comment: reviewComment,
    })
    if (updated) {
      setOrder(updated)
      setReviewSubmitted(true)
      setReviewSavedMessage('Thank you! Your review has been saved.')
    }
  }

  const toggleReviewTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  // ==============================================================
  // CASE 1: No Order Found OR Bare /track with no active order
  // ==============================================================
  if (!order) {
    return (
      <div className="min-h-[85vh] bg-stock pt-[120px] sm:pt-[140px] pb-24 px-5">
        <div className="mx-auto max-w-xl text-center space-y-6">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-400/20 text-4xl shadow-glow text-amber-500">
            🔍
          </div>

          <div>
            <h1 className="display text-3xl sm:text-4xl text-ink">Track Your Order</h1>
            <p className="mt-2 font-body text-sm text-steel max-w-md mx-auto">
              Live order tracking is private to the customer who placed the order. Look up your order below using your order reference and phone number.
            </p>
          </div>

          {/* Secure Lookup Form */}
          <div className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8 shadow-xl text-left">
            <form onSubmit={handleLookupOrder} className="space-y-4">
              <div>
                <label className="block font-body text-xs font-bold text-ink mb-1.5">
                  Order Number / Reference
                </label>
                <input
                  type="text"
                  required
                  value={lookupOrderId}
                  onChange={(e) => setLookupOrderId(e.target.value)}
                  placeholder="e.g. JS-71934 or 71934"
                  className="w-full rounded-2xl border border-ink/15 bg-paper px-4 py-3 font-mono text-sm text-ink placeholder:text-steel/50 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-body text-xs font-bold text-ink mb-1.5">
                  Phone Number or Delivery Postcode
                </label>
                <input
                  type="text"
                  required
                  value={lookupVerification}
                  onChange={(e) => setLookupVerification(e.target.value)}
                  placeholder="e.g. 07890 123456 or HP20 1SN"
                  className="w-full rounded-2xl border border-ink/15 bg-paper px-4 py-3 font-body text-sm text-ink placeholder:text-steel/50 focus:border-amber-400 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-steel">
                  Used to verify customer identity and protect delivery address details.
                </p>
              </div>

              {lookupError && (
                <p className="rounded-xl bg-red-50 border border-red-200 p-3 font-body text-xs font-bold text-red-600">
                  {lookupError}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition active:scale-[0.99]"
              >
                Track Live Order →
              </button>
            </form>
          </div>

          <div className="pt-4 flex items-center justify-center gap-3">
            <Link
              to="/menu"
              className="rounded-full bg-ink px-6 py-3 font-body text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 transition"
            >
              Order Fresh Spuds 🥔
            </Link>
            <Link
              to="/find-us"
              className="rounded-full border border-ink/20 px-6 py-3 font-body text-xs font-bold uppercase tracking-wider text-ink hover:bg-white transition"
            >
              Contact Shop
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ==============================================================
  // CASE 2: Order exists, but accessed from an unverified browser
  // ==============================================================
  if (!isAuthorized) {
    return (
      <div className="min-h-[85vh] bg-stock pt-[120px] sm:pt-[140px] pb-24 px-5">
        <div className="mx-auto max-w-md text-center space-y-6">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-400/20 text-4xl shadow-glow text-amber-500">
            🔒
          </div>

          <div>
            <span className="rounded-full bg-amber-400/30 px-3 py-1 font-mono text-xs font-black text-ink">
              Order #{order.shortId}
            </span>
            <h1 className="display text-3xl text-ink mt-3">Customer Verification</h1>
            <p className="mt-2 font-body text-xs text-steel max-w-sm mx-auto">
              To protect the customer's delivery address and order details, please verify that you placed this order.
            </p>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8 shadow-xl text-left">
            <form onSubmit={handleVerifyOrder} className="space-y-4">
              <div>
                <label className="block font-body text-xs font-bold text-ink mb-1.5">
                  Phone Number or Delivery Postcode
                </label>
                <input
                  type="text"
                  required
                  value={verificationInput}
                  onChange={(e) => setVerificationInput(e.target.value)}
                  placeholder="e.g. last 4 digits of phone or postcode"
                  autoFocus
                  className="w-full rounded-2xl border border-ink/15 bg-paper px-4 py-3 font-body text-sm text-ink placeholder:text-steel/50 focus:border-amber-400 focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-steel">
                  Enter the phone number (or last 4 digits) or delivery postcode used during checkout.
                </p>
              </div>

              {verificationError && (
                <p className="rounded-xl bg-red-50 border border-red-200 p-3 font-body text-xs font-bold text-red-600">
                  {verificationError}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition active:scale-[0.99]"
              >
                Verify &amp; View Order →
              </button>
            </form>
          </div>

          <div className="text-center pt-2">
            <Link to="/menu" className="font-body text-xs font-bold text-steel hover:text-ink">
              ← Return to Menu
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ==============================================================
  // CASE 3: Authenticated / Authorized Customer Tracking View
  // ==============================================================
  const isDelivery = order.fulfilment === 'delivery'
  const stages = isDelivery ? STAGES : PICKUP_STAGES

  const currentStageIdx = getStageIndex(order.status, isDelivery)
  const isCancelled = order.status === 'cancelled'
  const isFailed = order.status === 'failed_delivery'
  const isOffTrack = isCancelled || isFailed
  const isComplete = order.status === 'delivered' || order.status === 'collected'
  const canCancel = ['placed', 'accepted', 'baking'].includes(order.status)

  const handleCopyOrderId = () => {
    navigator.clipboard.writeText(order.shortId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecuteCancel = async () => {
    setCancelBusy(true)
    cancelOrder(order.id, selectedReason)
    setCancelBusy(false)
    setCancelModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-stock pb-32 pt-[110px] sm:pt-[130px]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">

        {/* Top Breadcrumb & Status Pill */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Link to="/menu" className="font-body text-xs font-bold text-steel hover:text-ink">
              ← Back to Menu
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-body text-xs font-bold text-ink">Live Order Tracking</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReceiptModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-400/20 px-3.5 py-1 font-body text-xs font-bold text-amber-900 shadow-sm hover:bg-amber-400 transition"
            >
              <span>🖨️</span>
              <span>Print Receipt</span>
            </button>

            <button
              type="button"
              onClick={handleCopyOrderId}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3.5 py-1 font-mono text-xs font-bold text-ink shadow-sm hover:bg-paper"
            >
              <span>#{order.shortId}</span>
              <span className="text-[10px] text-steel">{copied ? '✓ Copied' : '📋'}</span>
            </button>
          </div>
        </div>

        {/* MULTI-ORDER SWITCHER BANNER */}
        {allActiveOrders.length > 1 && (
          <div className="mb-6 rounded-3xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-400 font-bold text-ink text-xl shadow-glow animate-pulse">
                🛵
              </span>
              <div>
                <h4 className="font-body text-xs font-black text-ink uppercase tracking-wider">
                  You Have {allActiveOrders.length} Active Orders in Progress
                </h4>
                <p className="font-body text-[11px] text-slate-600">
                  Switch between your simultaneous food orders to track live status:
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {allActiveOrders.map((ord) => (
                <Link
                  key={ord.id}
                  to={`/track/${ord.id}`}
                  className={cx(
                    'rounded-xl px-3.5 py-2 font-body text-xs font-bold transition-all flex items-center gap-2 shadow-xs',
                    order && ord.id === order.id
                      ? 'bg-amber-400 text-ink font-black ring-2 ring-amber-500/50 scale-[1.03]'
                      : 'bg-white text-slate-700 hover:bg-amber-100/60 border border-ink/10'
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  <span>#{ord.shortId}</span>
                  <span className="text-[10px] font-normal uppercase opacity-75">({ord.status.replace(/_/g, ' ')})</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* HERO STATUS CARD */}
        <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-gradient-to-br from-ink to-slate-900 p-6 sm:p-8 text-white shadow-2xl mb-8">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-400/40 px-3 py-1 font-body text-[11px] font-black uppercase tracking-wider text-amber-300">
                  <span className={cx('h-2 w-2 rounded-full', isOffTrack ? 'bg-red-400' : isComplete ? 'bg-emerald-400' : 'bg-amber-400 animate-ping')} />
                  {isCancelled
                    ? 'Order Cancelled'
                    : isFailed
                    ? 'Delivery Attempt Failed'
                    : isComplete
                    ? 'Completed'
                    : order.isScheduled
                    ? `📅 Pre-Order (${order.scheduledFor || order.estimatedDeliveryTime})`
                    : isDelivery
                    ? '🛵 Live Delivery in Progress'
                    : '🛍️ Pick Up in Progress'}
                </span>
                <span className="font-body text-xs text-white/60">
                  Placed at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <h1 className="display text-3xl sm:text-4xl text-white">
                {isCancelled
                  ? 'Order Declined & Refunded'
                  : isFailed
                  ? 'We couldn’t complete your delivery'
                  : order.isScheduled
                  ? `Scheduled for ${order.scheduledFor || order.estimatedDeliveryTime}`
                  : order.status === 'out_for_delivery'
                  ? 'Courier is on the way!'
                  : order.status === 'ready_for_pickup'
                  ? 'Hot & Ready for Collection!'
                  : order.status === 'baking'
                  ? 'Baking Fresh in the Oven'
                  : order.status === 'accepted'
                  ? 'Kitchen Accepted Your Order'
                  : isComplete
                  ? 'Order Delivered!'
                  : 'Order Placed & Confirmed'}
              </h1>

              <p className="mt-1 font-body text-sm text-white/70 max-w-xl">
                {isCancelled
                  ? (order.payment.status === 'refunded'
                    ? `Full refund of £${((order.cancellation?.refundAmount || order.payment.total) / 100).toFixed(2)} processed.`
                    : 'This order was cancelled. No payment was collected.')
                  : isFailed
                  ? `Our courier couldn’t hand over your order. Please call the shop on ${SITE.phone} and we’ll put it right.`
                  : isDelivery
                  ? `Delivering to ${order.customer.streetAddress || 'Aylesbury'}, ${order.customer.postcode || 'HP20'}`
                  : `Collection at Market Square counter, Aylesbury (HP20 1SN)`}
              </p>
            </div>

            {/* ETA Countdown Badge — no ETA makes sense once off the happy path */}
            {!isOffTrack && !isComplete && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-400/30 bg-white/10 px-6 py-4 backdrop-blur-md shrink-0">
                <span className="font-body text-[10px] font-bold uppercase tracking-widest text-amber-300">
                  {order.isScheduled ? 'Scheduled For' : (isDelivery ? 'Estimated Arrival' : 'Estimated Ready In')}
                </span>
                <span className="display text-2xl sm:text-3xl text-white font-bold my-0.5 text-center">
                  {order.isScheduled ? (order.scheduleTime || order.estimatedDeliveryTime) : (order.etaMinutes > 0 ? `${order.etaMinutes}m` : 'Ready')}
                </span>
                <span className="font-body text-[11px] text-white/70">
                  {order.isScheduled ? (order.scheduleDate || 'Advance Order') : order.estimatedDeliveryTime}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SECURE DELIVERY PIN (OTP) CALLOUT
            Only rendered once a PIN actually exists. It previously fell back to a
            hardcoded '4821' while the driver's verifier fell back to '1234', so an
            order that was never dispatched showed the customer a code no courier
            would accept. */}
        {isDelivery && !isOffTrack && !isComplete && order.deliveryDetails?.deliveryPin && (
          <div className="rounded-3xl border-2 border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 sm:p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-2xl text-ink font-bold shadow-md">
                🔐
              </span>
              <div>
                <span className="font-body text-[10px] font-black uppercase tracking-widest text-amber-700 block">
                  Your Secure Delivery PIN
                </span>
                <p className="font-body text-xs text-steel">
                  Give this 4-digit code to your Just Spuds courier upon doorstep arrival to complete handoff.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/50 bg-white px-6 py-3 text-center shadow-md shrink-0">
              <span className="font-mono text-2xl sm:text-3xl font-black tracking-widest text-ink">
                {order.deliveryDetails.deliveryPin}
              </span>
            </div>
          </div>
        )}

        {/* 2-COLUMN MAIN CONTENT */}
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">

          {/* LEFT COLUMN: Map Simulation, Live Stepper & Driver Card */}
          <div className="space-y-8">

            {/* CANCELLATION & REFUND CALLOUT CARD */}
            {isCancelled && (
              <div className="rounded-3xl border border-red-500/30 bg-white p-6 sm:p-8 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-2xl text-red-500">
                    ❌
                  </span>
                  <div>
                    <h2 className="display text-xl text-ink font-bold">Order Declined by Kitchen</h2>
                    <span className="font-body text-xs text-steel">
                      100% Refund processed automatically
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 p-4 text-xs font-body text-ink space-y-1">
                  <p className="font-bold uppercase tracking-wider text-amber-900 text-[10px]">
                    Kitchen Staff Explanation:
                  </p>
                  <p className="text-slate-800 text-sm font-medium">
                    &ldquo;{order.cancellation?.reason || 'Kitchen temporarily unavailable to fulfill this item.'}&rdquo;
                  </p>
                </div>

                {order.payment.status === 'refunded' ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/80 p-4 flex items-center justify-between gap-3 text-xs font-body text-emerald-950">
                    <div>
                      <p className="font-bold text-emerald-900">Refund Summary</p>
                      <p className="text-emerald-800 text-[11px]">
                        Full £{((order.cancellation?.refundAmount || order.payment.total) / 100).toFixed(2)} refunded.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase text-white shrink-0">
                      Processed ✓
                    </span>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3 text-xs font-body text-slate-800">
                    <div>
                      <p className="font-bold text-slate-900">Payment Status</p>
                      <p className="text-slate-600 text-[11px]">
                        No payment was taken for this order (payment was due upon {order.fulfilment === 'delivery' ? 'delivery' : 'collection'}).
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-black uppercase text-slate-700 shrink-0">
                      No Charge
                    </span>
                  </div>
                )}

                <div className="pt-2 flex items-center gap-3">
                  <Link
                    to="/menu"
                    className="rounded-full bg-ink px-6 py-3 font-body text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 transition shadow-md"
                  >
                    Browse Other Spuds &rarr;
                  </Link>
                  <a
                    href={`tel:${SITE.phone}`}
                    className="rounded-full border border-ink/10 bg-paper px-4 py-3 font-body text-xs font-bold text-ink hover:bg-line transition"
                  >
                    Call Store ({SITE.phone})
                  </a>
                </div>
              </div>
            )}

            {/* LIVE SIMULATED GPS ROUTE MAP (Uber Eats Style) */}
            {isDelivery && !isCancelled && (
              <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-xl">
                <div className="p-4 border-b border-ink/10 flex items-center justify-between bg-paper/60">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🗺️</span>
                    <span className="font-body text-xs font-bold uppercase tracking-wider text-ink">
                      Live Courier GPS Tracker &bull; Aylesbury
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    GPS Connected
                  </span>
                </div>

                {/* SVG Visual Map Simulation */}
                <div className="relative h-64 sm:h-72 w-full bg-[#e8ece9] overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 600 300" preserveAspectRatio="none">
                    {/* Map Grid Roads */}
                    <path d="M0,80 Q200,70 600,100" stroke="#d5dcda" strokeWidth="18" fill="none" />
                    <path d="M100,0 Q180,150 200,300" stroke="#d5dcda" strokeWidth="14" fill="none" />
                    <path d="M400,0 Q420,180 550,300" stroke="#d5dcda" strokeWidth="14" fill="none" />
                    <path d="M0,220 Q300,240 600,200" stroke="#d5dcda" strokeWidth="16" fill="none" />

                    {/* Delivery Route Path */}
                    <path
                      id="deliveryRoute"
                      d="M 120,160 Q 240,110 320,170 T 480,140"
                      stroke="#f59e0b"
                      strokeWidth="6"
                      strokeDasharray="8 6"
                      fill="none"
                      className="animate-[dash_20s_linear_infinite]"
                    />

                    {/* Store Pin (Origin) */}
                    <g transform="translate(120, 160)">
                      <circle r="18" fill="#1e293b" />
                      <circle r="8" fill="#f59e0b" />
                      <text x="0" y="32" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                        Just Spuds (Market Sq)
                      </text>
                    </g>

                    {/* Customer Destination Pin */}
                    <g transform="translate(480, 140)">
                      <circle r="18" fill="#10b981" />
                      <circle r="8" fill="#ffffff" />
                      <text x="0" y="32" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                        Your Address ({order.customer.postcode || 'Aylesbury'})
                      </text>
                    </g>

                    {/* Moving Courier Icon */}
                    <g
                      transform={
                        order.status === 'out_for_delivery'
                          ? 'translate(310, 155)'
                          : isComplete
                          ? 'translate(480, 140)'
                          : 'translate(120, 160)'
                      }
                      className="transition-all duration-1000"
                    >
                      <circle r="22" fill="#f59e0b" className="animate-pulse shadow-xl" />
                      <text x="0" y="6" textAnchor="middle" fontSize="16">🛵</text>
                    </g>
                  </svg>

                  {/* Floating Map Status Overlay */}
                  <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-white/95 p-3 backdrop-blur shadow-md flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400 text-sm">
                        📍
                      </div>
                      <div>
                        <p className="font-body text-xs font-bold text-ink">
                          {order.status === 'out_for_delivery'
                            ? `Driver is ${order.etaMinutes} mins away from ${order.customer.postcode}`
                            : isComplete
                            ? 'Order safely delivered to destination'
                            : 'Driver is assigned and waiting at Market Square'}
                        </p>
                        <p className="text-[11px] text-steel">
                          Direct hot-delivery route via Buckingham Road
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE STEPPER PROGRESSION */}
            <div className="rounded-3xl border border-ink/10 bg-white p-6 sm:p-8 shadow-xl">
              <h2 className="display text-xl text-ink mb-6">Kitchen &amp; Delivery Progress</h2>

              <div className="space-y-6 relative before:absolute before:left-5 before:top-3 before:bottom-3 before:w-0.5 before:bg-ink/10">
                {stages.map((stage, idx) => {
                  const isPast = !isOffTrack && currentStageIdx > idx
                  const isCurrent = !isOffTrack && currentStageIdx === idx

                  return (
                    <div key={stage.key} className="relative flex items-start gap-4">
                      <div
                        className={cx(
                          'relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-bold transition-all',
                          isPast
                            ? 'bg-emerald-500 text-white shadow-md'
                            : isCurrent
                            ? 'bg-amber-400 text-ink ring-4 ring-amber-400/20 shadow-glow animate-bounce'
                            : 'bg-paper text-steel/60 border border-ink/10'
                        )}
                      >
                        {isPast ? '✓' : stage.icon}
                      </div>

                      <div className="pt-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h3
                            className={cx(
                              'font-body text-sm font-bold',
                              isCurrent ? 'text-ink' : isPast ? 'text-ink' : 'text-steel/60'
                            )}
                          >
                            {stage.label}
                          </h3>
                          {isCurrent && (
                            <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider text-amber-700">
                              Current Stage
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-steel mt-0.5">{stage.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AWAITING COURIER — honest placeholder while no driver is assigned.
                Previously a hardcoded driver was stamped on every delivery order at
                payment time, so this card always showed a name and phone number even
                though nobody had accepted the job yet. */}
            {isDelivery && !order.driver && !isOffTrack && !isComplete && (
              <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-xl flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-paper text-2xl">
                  🛵
                </div>
                <div>
                  <span className="font-body text-[10px] font-bold uppercase tracking-wider text-steel">
                    Your Delivery Partner
                  </span>
                  <h3 className="font-body text-base font-bold text-ink">Finding you a courier…</h3>
                  <p className="font-body text-xs text-steel">
                    We&rsquo;ll show their name and contact details here as soon as one picks up your order.
                  </p>
                </div>
              </div>
            )}

            {/* ASSIGNED DRIVER CARD */}
            {isDelivery && order.driver && !isOffTrack && (
              <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img
                      src={order.driver.avatar}
                      alt={order.driver.name}
                      className="h-16 w-16 rounded-2xl object-cover border border-ink/10"
                    />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-1 text-[9px] text-white">
                      ✓
                    </span>
                  </div>
                  <div>
                    <span className="font-body text-[10px] font-bold uppercase tracking-wider text-steel">
                      Your Delivery Partner
                    </span>
                    <h3 className="font-body text-base font-bold text-ink">{order.driver.name}</h3>
                    <p className="font-body text-xs text-steel">
                      ⭐ {order.driver.rating} &bull; {order.driver.vehicle} &bull; {order.driver.deliveriesCount} deliveries
                    </p>
                  </div>
                </div>

                <a
                  href={`tel:${order.driver.phone}`}
                  className="rounded-full bg-amber-400 px-4 py-2.5 font-body text-xs font-bold text-ink shadow-sm hover:bg-amber-300 transition flex items-center gap-1.5 shrink-0"
                >
                  <span>📞</span>
                  <span>Call Driver</span>
                </a>
              </div>
            )}

            {/* POST-DELIVERY CUSTOMER REVIEW & FEEDBACK (Roadmap 5.8) */}
            {isComplete && !isCancelled && (
              <div className="rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-6 sm:p-8 shadow-xl">
                <div className="flex items-center justify-between gap-2 border-b border-ink/10 pb-4">
                  <div>
                    <span className="font-body text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      Customer Feedback
                    </span>
                    <h3 className="display text-xl text-ink font-bold">
                      {reviewSubmitted ? 'Thank you for your rating! ⭐' : 'How was your hot spud today?'}
                    </h3>
                  </div>
                  <span className="text-2xl">🥔</span>
                </div>

                {reviewSubmitted ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-1 text-xl text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i}>{i < reviewRating ? '★' : '☆'}</span>
                      ))}
                      <span className="ml-2 font-body text-xs font-bold text-ink">
                        {reviewRating === 5 ? 'Exceptional!' : `${reviewRating} / 5 Stars`}
                      </span>
                    </div>

                    {selectedTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-amber-200/70 px-2.5 py-1 text-[11px] font-bold text-ink"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {reviewComment && (
                      <p className="rounded-2xl bg-white p-3 font-body text-xs italic text-slate-700 border border-ink/8">
                        &ldquo;{reviewComment}&rdquo;
                      </p>
                    )}

                    <div className="pt-2 flex items-center justify-between">
                      <p className="text-[11px] font-medium text-emerald-700">
                        {reviewSavedMessage || '✓ Feedback recorded for Aylesbury kitchen team'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReviewSubmitted(false)}
                        className="text-[11px] font-bold text-amber-800 underline hover:text-amber-900"
                      >
                        Edit Review
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
                    <div>
                      <label className="block font-body text-xs font-bold text-ink mb-1.5">
                        Your Rating:
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewRating(star)}
                            className={cx(
                              'text-2xl transition-transform hover:scale-125 focus:outline-none',
                              star <= reviewRating ? 'text-amber-500' : 'text-slate-300'
                            )}
                            title={`${star} Star${star > 1 ? 's' : ''}`}
                          >
                            ★
                          </button>
                        ))}
                        <span className="ml-2 text-xs font-bold text-slate-700">
                          {reviewRating === 5 && '🌟 Perfect & Hot'}
                          {reviewRating === 4 && '👍 Great meal'}
                          {reviewRating === 3 && '👌 Good'}
                          {reviewRating <= 2 && '⚠️ Needs improvement'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block font-body text-xs font-bold text-ink mb-1.5">
                        What stood out? (Tap all that apply):
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'Piping Hot 🔥',
                          'Super Fast Delivery ⚡',
                          'Crispy Jacket Skin 🥔',
                          'Generous Fillings 🧀',
                          'Friendly Courier 🛵',
                          'Eco Packaging 📦',
                        ].map((tag) => {
                          const isSelected = selectedTags.includes(tag)
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleReviewTag(tag)}
                              className={cx(
                                'rounded-full px-3 py-1 text-xs font-bold transition-all',
                                isSelected
                                  ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/50'
                                  : 'bg-white text-slate-700 border border-ink/10 hover:bg-amber-50'
                              )}
                            >
                              {isSelected ? `✓ ${tag}` : tag}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block font-body text-xs font-bold text-ink mb-1">
                        Additional Comments (Optional):
                      </label>
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Tell us about the flavour, portion size, or delivery experience..."
                        rows={2}
                        className="w-full rounded-2xl border border-ink/15 bg-white p-3 font-body text-xs text-ink focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-2xl bg-amber-500 py-2.5 font-body text-xs font-bold uppercase tracking-wider text-ink shadow-md hover:bg-amber-400 transition"
                    >
                      Submit Review &amp; Feedback &rarr;
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Order Summary, Receipt & Support */}
          <div className="space-y-6">

            {/* CUSTOMER ACCOUNT & REWARDS SUGGESTION */}
            {!getCurrentUser() && (
              <div className="rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent p-6 shadow-xl space-y-3 text-ink">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-400 text-lg shadow-glow">
                    🥔
                  </span>
                  <div>
                    <h4 className="font-body text-sm font-black text-ink">Earn 50 Spud Loyalty Points</h4>
                    <p className="font-body text-xs text-slate-600">Save this order to your Just Spuds account</p>
                  </div>
                </div>
                <p className="font-body text-xs text-slate-600 leading-relaxed">
                  Sign in or create a free account to save your delivery address, track orders across devices, and earn points towards free spud toppings.
                </p>
                <Link
                  to={`/login?redirect=/track/${order.id}`}
                  className="block w-full rounded-2xl bg-amber-400 py-3 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow transition hover:bg-amber-300 text-center"
                >
                  Sign In &amp; Save Order ➔
                </Link>
              </div>
            )}

            {/* ORDER ITEMS SUMMARY */}
            <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <h3 className="display text-base text-ink font-bold">Items in Your Order</h3>
                <span className="font-mono text-xs font-bold text-steel">
                  {order.lines.reduce((n, l) => n + l.qty, 0)} items
                </span>
              </div>

              <div className="divide-y divide-ink/6">
                {order.lines.map((line, idx) => (
                  <div key={idx} className="py-3 flex items-start justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-ink">
                        {line.qty}x {line.name}
                      </p>
                      {line.meal && (
                        <p className="text-[11px] text-amber-700 font-semibold">
                          Meal Deal (+{line.mealDrink || 'Drink'}, +{line.mealSnack || 'Crisps'})
                        </p>
                      )}
                      {line.extras.length > 0 && (
                        <p className="text-[11px] text-steel">+ {line.extras.join(', ')}</p>
                      )}
                      {line.sauces.length > 0 && (
                        <p className="text-[11px] text-steel italic">Sauces: {line.sauces.join(', ')}</p>
                      )}
                    </div>
                    <span className="font-mono font-bold text-ink shrink-0">
                      {gbp(lineUnitPrice(line) * line.qty)}
                    </span>
                  </div>
                ))}
              </div>

              {/* PAYMENT BREAKDOWN */}
              <div className="border-t border-ink/10 pt-3 space-y-1.5 font-body text-xs text-steel">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono text-ink">{gbp(order.payment.subtotal)}</span>
                </div>
                {order.fulfilment === 'delivery' && (
                  <div className="flex justify-between">
                    <span>Delivery Fee</span>
                    <span className="font-mono text-ink">
                      {order.payment.deliveryFee === 0 ? 'FREE' : gbp(order.payment.deliveryFee)}
                    </span>
                  </div>
                )}
                {order.payment.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Voucher Discount</span>
                    <span className="font-mono">-{gbp(order.payment.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-ink border-t border-ink/10 pt-2">
                  <div>
                    <span>{order.payment.status === 'paid' ? 'Total Paid' : 'Total Due'}</span>
                    <span className="block text-[10px] text-slate-500 font-normal">
                      {order.payment.status === 'paid'
                        ? 'Payment completed'
                        : isDelivery
                        ? 'Pay to courier via card device or cash'
                        : 'Pay at counter upon pickup'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-base text-amber-600">{gbp(order.payment.total)}</span>
                    <span className={cx(
                      "block text-[10px] font-bold uppercase",
                      order.payment.status === 'paid' ? 'text-emerald-600' : 'text-amber-700'
                    )}>
                      {order.payment.status === 'paid' ? '✓ Paid' : 'Pending Payment'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CANCEL BUTTON */}
              {canCancel && !isCancelled && (
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(true)}
                  className="w-full rounded-2xl border border-red-200 bg-red-50 py-2.5 font-body text-xs font-bold text-red-600 hover:bg-red-100 transition"
                >
                  Cancel Order
                </button>
              )}
            </div>

            {/* SHOP SUPPORT CARD */}
            <div className="rounded-3xl border border-ink/10 bg-paper p-6 shadow-md text-xs space-y-2">
              <h4 className="font-bold text-ink uppercase tracking-wider text-[11px]">
                Need help with your order?
              </h4>
              <p className="text-steel">
                Call the Just Spuds Market Square kitchen directly for live updates or special instructions:
              </p>
              <p className="font-mono font-bold text-ink text-sm">
                📞 01296 423456
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CANCELLATION MODAL */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl text-ink space-y-4">
            <h3 className="display text-xl">Cancel Your Order?</h3>
            <p className="text-xs text-steel">
              Because your order is still being prepared, you are eligible for an instant 100% refund of <strong>{gbp(order.payment.total)}</strong>.
            </p>

            <div className="space-y-2">
              {CANCEL_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="cancelReason"
                    checked={selectedReason === r}
                    onChange={() => setSelectedReason(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="rounded-xl border border-ink/20 px-4 py-2 text-xs font-bold"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={cancelBusy}
                onClick={handleExecuteCancel}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                {cancelBusy ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT MODAL */}
      {isReceiptModalOpen && (
        <ThermalReceipt order={order} onClose={() => setReceiptModalOpen(false)} isModal={true} />
      )}
    </div>
  )
}
