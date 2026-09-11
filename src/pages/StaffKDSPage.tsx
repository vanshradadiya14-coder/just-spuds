import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  subscribeOrders,
  updateOrderStatus,
  sendOrderToDrivers,
  cancelOrder,
  playKitchenChime,
  getMenuStockOverrides,
  toggleItemStock,
  getKitchenPauseState,
  setKitchenPause,
  resumeKitchenOrders,
  subscribeKitchenPause,
  PAUSE_REASON_PRESETS,
  type Order,
  type OrderStatus,
  type KitchenPauseState,
} from '../services/orderStore'
import {
  getCurrentUser,
  subscribeAuth,
  loginWithPin,
  logout,
  hasRole,
  SHOP_FLOOR_ROLES,
  MANAGEMENT_ROLES,
  type AuthUser,
} from '../services/authStore'
import { getProducts, subscribeMenu } from '../services/menuStore'
import { type Product } from '../data/menu'
import TicketCard from './staff/TicketCard'
import ThermalReceipt from '../components/ThermalReceipt'
import ManualOrderFixModal from '../components/ManualOrderFixModal'
import CreateManualOrderModal from '../components/CreateManualOrderModal'
import { cx, gbp } from '../utils/format'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
type StaffTab = 'active' | 'new' | 'baking' | 'dispatched' | 'completed' | 'stock'

const REJECTION_REASON_PRESETS = [
  { id: 'out_of_stock', label: '🥔 Out of fresh King Edward potato stock', defaultText: 'We have temporarily run out of fresh jacket potato stock for this batch.' },
  { id: 'topping_unavailable', label: '🧀 Ingredient unavailable (custom topping sold out)', defaultText: 'One or more of your chosen toppings/fillings is currently sold out in kitchen.' },
  { id: 'rush_overload', label: '⏰ Kitchen at peak capacity (cannot fulfill in time)', defaultText: 'Kitchen is currently experiencing an extreme rush and cannot prepare your order to quality standard.' },
  { id: 'outside_radius', label: '🏠 Delivery address outside delivery radius', defaultText: 'Delivery address is outside our safe hot delivery perimeter in Aylesbury.' },
  { id: 'closing_early', label: '🚫 Store closing early for maintenance', defaultText: 'Kitchen is closing early for scheduled oven cleaning and maintenance.' },
  { id: 'custom', label: '📝 Other / Custom Reason', defaultText: '' },
]

