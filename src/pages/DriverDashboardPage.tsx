import { useState, useEffect, useMemo, useRef } from 'react'
import {
  subscribeOrders,
  claimDeliveryOrder,
  driverArrivedAtStore,
  driverCollectedOrder,
  completeDriverDeliveryWithPin,
  cancelDriverDelivery,
  failDriverDelivery,
  type Order,
} from '../services/orderStore'
import {
  setDriverOnlineStatus,
  subscribeDrivers,
  type DriverProfile,
} from '../services/driverStore'
import { getCurrentUser, loginWithPin, logout, hasRole, type AuthUser } from '../services/authStore'
import {
  registerServiceWorker,
  getNotificationPermission,
  requestNotificationPermission,
  triggerDeliverySystemAlert,
  requestScreenWakeLock,
  releaseScreenWakeLock,
} from '../services/notificationService'
import { SITE } from '../data/site'
import { cx, gbp } from '../utils/format'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function DriverDashboardPage() {
  useDocumentMeta({
    title: 'Courier Hub | Just Spuds Aylesbury',
    description: 'Dedicated mobile delivery terminal for Just Spuds couriers',
  })

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getCurrentUser())
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [drivers, setDrivers] = useState<DriverProfile[]>([])
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'profile'>('live')
  const [historyFilter, setHistoryFilter] = useState<'today' | 'week' | 'month'>('today')
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => getNotificationPermission())

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [showFailModal, setShowFailModal] = useState(false)
  const [failReason, setFailReason] = useState('')
  const [failNote, setFailNote] = useState('')
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [enteredPin, setEnteredPin] = useState('')
  const [pinVerifyError, setPinVerifyError] = useState('')
  const [claimToast, setClaimToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const prevRequestsCountRef = useRef(0)

  // Subscriptions and Service Worker Registration
  useEffect(() => {
    registerServiceWorker()
    const unsubOrders = subscribeOrders((all) => setOrders(all))
    const unsubDrivers = subscribeDrivers((all) => setDrivers(all))
    return () => {
      unsubOrders()
      unsubDrivers()
      releaseScreenWakeLock()
    }
  }, [])

  // Auto-dismiss claim toast
  useEffect(() => {
    if (!claimToast) return
    const timer = setTimeout(() => setClaimToast(null), 4000)
    return () => clearTimeout(timer)
  }, [claimToast])

  // Current Driver Profile
  const currentDriver: DriverProfile | undefined = useMemo(() => {
    if (!currentUser) return undefined
    return drivers.find((d) => d.id === currentUser.id) || drivers[0]
  }, [currentUser, drivers])

  const [selectedDeliveryIndex, setSelectedDeliveryIndex] = useState(0)
  const [showBuiltInMap, setShowBuiltInMap] = useState<boolean>(true)

  // Active deliveries assigned to this driver (Supports multi-order batching)
  const activeDeliveries: Order[] = useMemo(() => {
    if (!currentDriver) return []
    return orders.filter(
      (o) =>
        o.fulfilment === 'delivery' &&
        o.deliveryDetails?.assignedDriverId === currentDriver.id &&
        ['driver_assigned', 'driver_arrived_at_store', 'order_collected', 'out_for_delivery'].includes(o.status)
    )
  }, [orders, currentDriver])

  // Selected active delivery for detail card & navigation
  const activeDelivery: Order | undefined = useMemo(() => {
    if (activeDeliveries.length === 0) return undefined
    return activeDeliveries[selectedDeliveryIndex] || activeDeliveries[0]
  }, [activeDeliveries, selectedDeliveryIndex])

  // Available new delivery requests for online drivers (Allows couriers to batch up to 5 deliveries)
  const availableRequests: Order[] = useMemo(() => {
    if (!currentDriver || !currentDriver.isOnline) return []
    if (activeDeliveries.length >= 5) return []
    return orders.filter((o) => {
      if (o.fulfilment !== 'delivery') return false
      // Only dispatched orders are claimable.
      if (o.status !== 'ready_for_delivery') return false
      // Do not show if already assigned
      if (o.deliveryDetails?.assignedDriverId) return false
      // Do not show if this driver previously cancelled/dropped it
      if (o.deliveryDetails?.rejectedDriverIds?.includes(currentDriver.id)) return false
      return true
    })
  }, [orders, currentDriver, activeDeliveries])

  // Completed deliveries for this driver
  const completedDeliveries: Order[] = useMemo(() => {
    if (!currentDriver) return []
    return orders.filter(
      (o) =>
        o.fulfilment === 'delivery' &&
        o.deliveryDetails?.assignedDriverId === currentDriver.id &&
        o.status === 'delivered'
    )
  }, [orders, currentDriver])

  // Filtered History
  const filteredHistory = useMemo(() => {
    const now = new Date()
    return completedDeliveries.filter((o) => {
      const ordDate = new Date(o.createdAt)
      if (historyFilter === 'today') {
        return ordDate.toDateString() === now.toDateString()
      }
      if (historyFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return ordDate >= weekAgo
      }
      return true
    })
  }, [completedDeliveries, historyFilter])

  // Handle PIN Login
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPinError('')
    const res = loginWithPin(pinInput)
    if (res.ok && res.user) {
      if (res.user.role !== 'DRIVER' && res.user.role !== 'SUPER_ADMIN') {
        setPinError('This terminal is reserved for Courier / Driver accounts. Use PIN 7777 for Liam Walker.')
        return
      }
      setCurrentUser(res.user)
      setPinInput('')
    } else {
      setPinError(res.message)
    }
  }

  // Trigger system notification & vibration when new deliveries land while online
  useEffect(() => {
    if (!currentDriver?.isOnline) return
    if (availableRequests.length > prevRequestsCountRef.current && availableRequests.length > 0) {
      const latest = availableRequests[0]
      triggerDeliverySystemAlert({
        shortId: latest.shortId,
        customer: { postcode: latest.customer.postcode },
        linesCount: latest.lines.length,
      })
    }
    prevRequestsCountRef.current = availableRequests.length
  }, [availableRequests, currentDriver?.isOnline])

  const handleRequestPushPermission = async () => {
    const ok = await requestNotificationPermission()
    setNotifPermission(ok ? 'granted' : 'denied')
  }

  // Handle Toggle Online / Offline
  const toggleOnline = async () => {
    if (!currentDriver) return
    const next = !currentDriver.isOnline
    setDriverOnlineStatus(currentDriver.id, next)
    if (next) {
      requestScreenWakeLock()
      if (notifPermission !== 'granted') {
        const ok = await requestNotificationPermission()
        setNotifPermission(ok ? 'granted' : 'denied')
      }
    } else {
      releaseScreenWakeLock()
    }
  }

  // Handle Claiming Delivery
  const handleClaim = (orderId: string) => {
    if (!currentDriver) return
    const res = claimDeliveryOrder(orderId, {
      id: currentDriver.id,
      name: currentDriver.name,
      phone: currentDriver.phone,
      vehicle: currentDriver.vehicleType,
      plate: currentDriver.vehicleReg,
      avatar: currentDriver.avatar,
      rating: currentDriver.rating,
      deliveriesCount: currentDriver.deliveriesCompletedCount,
    })

    if (res.ok) {
      setClaimToast({ type: 'success', message: `Delivery claimed! Navigate to Just Spuds to collect.` })
    } else {
      setClaimToast({ type: 'error', message: res.message })
    }
  }

  // Handle Status Progressions
  const handleArriveAtStore = (orderId: string) => {
    if (!currentDriver) return
    driverArrivedAtStore(orderId, currentDriver.id)
  }

  const handleCollectOrder = (orderId: string) => {
    if (!currentDriver) return
    driverCollectedOrder(orderId, currentDriver.id)
  }

  const handleCollectAllBatchedOrders = () => {
    if (!currentDriver || activeDeliveries.length === 0) return
    activeDeliveries.forEach((ord) => {
      if (ord.status === 'driver_assigned') {
        driverArrivedAtStore(ord.id, currentDriver.id)
      }
      driverCollectedOrder(ord.id, currentDriver.id)
    })
    setClaimToast({ type: 'success', message: `All ${activeDeliveries.length} batched orders collected from Market Square kitchen!` })
  }

  const handleVerifyPinAndComplete = () => {
    if (!activeDelivery || !currentDriver) return
    setPinVerifyError('')
    const res = completeDriverDeliveryWithPin(activeDelivery.id, currentDriver.id, enteredPin)
    if (res.ok) {
      setPinModalOpen(false)
      setEnteredPin('')
      const feePence = activeDelivery.payment.deliveryFee || 400
      setClaimToast({ type: 'success', message: `Delivery completed! £${(feePence / 100).toFixed(2)} credited to your earnings.` })
    } else {
      setPinVerifyError(res.message)
    }
  }

  const handleManagerBypassComplete = () => {
    if (!activeDelivery || !currentDriver) return
    completeDriverDeliveryWithPin(activeDelivery.id, currentDriver.id, '', true)
    setPinModalOpen(false)
    setEnteredPin('')
    setClaimToast({ type: 'success', message: 'Delivery completed (Manual Bypass).' })
  }

  const handleCancelDeliverySubmit = () => {
    if (!activeDelivery || !currentDriver || !cancelReason) return
    cancelDriverDelivery(activeDelivery.id, currentDriver.id, cancelReason, cancelNote)
    setShowCancelModal(false)
    setCancelReason('')
    setCancelNote('')
    setClaimToast({ type: 'error', message: 'Delivery dropped and re-queued for other couriers.' })
  }

  const handleFailDeliverySubmit = () => {
    if (!activeDelivery || !currentDriver || !failReason) return
    failDriverDelivery(activeDelivery.id, currentDriver.id, failReason, failNote)
    setShowFailModal(false)
    setFailReason('')
    setFailNote('')
    setClaimToast({ type: 'error', message: 'Failed delivery reported to kitchen staff.' })
  }

  // -------------------------------------------------------------
  // PIN LOGIN GATE IF NOT AUTHENTICATED
  // -------------------------------------------------------------
  // Use the shared hasRole gate rather than a hand-rolled role comparison. The
  // hand-rolled version skipped hasRole's `status !== 'ACTIVE'` rejection, so a
  // courier suspended by admin kept full terminal access and could still claim
  // deliveries — making the suspend button in the admin console useless.
  if (!hasRole(currentUser, ['DRIVER'])) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 text-3xl text-amber-400 border border-amber-500/30">
              🛵
            </div>
            <h1 className="display text-2xl text-white font-bold">Just Spuds Courier Hub</h1>
            <p className="font-body text-xs text-slate-400">
              Enter your Driver PIN to access the dispatch terminal
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                4-Digit Driver PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                placeholder="• • • •"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3.5 text-center text-2xl font-mono tracking-widest text-amber-400 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-400/20"
              />
            </div>

            {pinError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 text-center font-body">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-amber-500 py-3.5 font-body text-sm font-bold text-slate-950 uppercase tracking-wider hover:bg-amber-400 transition shadow-lg active:scale-95"
            >
              Sign In as Courier &rarr;
            </button>
          </form>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------
  // MAIN MOBILE-FIRST DRIVER DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-lg mx-auto pb-20 border-x border-slate-800 shadow-2xl">
      {/* TOAST ALERT */}
      {claimToast && (
        <div
          className={cx(
            'fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-2xl px-5 py-3 text-xs font-bold shadow-2xl border backdrop-blur-md flex items-center gap-2 max-w-sm animate-bounce',
            claimToast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
              : 'bg-red-950/90 border-red-500 text-red-200'
          )}
        >
          <span>{claimToast.type === 'success' ? '✓' : '✕'}</span>
          <span>{claimToast.message}</span>
        </div>
      )}

      {/* TOP STATUS BAR & DRIVER PROFILE */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={currentDriver?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
              alt={currentDriver?.name}
              className="h-11 w-11 rounded-2xl border-2 border-amber-400 object-cover"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-body text-sm font-bold text-white">{currentDriver?.name}</h1>
                <span className="rounded bg-amber-400/20 px-1.5 py-0.2 font-mono text-[10px] text-amber-300 font-bold">
                  ★ {currentDriver?.rating || 4.9}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {currentDriver?.vehicleType} &bull; <span className="font-mono text-slate-300">{currentDriver?.vehicleReg}</span>
              </p>
            </div>
          </div>

          {/* ONLINE / OFFLINE TOGGLE */}
          <button
            type="button"
            onClick={toggleOnline}
            className={cx(
              'flex items-center gap-2 rounded-full px-3.5 py-2 font-body text-xs font-bold uppercase tracking-wider transition shadow-md active:scale-95',
              currentDriver?.isOnline
                ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 animate-pulse'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            )}
          >
            <span className={cx('h-2 w-2 rounded-full', currentDriver?.isOnline ? 'bg-slate-950' : 'bg-slate-500')} />
            {currentDriver?.isOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>

        {/* METRICS ROW */}
        <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-center font-body text-xs">
          <div className="rounded-xl bg-slate-800/50 p-2 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-bold block">Today&apos;s Deliveries</span>
            <span className="display text-base text-amber-400 font-bold">
              {completedDeliveries.length} Drop{completedDeliveries.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="rounded-xl bg-slate-800/50 p-2 border border-slate-800">
            <span className="text-[10px] uppercase text-slate-400 font-bold block">Today&apos;s Earnings</span>
            <span className="display text-base text-emerald-400 font-bold">
              {/* Real persisted figure. This used to add `completedDeliveries.length * 450`
                  on top, inventing earnings the fleet view didn't agree with. */}
              {gbp(currentDriver?.todayEarningsPence || 0)}
            </span>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-slate-800 bg-slate-900/50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('live')}
          className={cx(
            'flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition',
            activeTab === 'live' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          )}
        >
          🛵 Live Delivery {activeDelivery ? '(1 Active)' : availableRequests.length > 0 ? `(${availableRequests.length} New)` : ''}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cx(
            'flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition',
            activeTab === 'history' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          )}
        >
          📜 History ({completedDeliveries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={cx(
            'flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition',
            activeTab === 'profile' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          )}
        >
          👤 Account
        </button>
      </div>

      {/* CONTENT AREA */}
      <main className="flex-1 p-4 space-y-4">
        {/* PUSH NOTIFICATIONS PROMPT BANNER */}
        {notifPermission !== 'granted' && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3 text-xs font-body text-amber-200">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🔔</span>
              <div>
                <p className="font-bold text-white">Enable Dispatch Push Alerts</p>
                <p className="text-[11px] text-amber-300/80">Get audio chimes &amp; lock-screen alerts when spuds are ready for pickup.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRequestPushPermission}
              className="rounded-xl bg-amber-400 px-3.5 py-1.5 text-[11px] font-black uppercase text-slate-950 hover:bg-amber-300 shrink-0 shadow-md"
            >
              Enable
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: LIVE DELIVERY & REQUESTS */}
        {/* ========================================================= */}
        {activeTab === 'live' && (
          <div className="space-y-4">
            {/* OFFLINE NOTICE */}
            {!currentDriver?.isOnline && !activeDelivery && (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-center space-y-3">
                <span className="text-3xl">💤</span>
                <h3 className="display text-lg text-white font-bold">You are currently Offline</h3>
                <p className="font-body text-xs text-slate-400 max-w-xs mx-auto">
                  Switch your availability to <strong className="text-emerald-400">ONLINE</strong> at the top to receive incoming Just Spuds delivery requests.
                </p>
                <button
                  type="button"
                  onClick={toggleOnline}
                  className="rounded-full bg-emerald-500 px-6 py-2.5 font-body text-xs font-bold uppercase text-slate-950 shadow-lg hover:bg-emerald-400"
                >
                  Go Online Now &rarr;
                </button>
              </div>
            )}

            {/* 1. BATCHED DELIVERIES SWITCHER & ACTIVE CARDS */}
            {activeDeliveries.length > 0 && (
              <div className="space-y-4">
                {/* Batched Deliveries Header & Quick Actions */}
                <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-slate-900 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-body text-xs text-amber-300">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="text-base">📦</span>
                      <span>BATCHED DELIVERIES ACTIVE ({activeDeliveries.length})</span>
                    </div>
                    {activeDeliveries.some((o) => o.status === 'driver_assigned' || o.status === 'driver_arrived_at_store') && (
                      <button
                        type="button"
                        onClick={handleCollectAllBatchedOrders}
                        className="rounded-xl bg-emerald-500 px-3 py-1 font-body text-[10px] font-black uppercase text-slate-950 hover:bg-emerald-400 shadow transition flex items-center gap-1"
                      >
                        <span>🛍️ Collect All Batched Orders</span>
                      </button>
                    )}
                  </div>

                  {/* Delivery Selector Tabs (If 2+ active deliveries claimed) */}
                  {activeDeliveries.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 font-body text-xs">
                      {activeDeliveries.map((ord, i) => (
                        <button
                          key={ord.id}
                          type="button"
                          onClick={() => setSelectedDeliveryIndex(i)}
                          className={cx(
                            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0',
                            i === (selectedDeliveryIndex < activeDeliveries.length ? selectedDeliveryIndex : 0)
                              ? 'bg-amber-400 text-slate-950 shadow font-black scale-[1.02]'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                          )}
                        >
                          <span>#{ord.shortId}</span>
                          <span className="text-[10px] opacity-80 uppercase">({ord.customer.postcode || 'HP20'})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* SELECTED ACTIVE DELIVERY CARD */}
                {activeDelivery && (
                  <div className="rounded-3xl border-2 border-amber-500/80 bg-slate-900 p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="rounded-full bg-amber-500/20 px-3 py-1 font-mono text-xs font-bold text-amber-400 border border-amber-500/30">
                        Order #{activeDelivery.shortId}
                      </span>
                      <span className="font-body text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                        {activeDelivery.status === 'driver_assigned'
                          ? 'Heading to Store'
                          : activeDelivery.status === 'driver_arrived_at_store'
                          ? 'At Market Square Store'
                          : activeDelivery.status === 'out_for_delivery'
                          ? 'En Route to Customer'
                          : 'Active Task'}
                      </span>
                    </div>

                    {/* STEPPER PROGRESS */}
                    <div className="grid grid-cols-3 gap-1.5 text-center font-body text-[10px] font-bold">
                      <div
                        className={cx(
                          'rounded-xl p-2 border transition',
                          activeDelivery.status === 'driver_assigned'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                            : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                        )}
                      >
                        1. Go to Store
                      </div>
                      <div
                        className={cx(
                          'rounded-xl p-2 border transition',
                          activeDelivery.status === 'driver_arrived_at_store'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                            : activeDelivery.status === 'out_for_delivery'
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800/50 text-slate-500 border-slate-800'
                        )}
                      >
                        2. Collect Spuds
                      </div>
                      <div
                        className={cx(
                          'rounded-xl p-2 border transition',
                          activeDelivery.status === 'out_for_delivery'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                            : 'bg-slate-800/50 text-slate-500 border-slate-800'
                        )}
                      >
                        3. Deliver with PIN
                      </div>
                    </div>

                    {/* PICKUP STORE DETAILS */}
                    {activeDelivery.status === 'driver_assigned' && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5 font-body">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Pickup Location:</span>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${SITE.address.line1}, ${SITE.address.line2}, ${SITE.address.town} ${SITE.address.postcode}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-[11px] font-bold text-amber-400 hover:bg-slate-700"
                          >
                            📍 Open Maps Navigation
                          </a>
                        </div>
                        <p className="text-sm font-bold text-white">Just Spuds Market Square</p>
                        <p className="text-xs text-slate-400">{SITE.address.line1}, {SITE.address.line2}, {SITE.address.town} {SITE.address.postcode}</p>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleArriveAtStore(activeDelivery.id)}
                            className="w-full rounded-2xl bg-amber-500 py-3 text-xs font-bold text-slate-950 uppercase tracking-wider hover:bg-amber-400 transition shadow-lg"
                          >
                            ✓ I Have Arrived at Store &rarr;
                          </button>
                        </div>
                      </div>
                    )}

                    {/* STORE COLLECTION CARD */}
                    {activeDelivery.status === 'driver_arrived_at_store' && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 font-body">
                        <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Collection Checklist:</span>
                        <div className="space-y-1.5">
                          {activeDelivery.lines.map((line) => (
                            <div key={line.lineId} className="flex justify-between text-xs border-b border-slate-800/60 pb-1">
                              <span className="text-white font-medium">{line.qty}x {line.name}</span>
                              <span className="text-slate-400 font-mono">{gbp(line.base * line.qty)}</span>
                            </div>
                          ))}
                        </div>
                        {activeDelivery.kitchenNotes && (
                          <p className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-300">
                            <strong>Kitchen Note:</strong> &ldquo;{activeDelivery.kitchenNotes}&rdquo;
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCollectOrder(activeDelivery.id)}
                          className="w-full rounded-2xl bg-emerald-500 py-3.5 text-xs font-bold text-slate-950 uppercase tracking-wider hover:bg-emerald-400 transition shadow-lg"
                        >
                          📦 Order Collected & Packed in Bag &rarr;
                        </button>
                      </div>
                    )}

                    {/* CUSTOMER DELIVERY DESTINATION WITH BUILT-IN MAP & GPS DIRECTIONS */}
                    {activeDelivery.status === 'out_for_delivery' && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4 font-body">
                        
                        {/* Header & Map App Switcher */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-base animate-pulse">🛵</span>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">Customer Destination</span>
                              <h4 className="text-sm font-bold text-white">{activeDelivery.customer.name}</h4>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => setShowBuiltInMap((prev) => !prev)}
                            className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-black uppercase text-slate-950 hover:bg-amber-300 shadow transition self-start sm:self-auto"
                          >
                            {showBuiltInMap ? '🗺️ Hide Built-In Map' : '🗺️ Show Built-In Map'}
                          </button>
                        </div>

                        {/* Customer Address & Delivery Note */}
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-300">
                            📍 {activeDelivery.customer.streetAddress || 'Market Square'}, {activeDelivery.customer.postcode || 'HP20 1EY'}
                          </p>
                          {activeDelivery.customer.instructions && (
                            <p className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-300">
                              🏠 <strong>Doorstep Note:</strong> &ldquo;{activeDelivery.customer.instructions}&rdquo;
                            </p>
                          )}
                        </div>

                        {/* PAYMENT COLLECTION NOTICE FOR DRIVER */}
                        <div className="rounded-2xl border-2 border-amber-400 bg-amber-500/15 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">📟</span>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">Payment to Collect at Door</span>
                                <p className="text-lg font-black text-white">{gbp(activeDelivery.payment.total)}</p>
                              </div>
                            </div>
                            <span className="rounded-full bg-amber-400 px-3 py-1 font-mono text-xs font-black uppercase text-slate-950">
                              {activeDelivery.payment.method === 'cash' ? '💵 Collect Cash' : '💳 Use Card Device'}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-200/90 leading-snug">
                            {activeDelivery.payment.method === 'cash'
                              ? `Customer selected Cash. Collect £${(activeDelivery.payment.total / 100).toFixed(2)} before handing over food.`
                              : `Customer will pay via your mobile card machine (${gbp(activeDelivery.payment.total)}). Take contactless/chip payment before completing.`}
                          </p>
                        </div>

                        {/* 1. BUILT-IN INTERACTIVE SATELLITE / VECTOR MAP */}
                        {showBuiltInMap && (
                          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl space-y-0">
                            <div className="bg-slate-950 p-2.5 flex items-center justify-between text-[11px] font-mono border-b border-slate-800">
                              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                                ● Live In-App GPS Tracking
                              </span>
                              <span className="text-slate-400">Est. 1.2 mi &bull; ~4 mins</span>
                            </div>

                            {/* Live Interactive Map Iframe */}
                            <div className="relative aspect-video w-full bg-slate-950">
                              <iframe
                                title="Courier Live Route Map"
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                scrolling="no"
                                src={`https://maps.google.com/maps?q=${encodeURIComponent(
                                  `${activeDelivery.customer.streetAddress || 'Market Square'}, ${activeDelivery.customer.postcode || 'HP20'}, Aylesbury, UK`
                                )}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                className="w-full h-full filter contrast-125 saturate-150"
                              />
                            </div>
                          </div>
                        )}

                        {/* 2. TURN-BY-TURN STEP-BY-STEP GPS DIRECTIONS */}
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                            <span>🧭 Turn-By-Turn Navigation Steps</span>
                            <span className="font-mono text-slate-400">1.2 mi total</span>
                          </div>

                          <div className="space-y-2 text-xs font-body">
                            <div className="flex items-start gap-2.5 text-slate-300">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-400/20 text-amber-400 font-mono font-bold text-[10px]">
                                1
                              </span>
                              <div>
                                <p className="font-bold text-white">Start at Just Spuds Market Square</p>
                                <p className="text-[11px] text-slate-400">Head South-East towards Cambridge Street / A41</p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2.5 text-slate-300">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-amber-400/20 text-amber-400 font-mono font-bold text-[10px]">
                                2
                              </span>
                              <div>
                                <p className="font-bold text-white">Turn onto High Street / A41 (0.4 mi)</p>
                                <p className="text-[11px] text-slate-400">Continue straight towards customer postcode sector {activeDelivery.customer.postcode || 'HP20'}</p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2.5 text-slate-300">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[10px]">
                                3
                              </span>
                              <div>
                                <p className="font-bold text-white">Turn onto {activeDelivery.customer.streetAddress || 'Customer Street'} (0.2 mi)</p>
                                <p className="text-[11px] text-slate-400">Destination will be on your left / right doorstep</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3. EXTERNAL MAP APP LAUNCHER BUTTONS */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Launch External Navigation App:
                          </span>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                `${activeDelivery.customer.streetAddress || 'Market Square'}, ${activeDelivery.customer.postcode || 'HP20'}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl bg-slate-800 border border-slate-700 py-2 text-center font-bold text-slate-200 hover:bg-slate-700 transition"
                            >
                              🌐 Google Maps
                            </a>

                            <a
                              href={`https://maps.apple.com/?daddr=${encodeURIComponent(
                                `${activeDelivery.customer.streetAddress || 'Market Square'}, ${activeDelivery.customer.postcode || 'HP20'}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl bg-slate-800 border border-slate-700 py-2 text-center font-bold text-slate-200 hover:bg-slate-700 transition"
                            >
                              🍏 Apple Maps
                            </a>

                            <a
                              href={`https://waze.com/ul?q=${encodeURIComponent(
                                `${activeDelivery.customer.streetAddress || 'Market Square'}, ${activeDelivery.customer.postcode || 'HP20'}`
                              )}&navigate=yes`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl bg-slate-800 border border-slate-700 py-2 text-center font-bold text-slate-200 hover:bg-slate-700 transition"
                            >
                              🧭 Waze
                            </a>
                          </div>
                        </div>

                        {/* CALL CUSTOMER & STORE */}
                        <div className="flex items-center gap-2 pt-1">
                          <a
                            href={`tel:${activeDelivery.customer.phone}`}
                            className="flex-1 rounded-xl bg-slate-800 border border-slate-700 py-2.5 text-center text-xs font-bold text-slate-200 hover:bg-slate-700"
                          >
                            📞 Call Customer ({activeDelivery.customer.phone || '07700 900123'})
                          </a>
                          <a
                            href={`tel:${SITE.phone}`}
                            className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-center text-xs font-bold text-slate-400 hover:bg-slate-700"
                          >
                            🏪 Call Store
                          </a>
                        </div>

                        {/* PIN VERIFICATION BUTTON */}
                        <button
                          type="button"
                          onClick={() => {
                            setPinVerifyError('')
                            setEnteredPin('')
                            setPinModalOpen(true)
                          }}
                          className="w-full rounded-2xl bg-emerald-500 py-3.5 text-xs font-bold text-slate-950 uppercase tracking-wider hover:bg-emerald-400 transition shadow-lg"
                        >
                          🎉 Arrived at Doorstep (Enter Delivery PIN) &rarr;
                        </button>
                      </div>
                    )}

                    {/* DROP / ISSUE ACTIONS */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-body text-xs">
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(true)}
                        className="text-red-400 hover:text-red-300 underline font-semibold text-[11px]"
                      >
                        Cancel / Drop Task
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFailModal(true)}
                        className="text-slate-400 hover:text-slate-300 text-[11px]"
                      >
                        Report Delivery Issue ⚠️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. AVAILABLE DELIVERY REQUESTS (WHEN ONLINE) */}
            {currentDriver?.isOnline && activeDeliveries.length < 5 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-body text-xs font-bold uppercase tracking-wider text-slate-400">
                    Available Orders to Pickup ({availableRequests.length})
                  </h2>
                  <span className="text-[11px] text-emerald-400 font-mono animate-pulse">● Live Dispatch Bus</span>
                </div>

                {availableRequests.length === 0 ? (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-3">
                    <span className="text-3xl animate-bounce">🛵</span>
                    <h3 className="display text-base text-white font-bold">Waiting for New Deliveries</h3>
                    <p className="font-body text-xs text-slate-400 max-w-xs mx-auto">
                      As soon as the kitchen team accepts an order for delivery, it will appear here instantly.
                    </p>
                  </div>
                ) : (
                  availableRequests.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-3xl border border-amber-500/50 bg-slate-900 p-5 shadow-xl space-y-3 hover:border-amber-400 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-400 border border-amber-500/30">
                          Order #{req.shortId}
                        </span>
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-body text-[11px] font-bold text-emerald-300">
                          £4.50 Payout + Tips
                        </span>
                      </div>

                      <div className="space-y-1 font-body text-xs">
                        <div className="flex items-center gap-1.5 text-white font-bold">
                          <span>📍 Delivery Area:</span>
                          <span className="text-amber-300">{req.customer.postcode || 'Aylesbury HP20'}</span>
                        </div>
                        <p className="text-slate-400 text-[11px]">
                          Pickup: Just Spuds Market Square &bull; {req.lines.reduce((s, l) => s + l.qty, 0)} Items &bull; {req.estimatedDeliveryTime}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleClaim(req.id)}
                        className="w-full rounded-2xl bg-amber-500 py-3 text-xs font-bold text-slate-950 uppercase tracking-wider hover:bg-amber-400 transition shadow-lg active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>ACCEPT DELIVERY</span>
                        <span className="font-mono text-slate-950 font-black">&rarr;</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: DELIVERY HISTORY */}
        {/* ========================================================= */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex rounded-2xl bg-slate-900 p-1 border border-slate-800 font-body text-xs">
              <button
                type="button"
                onClick={() => setHistoryFilter('today')}
                className={cx(
                  'flex-1 rounded-xl py-2 font-bold transition',
                  historyFilter === 'today' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('week')}
                className={cx(
                  'flex-1 rounded-xl py-2 font-bold transition',
                  historyFilter === 'week' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                )}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('month')}
                className={cx(
                  'flex-1 rounded-xl py-2 font-bold transition',
                  historyFilter === 'month' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                )}
              >
                All Time
              </button>
            </div>

            <div className="space-y-2.5">
              {filteredHistory.length === 0 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-400 font-body">
                  No completed deliveries recorded in this period.
                </div>
              ) : (
                filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 flex items-center justify-between font-body text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">#{item.shortId}</span>
                        <span className="text-slate-300 font-medium">{item.customer.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {new Date(item.createdAt).toLocaleDateString()} at{' '}
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull;{' '}
                        {item.customer.postcode || 'HP20'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-400 block">+£4.50</span>
                      <span className="text-[10px] text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Delivered ✓
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: PROFILE & ACCOUNT */}
        {/* ========================================================= */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4 text-center">
              <img
                src={currentDriver?.avatar}
                alt={currentDriver?.name}
                className="h-20 w-20 rounded-3xl border-4 border-amber-400 mx-auto object-cover"
              />
              <div>
                <h3 className="display text-lg text-white font-bold">{currentDriver?.name}</h3>
                <p className="font-body text-xs text-slate-400">{currentDriver?.email}</p>
                <p className="font-body text-xs text-slate-400">{currentDriver?.phone}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-left pt-2 border-t border-slate-800 font-body text-xs">
                <div className="rounded-2xl bg-slate-950/60 p-3 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block">Vehicle Type</span>
                  <span className="text-white font-bold">{currentDriver?.vehicleType}</span>
                </div>
                <div className="rounded-2xl bg-slate-950/60 p-3 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block">Registration</span>
                  <span className="font-mono text-amber-400 font-bold">{currentDriver?.vehicleReg}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  logout()
                  setCurrentUser(null)
                }}
                className="w-full rounded-2xl bg-slate-800 border border-slate-700 py-3 text-xs font-bold text-red-400 uppercase tracking-wider hover:bg-slate-700 transition"
              >
                🔒 Lock Terminal & Sign Out
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* DELIVERY PIN (OTP) VERIFICATION MODAL */}
      {/* ========================================================= */}
      {pinModalOpen && activeDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 font-body">
            <div className="text-center space-y-1">
              <span className="text-3xl">🔐</span>
              <h3 className="display text-lg text-white font-bold">Enter Delivery PIN</h3>
              <p className="text-xs text-slate-400">
                Ask <strong>{activeDelivery.customer.name}</strong> for the 4-digit PIN shown on their live tracking screen.
              </p>
            </div>

            {/* PAYMENT DUE NOTICE */}
            <div className="rounded-2xl border border-amber-400/50 bg-amber-500/15 p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">📟</span>
                <div>
                  <span className="font-bold text-amber-300 block text-[10px] uppercase">Collect Payment</span>
                  <span className="font-mono font-black text-sm text-white">{gbp(activeDelivery.payment.total)}</span>
                </div>
              </div>
              <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-950 uppercase">
                {activeDelivery.payment.method === 'cash' ? '💵 Cash' : '💳 Card Device'}
              </span>
            </div>

            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                placeholder="• • • •"
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-2xl font-mono tracking-widest text-emerald-400 placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {pinVerifyError && (
              <p className="rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-400 text-center">
                {pinVerifyError}
              </p>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleVerifyPinAndComplete}
                className="w-full rounded-2xl bg-emerald-500 py-3.5 text-xs font-bold text-slate-950 uppercase tracking-wider hover:bg-emerald-400 transition shadow-lg"
              >
                Verify PIN & Complete Delivery ✓
              </button>

              <button
                type="button"
                onClick={handleManagerBypassComplete}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 py-2.5 text-[11px] font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Manager Bypass (Customer cannot find phone)
              </button>

              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="w-full py-2 text-[11px] text-slate-400 hover:text-white"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CANCEL / DROP DELIVERY MODAL */}
      {/* ========================================================= */}
      {showCancelModal && activeDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 bg-slate-900 p-6 shadow-2xl space-y-4 font-body">
            <div className="text-center space-y-1">
              <span className="text-3xl">⚠️</span>
              <h3 className="display text-lg text-white font-bold">Cancel Delivery Task</h3>
              <p className="text-xs text-slate-400">
                This order will be re-queued immediately for another available courier.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] uppercase font-bold text-slate-400">Select Reason:</label>
              {[
                '🛵 Vehicle breakdown / Flat tyre',
                '🚨 Personal Emergency',
                '🏪 Long wait at store / Food delay',
                '⛈️ Severe weather / Blocked road',
                '❓ Other reason',
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setCancelReason(reason)}
                  className={cx(
                    'w-full rounded-xl p-2.5 text-left text-xs font-semibold border transition',
                    cancelReason === reason
                      ? 'border-amber-400 bg-amber-500/20 text-white'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  )}
                >
                  {reason}
                </button>
              ))}

              <textarea
                placeholder="Optional explanation note..."
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={!cancelReason}
                onClick={handleCancelDeliverySubmit}
                className="flex-1 rounded-xl bg-red-600 py-3 text-xs font-bold text-white disabled:opacity-50 hover:bg-red-500"
              >
                Confirm Drop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REPORT FAILED DELIVERY MODAL */}
      {/* ========================================================= */}
      {showFailModal && activeDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-red-500/40 bg-slate-900 p-6 shadow-2xl space-y-4 font-body">
            <div className="text-center space-y-1">
              <span className="text-3xl">❌</span>
              <h3 className="display text-lg text-white font-bold">Report Failed Delivery</h3>
              <p className="text-xs text-slate-400">
                Mark delivery as incomplete and alert Just Spuds management.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] uppercase font-bold text-slate-400">Failure Reason:</label>
              {[
                '🚪 Customer unreachable / No answer at door',
                '📍 Address incorrect or inaccessible',
                '🚫 Customer refused delivery',
                '📦 Package damaged in transit',
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setFailReason(reason)}
                  className={cx(
                    'w-full rounded-xl p-2.5 text-left text-xs font-semibold border transition',
                    failReason === reason
                      ? 'border-red-400 bg-red-500/20 text-white'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  )}
                >
                  {reason}
                </button>
              ))}

              <textarea
                placeholder="Required notes for store manager..."
                value={failNote}
                onChange={(e) => setFailNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowFailModal(false)}
                className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!failReason}
                onClick={handleFailDeliverySubmit}
                className="flex-1 rounded-xl bg-red-600 py-3 text-xs font-bold text-white disabled:opacity-50 hover:bg-red-500"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