export default function StaffKDSPage() {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())

  useDocumentMeta({
    title: 'Kitchen Display System (KDS) & Order Expediter',
    description: 'Real-time kitchen order display system and line expediter for Just Spuds Aylesbury.',
  })
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>(() => getProducts())
  const [activeTab, setActiveTab] = useState<StaffTab>('active')
  const [stockOverrides, setStockOverrides] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [kitchenPause, setKitchenPauseState] = useState<KitchenPauseState>(() => getKitchenPauseState())

  // Manual resolution and creation modals
  const [fixingOrder, setFixingOrder] = useState<Order | null>(null)
  const [isCreateManualOrderOpen, setIsCreateManualOrderOpen] = useState(false)

  // Pause Modal State
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false)
  const [selectedReasonCode, setSelectedReasonCode] = useState<KitchenPauseState['reasonCode']>('rush_capacity')
  const [customReasonText, setCustomReasonText] = useState<string>(PAUSE_REASON_PRESETS[0].defaultText)
  const [selectedDurationMins, setSelectedDurationMins] = useState<number>(20)

  // Order Rejection & Refund Modal State
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null)
  const [rejectionPresetId, setRejectionPresetId] = useState<string>(REJECTION_REASON_PRESETS[0].id)
  const [customRejectionText, setCustomRejectionText] = useState<string>(REJECTION_REASON_PRESETS[0].defaultText)

  useEffect(() => {
    const unsub = subscribeMenu(() => {
      setProducts(getProducts())
    })
    return unsub
  }, [])

  // PIN login state for quick kitchen access
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  // Thermal receipt modal state
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const unsubAuth = subscribeAuth((u) => setUser(u))
    const unsubOrders = subscribeOrders((all) => setOrders(all))
    const unsubPause = subscribeKitchenPause((kp) => setKitchenPauseState(kp))
    setStockOverrides(getMenuStockOverrides())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => {
      unsubAuth()
      unsubOrders()
      unsubPause()
      clearInterval(timer)
    }
  }, [])

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pinInput.trim()) return
    const res = loginWithPin(pinInput)
    if (res.ok) {
      setPinInput('')
      setPinError(null)
    } else {
      setPinError(res.message)
    }
  }

  const handleStatusChange = (orderId: string, nextStatus: OrderStatus) => {
    updateOrderStatus(orderId, nextStatus)
  }

  const handleStockToggle = (productId: string, current: boolean) => {
    toggleItemStock(productId, !current)
    setStockOverrides((prev) => ({ ...prev, [productId]: !current }))
  }

  const handleOpenPauseModal = () => {
    setSelectedReasonCode('rush_capacity')
    setCustomReasonText(PAUSE_REASON_PRESETS[0].defaultText)
    setSelectedDurationMins(20)
    setIsPauseModalOpen(true)
  }

  const handleReasonCodeChange = (code: KitchenPauseState['reasonCode']) => {
    setSelectedReasonCode(code)
    const preset = PAUSE_REASON_PRESETS.find((p) => p.code === code)
    if (preset) {
      setCustomReasonText(preset.defaultText)
      setSelectedDurationMins(preset.suggestedMinutes)
    }
  }

  const handleConfirmPause = () => {
    const resumeAt = selectedDurationMins > 0
      ? new Date(Date.now() + selectedDurationMins * 60 * 1000).toISOString()
      : 'manual'
    setKitchenPause({
      isPaused: true,
      pausedAt: new Date().toISOString(),
      resumeAt,
      durationMinutes: selectedDurationMins,
      reasonCode: selectedReasonCode,
      reasonText: customReasonText.trim() || 'Kitchen temporarily paused.',
      pausedBy: user?.name || 'Staff Member',
    })
    setIsPauseModalOpen(false)
  }

  const handleResumeOrders = () => {
    resumeKitchenOrders()
  }

  const handleOpenRejectModal = (order: Order) => {
    setRejectingOrder(order)
    setRejectionPresetId(REJECTION_REASON_PRESETS[0].id)
    setCustomRejectionText(REJECTION_REASON_PRESETS[0].defaultText)
  }

  const handleSelectRejectionPreset = (presetId: string) => {
    setRejectionPresetId(presetId)
    const preset = REJECTION_REASON_PRESETS.find((p) => p.id === presetId)
    if (preset && preset.id !== 'custom') {
      setCustomRejectionText(preset.defaultText)
    } else if (preset && preset.id === 'custom') {
      setCustomRejectionText('')
    }
  }

  const handleConfirmRejection = () => {
    if (!rejectingOrder) return
    const reasonFinal = customRejectionText.trim() || 'Kitchen unavailable to prepare order.'
    cancelOrder(rejectingOrder.id, reasonFinal)
    setRejectingOrder(null)
  }

  // If user is not authenticated or not staff/manager/admin, show quick PIN keypad
  const isAuthorized = hasRole(user, SHOP_FLOOR_ROLES)

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 font-body text-xs font-bold text-white hover:bg-white/15 transition"
          >
            <span>←</span>
            <span>Customer Website</span>
          </Link>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition"
          >
            <span>📊</span>
            <span>Admin Console</span>
          </Link>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-amber-400/30 bg-gradient-to-b from-slate-900 to-black p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-3xl shadow-glow">
            👨‍🍳
          </div>
          <h1 className="display text-2xl text-white font-bold">Kitchen Display Terminal</h1>
          <p className="font-body text-xs text-white/60 mt-1 mb-6">
            Enter your 4-digit Kitchen PIN to access live order tickets.
          </p>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white focus:border-amber-400 focus:outline-none"
            />

            {/* Numeric Keypad Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPinInput((prev) => (prev.length < 4 ? prev + num : prev))}
                  className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-lg font-bold text-white hover:bg-white/15 transition active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="rounded-xl border border-red-500/20 bg-red-950/20 py-3 font-body text-xs font-bold text-red-400 hover:bg-red-900/40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => (prev.length < 4 ? prev + '0' : prev))}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-lg font-bold text-white hover:bg-white/15"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-body text-xs font-bold text-white hover:bg-white/15"
              >
                ⌫
              </button>
            </div>

            {pinError && (
              <p className="rounded-xl bg-red-950/50 border border-red-500/40 p-2.5 font-body text-xs text-red-300">
                {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
            >
              Sign In to Kitchen Display →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Active counts
  const newOrders = orders.filter((o) => ['placed', 'accepted'].includes(o.status))
  const bakingOrders = orders.filter((o) => ['baking', 'quality_check'].includes(o.status))
  const dispatchedOrders = orders.filter((o) => ['out_for_delivery', 'ready_for_pickup'].includes(o.status))
  const completedOrders = orders.filter((o) => ['delivered', 'collected'].includes(o.status))

  // Filter list
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 pt-4 sm:pt-6">
      <div className="mx-auto max-w-[1700px] px-4 sm:px-6">

        {/* MANAGER COMMAND BAR (Visible when logged in as Manager or Admin) */}
        {hasRole(user, MANAGEMENT_ROLES) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent p-3 font-body text-xs text-white shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400 font-bold text-ink text-xs shadow-glow">
                👑
              </span>
              <span>
                <strong>Store Manager Session ({user?.name})</strong> &bull; Manager privileges active.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/admin"
                className="rounded-xl bg-amber-400 px-3.5 py-1.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow transition hover:bg-amber-300 flex items-center gap-1.5"
              >
                <span>Open Sales &amp; Financial Console</span>
                <span>📊 →</span>
              </Link>
            </div>
          </div>
        )}

        {/* STAFF DEDICATED TOP BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-2xl text-ink shadow-glow">
              👨‍🍳
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="display text-xl sm:text-2xl text-white font-bold tracking-wide">JUST SPUDS &bull; KITCHEN DISPLAY</h1>
                {hasRole(user, MANAGEMENT_ROLES) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                    👑 Store Manager
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    👨‍🍳 Line Cook (PIN 1234)
                  </span>
                )}
              </div>
              <p className="font-body text-xs text-white/60">
                Staff: <strong>{user?.name}</strong> &bull; Market Square Station
              </p>
            </div>
          </div>

          {/* Header Action Tools */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Clock */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs font-bold text-amber-300">
              🕒 {currentTime.toLocaleTimeString()}
            </div>

            {/* Counter Till POS Terminal Link */}
            <Link
              to="/pos"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 font-body text-xs font-black text-ink shadow-glow hover:bg-emerald-400 transition active:scale-95 whitespace-nowrap"
              title="Open Counter Till / POS Terminal with cash drawer"
            >
              <span>🥔</span>
              <span>Open Counter Till</span>
            </Link>

            {/* New Manual Phone / Counter Order Button */}
            <button
              type="button"
              onClick={() => setIsCreateManualOrderOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-1.5 font-body text-xs font-black text-ink shadow hover:bg-amber-300 transition active:scale-95 whitespace-nowrap"
              title="Directly enter a phone-in or walk-in till order into KDS"
            >
              <span>📝</span>
              <span>+ Phone / Till Order</span>
            </button>

            {/* Kitchen Stream Pause/Resume Toggle */}
            {kitchenPause.isPaused ? (
              <button
                type="button"
                onClick={handleResumeOrders}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400 transition animate-pulse"
                title="Click to resume accepting live orders immediately"
              >
                <span>▶️</span>
                <span>Resume Live Orders</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenPauseModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition"
                title="Pause incoming online orders with a reason & duration"
              >
                <span>⏸️</span>
                <span>Pause Orders</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullScreen}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-white/15"
              title="Toggle Fullscreen Kitchen Terminal"
            >
              {isFullscreen ? '🗗 Exit Fullscreen' : '⛶ Fullscreen KDS'}
            </button>

            <button
              type="button"
              onClick={() => { playKitchenChime(); setSoundEnabled(true) }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-white/10"
              title="Test Kitchen Audio Chime"
            >
              <span>🔔</span>
              <span>{soundEnabled ? 'Chime ON' : 'Muted'}</span>
            </button>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-white/15 transition"
              title="Open Customer Storefront"
            >
              <span>🌐</span>
              <span>Storefront</span>
            </Link>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-1.5 font-body text-xs font-bold text-red-300 hover:bg-red-900/50"
            >
              Lock Station 🔒
            </button>
          </div>
        </div>

        {/* ACTIVE KITCHEN PAUSE ALERT BANNER */}
        {kitchenPause.isPaused && (
          <div className="mb-5 rounded-2xl border border-rose-500/50 bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 p-4 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-start md:items-center gap-3">
              <span className="text-3xl shrink-0 mt-0.5 md:mt-0">⏸️</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-rose-500 px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider text-white">
                    Online Orders Paused
                  </span>
                  {kitchenPause.resumeAt && kitchenPause.resumeAt !== 'manual' && (
                    <span className="rounded-full bg-rose-900/80 border border-rose-400/40 px-2.5 py-0.5 font-mono text-[10px] font-bold text-rose-200">
                      Auto-resumes at ~{new Date(kitchenPause.resumeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {kitchenPause.pausedBy && (
                    <span className="text-[11px] text-rose-300/80">
                      by <strong>{kitchenPause.pausedBy}</strong>
                    </span>
                  )}
                </div>
                <p className="font-body text-xs text-rose-100 mt-1 font-medium">
                  Notice: &ldquo;{kitchenPause.reasonText || 'Kitchen temporarily paused.'}&rdquo;
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResumeOrders}
              className="rounded-xl bg-emerald-500 px-4 py-2 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:bg-emerald-400 transition shrink-0"
            >
              ▶️ Resume Orders Now
            </button>
          </div>
        )}

        {/* KITCHEN KANBAN BOARD */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Top Control Bar */}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-display font-bold text-white">Live Kitchen Flow</h2>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs text-white/60 font-body uppercase tracking-wider font-bold">Live Sync Active</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative min-w-[240px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by order #, customer..."
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2 text-white/50 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'stock' ? 'active' : 'stock')}
                className={cx(
                  'rounded-xl px-4 py-2 font-body text-xs font-black uppercase tracking-wider transition shadow-glow',
                  activeTab === 'stock' ? 'bg-amber-400 text-ink' : 'bg-white/10 text-white hover:bg-white/20'
                )}
              >
                📦 86 Items / Stock
              </button>
            </div>
          </div>

          {activeTab === 'stock' ? (
            /* TAB: STOCK AVAILABILITY */
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4 overflow-y-auto">
              <div className="border-b border-white/10 pb-4">
                <h2 className="display text-xl text-white">Kitchen Stock &amp; Ingredient Availability</h2>
                <p className="font-body text-xs text-white/60 mt-0.5">
                  Toggle items on/off. Sold out items instantly update across customer apps in real-time.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {products.map((product) => {
                  const isOutOfStock = stockOverrides[product.id] === false
                  return (
                    <div
                      key={product.id}
                      className={cx(
                        'rounded-2xl border p-4 flex items-center justify-between gap-3 transition-all',
                        isOutOfStock
                          ? 'border-red-500/40 bg-red-950/20'
                          : 'border-white/10 bg-white/[0.03]'
                      )}
                    >
                      <div>
                        <p className="font-body text-xs font-bold text-white">{product.name}</p>
                        <p className="font-body text-[10px] text-white/50">{product.category} &bull; {gbp(product.price)}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStockToggle(product.id, !isOutOfStock)}
                        className={cx(
                          'rounded-xl px-3 py-1.5 font-body text-[10px] font-black uppercase tracking-wider transition',
                          isOutOfStock
                            ? 'bg-red-500 text-white shadow'
                            : 'bg-emerald-500 text-slate-950'
                        )}
                      >
                        {isOutOfStock ? 'Sold Out ✕' : 'In Stock ✓'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* KANBAN BOARD */
            <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
              <div className="flex gap-6 h-full min-w-max">
                
                {/* Column 1: NEW / PENDING */}
                <div className="w-[360px] flex flex-col gap-4 border-r border-white/10 pr-6">
                  <div className="flex items-center justify-between sticky top-0 bg-slate-950 py-2 z-10">
                    <h3 className="font-display text-lg font-bold text-amber-400 flex items-center gap-2">
                      📝 New &amp; Pending
                    </h3>
                    <span className="bg-amber-400/20 text-amber-300 rounded-full px-2.5 py-0.5 text-xs font-black">
                      {newOrders.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-4 overflow-y-auto pb-8 custom-scrollbar pr-2 flex-1">
                    {newOrders.map(ord => (
                      <TicketCard 
                        key={ord.id} 
                        ord={ord} 
                        handleStatusChange={handleStatusChange} 
                        handleOpenRejectModal={handleOpenRejectModal} 
                        setPrintingOrder={setPrintingOrder} 
                        sendOrderToDrivers={sendOrderToDrivers} 
                        setFixingOrder={setFixingOrder}
                      />
                    ))}
                    {newOrders.length === 0 && <div className="text-center text-white/30 text-xs py-8 font-body italic border border-dashed border-white/10 rounded-xl">No new tickets</div>}
                  </div>
                </div>

                {/* Column 2: IN PREP / OVEN */}
                <div className="w-[360px] flex flex-col gap-4 border-r border-white/10 pr-6">
                  <div className="flex items-center justify-between sticky top-0 bg-slate-950 py-2 z-10">
                    <h3 className="font-display text-lg font-bold text-orange-400 flex items-center gap-2">
                      🍳 In Oven (Baking)
                    </h3>
                    <span className="bg-orange-400/20 text-orange-300 rounded-full px-2.5 py-0.5 text-xs font-black">
                      {bakingOrders.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-4 overflow-y-auto pb-8 custom-scrollbar pr-2 flex-1">
                    {bakingOrders.map(ord => (
                      <TicketCard 
                        key={ord.id} 
                        ord={ord} 
                        handleStatusChange={handleStatusChange} 
                        handleOpenRejectModal={handleOpenRejectModal} 
                        setPrintingOrder={setPrintingOrder} 
                        sendOrderToDrivers={sendOrderToDrivers} 
                        setFixingOrder={setFixingOrder}
                      />
                    ))}
                    {bakingOrders.length === 0 && <div className="text-center text-white/30 text-xs py-8 font-body italic border border-dashed border-white/10 rounded-xl">Oven is empty</div>}
                  </div>
                </div>

                {/* Column 3: READY / DISPATCH */}
                <div className="w-[360px] flex flex-col gap-4 border-r border-white/10 pr-6">
                  <div className="flex items-center justify-between sticky top-0 bg-slate-950 py-2 z-10">
                    <h3 className="font-display text-lg font-bold text-emerald-400 flex items-center gap-2">
                      🛵 Ready for Dispatch
                    </h3>
                    <span className="bg-emerald-400/20 text-emerald-300 rounded-full px-2.5 py-0.5 text-xs font-black">
                      {dispatchedOrders.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-4 overflow-y-auto pb-8 custom-scrollbar pr-2 flex-1">
                    {dispatchedOrders.map(ord => (
                      <TicketCard 
                        key={ord.id} 
                        ord={ord} 
                        handleStatusChange={handleStatusChange} 
                        handleOpenRejectModal={handleOpenRejectModal} 
                        setPrintingOrder={setPrintingOrder} 
                        sendOrderToDrivers={sendOrderToDrivers} 
                        setFixingOrder={setFixingOrder}
                      />
                    ))}
                    {dispatchedOrders.length === 0 && <div className="text-center text-white/30 text-xs py-8 font-body italic border border-dashed border-white/10 rounded-xl">No waiting dispatches</div>}
                  </div>
                </div>

                {/* Column 4: COMPLETED */}
                <div className="w-[360px] flex flex-col gap-4 pr-6">
                  <div className="flex items-center justify-between sticky top-0 bg-slate-950 py-2 z-10">
                    <h3 className="font-display text-lg font-bold text-slate-400 flex items-center gap-2">
                      ✓ Completed (Recent)
                    </h3>
                    <span className="bg-white/10 text-white/60 rounded-full px-2.5 py-0.5 text-xs font-black">
                      {completedOrders.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-4 overflow-y-auto pb-8 custom-scrollbar pr-2 flex-1">
                    {completedOrders.slice(0, 15).map(ord => (
                      <TicketCard 
                        key={ord.id} 
                        ord={ord} 
                        handleStatusChange={handleStatusChange} 
                        handleOpenRejectModal={handleOpenRejectModal} 
                        setPrintingOrder={setPrintingOrder} 
                        sendOrderToDrivers={sendOrderToDrivers} 
                        setFixingOrder={setFixingOrder}
                      />
                    ))}
                    {completedOrders.length === 0 && <div className="text-center text-white/30 text-xs py-8 font-body italic border border-dashed border-white/10 rounded-xl">No recent completions</div>}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      {/* THERMAL POS RECEIPT PREVIEW / PRINT MODAL */}
      {printingOrder && (
        <ThermalReceipt order={printingOrder} onClose={() => setPrintingOrder(null)} isModal={true} />
      )}

      {/* REJECT & AUTOMATIC REFUND MODAL */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/50 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl text-slate-100 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/20 border border-red-500/40 text-2xl text-red-400 shadow-glow">
                  ❌
                </span>
                <div>
                  <h2 className="display text-xl text-white font-bold">
                    Reject Order #{rejectingOrder.shortId}
                  </h2>
                  <p className="font-body text-xs text-white/60">
                    {rejectingOrder.customer.name} &bull; Total: <strong className="text-amber-400">{gbp(rejectingOrder.payment.total)}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="rounded-full bg-white/10 p-2 text-xs text-white/70 hover:bg-white/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Cancellation Notice Banner */}
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-3.5 flex items-center gap-3 text-xs text-amber-200">
              <span className="text-2xl">ℹ️</span>
              <div>
                <p className="font-bold text-amber-300">
                  {rejectingOrder.payment.status === 'paid' ? '100% Customer Refund' : 'No Online Payment Collected'}
                </p>
                <p className="text-[11px] text-white/70 mt-0.5">
                  {rejectingOrder.payment.status === 'paid'
                    ? `Confirming rejection will return ${gbp(rejectingOrder.payment.total)} to customer.`
                    : `No online charge was made. Customer will be notified that order #${rejectingOrder.shortId} was declined.`}
                </p>
              </div>
            </div>

            {/* Rejection Reason Selector */}
            <div>
              <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                1. Select Reason for Rejection:
              </label>
              <div className="space-y-2">
                {REJECTION_REASON_PRESETS.map((preset) => {
                  const isSelected = rejectionPresetId === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectRejectionPreset(preset.id)}
                      className={cx(
                        'w-full flex items-center justify-between rounded-xl border p-3 text-left font-body text-xs transition',
                        isSelected
                          ? 'border-red-400 bg-red-500/20 text-white font-bold shadow'
                          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span>{preset.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom / Live Explanation */}
            <div>
              <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                2. Customer Notification Note:
              </label>
              <textarea
                value={customRejectionText}
                onChange={(e) => setCustomRejectionText(e.target.value)}
                rows={3}
                required
                className="w-full rounded-2xl border border-white/20 bg-white/10 p-3 font-body text-xs text-white placeholder:text-white/40 focus:border-red-400 focus:outline-none"
                placeholder="Type explanation displayed to customer on their live order screen..."
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="flex-1 rounded-full border border-white/20 bg-white/5 py-3 font-body text-xs font-bold text-white hover:bg-white/10"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                className="flex-1 rounded-full bg-red-500 py-3 font-body text-xs font-black uppercase tracking-wider text-white shadow-glow hover:bg-red-400 transition"
              >
                Reject &amp; Decline Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF PAUSE ORDER MODAL */}
      {isPauseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl text-slate-100 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/20 border border-rose-500/40 text-2xl text-rose-400">
                  ⏸️
                </span>
                <div>
                  <h2 className="display text-xl text-white font-bold">Pause Online Orders</h2>
                  <p className="font-body text-xs text-white/60">
                    Hold incoming customer orders and show a clear live notice.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPauseModalOpen(false)}
                className="rounded-full bg-white/10 p-2 text-xs text-white/70 hover:bg-white/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Reason Presets */}
            <div>
              <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                1. Select Reason for Pause:
              </label>
              <div className="grid gap-2">
                {PAUSE_REASON_PRESETS.map((preset) => {
                  const isSelected = selectedReasonCode === preset.code
                  return (
                    <button
                      key={preset.code}
                      type="button"
                      onClick={() => handleReasonCodeChange(preset.code)}
                      className={cx(
                        'flex items-center justify-between rounded-xl border p-3 text-left font-body text-xs transition',
                        isSelected
                          ? 'border-rose-400 bg-rose-500/20 text-white font-bold shadow'
                          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span>{preset.label}</span>
                      <span className="text-[10px] text-white/50">{preset.suggestedMinutes} mins default</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom / Live Notice Message */}
            <div>
              <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                2. Live Message Shown to Customers:
              </label>
              <textarea
                value={customReasonText}
                onChange={(e) => setCustomReasonText(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-white/20 bg-white/10 p-3 font-body text-xs text-white placeholder:text-white/40 focus:border-rose-400 focus:outline-none"
                placeholder="Explain why orders are paused so customers know when to return..."
              />
            </div>

            {/* Duration Selector */}
            <div>
              <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                3. Pause Duration:
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: '15m', mins: 15 },
                  { label: '20m', mins: 20 },
                  { label: '30m', mins: 30 },
                  { label: '45m', mins: 45 },
                  { label: 'Manual', mins: 0 },
                ].map((dur) => (
                  <button
                    key={dur.label}
                    type="button"
                    onClick={() => setSelectedDurationMins(dur.mins)}
                    className={cx(
                      'rounded-xl border py-2.5 text-center font-body text-xs font-bold transition',
                      selectedDurationMins === dur.mins
                        ? 'border-rose-400 bg-rose-500 text-white shadow'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    )}
                  >
                    {dur.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-body text-[11px] text-white/50">
                {selectedDurationMins > 0
                  ? `Will automatically resume at ~${new Date(Date.now() + selectedDurationMins * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Orders will remain paused until staff manually clicks Resume.'}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPauseModalOpen(false)}
                className="flex-1 rounded-full border border-white/20 bg-white/5 py-3 font-body text-xs font-bold text-white hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPause}
                className="flex-1 rounded-full bg-rose-500 py-3 font-body text-xs font-black uppercase tracking-wider text-white shadow-glow hover:bg-rose-400 transition"
              >
                Confirm &amp; Pause Orders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ORDER PROBLEM FIXER MODAL */}
      {fixingOrder && (
        <ManualOrderFixModal
          order={fixingOrder}
          isOpen={true}
          onClose={() => setFixingOrder(null)}
          currentActorName={user?.name || 'Kitchen Staff'}
          onOrderUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
          }}
        />
      )}

      {/* CREATE MANUAL PHONE / COUNTER ORDER MODAL */}
      <CreateManualOrderModal
        isOpen={isCreateManualOrderOpen}
        onClose={() => setIsCreateManualOrderOpen(false)}
        currentActorName={user?.name || 'Kitchen Staff'}
        onOrderCreated={(newOrder) => {
          setOrders((prev) => [newOrder, ...prev])
        }}
      />
    </div>
    </div>
  )
}
