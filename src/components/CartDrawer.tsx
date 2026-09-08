import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import SmartImage from './SmartImage'
import CheckoutModal from './CheckoutModal'
import OnlineOrderingPausedModal from './OnlineOrderingPausedModal'
import { useCart, lineUnitPrice } from '../hooks/useCart'
import { optionLabel, getProduct, MEAL_DEAL } from '../data/menu'
import { gbp, cx } from '../utils/format'

const ease = [0.16, 1, 0.3, 1] as const

import { PICKUP_TIMES, DELIVERY_TIMES, SCHEDULE_TIMES, getScheduleDates } from '../utils/scheduling'

const QUICK_PAIRINGS = [
  { id: 'cold-coca-cola', name: 'Coca Cola Can', price: 150, icon: '🥤' },
  { id: 'hot-latte', name: 'Barista Latte', price: 275, icon: '☕' },
  { id: 'snack-ready-salted', name: 'Ready Salted Crisps', price: 150, icon: '🥔' },
  { id: 'snack-dairy-milk', name: 'Cadbury Dairy Milk', price: 140, icon: '🍫' },
]

export default function CartDrawer() {
  const {
    lines, isOpen, close, remove, setQty, toggleMeal, rawSubtotal, discount,
    promoCode, applyPromo, removePromo, fulfilment, setFulfilment,
    timingMode, setTimingMode, scheduleDate, setScheduleDate, scheduleTime, setScheduleTime,
    formattedScheduledTime, isScheduled, kitchenPause,
    collectionTime, setCollectionTime, deliveryTime, setDeliveryTime,
    deliveryAddress, setDeliveryAddress, deliveryFee, freeDeliveryThreshold,
    postcodeValidation, minOrderPence, isMinOrderMet, storeStatus,
    finalTotal, kitchenNotes, setKitchenNotes, count, add, updateMeal,
    isOnlineOrderingEnabled, orderingPausedTitle, orderingPausedMessage,
  } = useCart()

  const [inputCode, setInputCode] = useState('')
  const [promoError, setPromoError] = useState<string | null>(null)
  const [isCheckoutOpen, setCheckoutOpen] = useState(false)
  const [isPausedModalOpen, setPausedModalOpen] = useState(false)

  // Perk Progress calculation (£12 perk target)
  const perkTarget = 1200
  const perkProgress = Math.min(100, Math.round((rawSubtotal / perkTarget) * 100))
  const perkRemaining = Math.max(0, perkTarget - rawSubtotal)

  // Free delivery progress calculation (£15 threshold)
  const freeDeliveryRemaining = Math.max(0, freeDeliveryThreshold - rawSubtotal)
  const freeDeliveryProgress = Math.min(100, Math.round((rawSubtotal / freeDeliveryThreshold) * 100))

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, close])

  const handleApplyPromo = () => {
    if (!inputCode.trim()) return
    const res = applyPromo(inputCode)
    if (!res.ok) {
      setPromoError(res.message)
    } else {
      setPromoError(null)
      setInputCode('')
    }
  }

  const checkout = () => {
    if (!isOnlineOrderingEnabled) {
      setPausedModalOpen(true)
      return
    }
    setCheckoutOpen(true)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Your order">
          <motion.button
            type="button" aria-label="Close order"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }} onClick={close}
            className="absolute inset-0 bg-ink/75 backdrop-blur-sm"
          />

          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.55, ease }}
            className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col glass-panel"
          >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <h2 className="display text-2xl uppercase text-ink">
                  Your Order
                </h2>
                {count > 0 && (
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 font-body text-xs font-black text-ink shadow-sm">
                    {count}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close order"
                className="grid h-10 w-10 place-items-center rounded-full bg-ink/5 transition hover:bg-ink/10"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {/* Home Delivery vs Store Pick Up Switcher Tabs */}
            <div className="border-b border-ink/10 bg-paper/90 px-6 py-2.5">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink/5 p-1">
                <button
                  type="button"
                  onClick={() => setFulfilment('pickup')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-center font-body text-xs font-bold transition-all ${
                    fulfilment === 'pickup'
                      ? 'bg-amber-400 text-ink shadow-md font-black'
                      : 'text-slate-600 hover:text-ink'
                  }`}
                >
                  <span className="text-base">🛍️</span>
                  <span>Store Pick Up</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfilment('delivery')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-center font-body text-xs font-bold transition-all ${
                    fulfilment === 'delivery'
                      ? 'bg-amber-400 text-ink shadow-md font-black'
                      : 'text-slate-600 hover:text-ink'
                  }`}
                >
                  <span className="text-base">🛵</span>
                  <span>Home Delivery</span>
                </button>
              </div>
            </div>

            {/* Timing & Schedule Mode Sub-Bar */}
            <div className="border-b border-ink/8 bg-paper/60 px-6 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-xl bg-ink/5 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (storeStatus.isKitchenPaused || kitchenPause.isPaused) return
                      setTimingMode('asap')
                    }}
                    className={cx(
                      'px-3 py-1 rounded-lg font-body text-[10px] font-bold transition-all',
                      timingMode === 'asap' && !storeStatus.isKitchenPaused && !kitchenPause.isPaused
                        ? 'bg-amber-400 text-ink shadow-xs font-black'
                        : (storeStatus.isKitchenPaused || kitchenPause.isPaused)
                        ? 'text-slate-400 opacity-50 cursor-not-allowed'
                        : 'text-slate-600 hover:text-ink'
                    )}
                  >
                    ⚡ ASAP
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimingMode('scheduled')}
                    className={cx(
                      'px-3 py-1 rounded-lg font-body text-[10px] font-bold transition-all flex items-center justify-center gap-1',
                      timingMode === 'scheduled' || storeStatus.isKitchenPaused || kitchenPause.isPaused
                        ? 'bg-amber-400 text-ink shadow-xs font-black'
                        : 'text-slate-600 hover:text-ink'
                    )}
                  >
                    <span>📅 Schedule</span>
                  </button>
                </div>
                <div className="text-right">
                  <span className="font-body text-[10px] font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-md">
                    {isScheduled ? `📅 ${formattedScheduledTime}` : (fulfilment === 'delivery' ? '🛵 ~25-35m' : '🛍️ ~15m')}
                  </span>
                </div>
              </div>

              {/* Scheduled Pickers in Drawer */}
              {(timingMode === 'scheduled' || storeStatus.isKitchenPaused || kitchenPause.isPaused) && (
                <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-ink/5 animate-fadeIn">
                  <select
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full rounded-lg border border-ink/15 bg-white px-2 py-1 font-body text-[11px] font-bold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
                  >
                    {getScheduleDates().map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full rounded-lg border border-ink/15 bg-white px-2 py-1 font-body text-[11px] font-bold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
                  >
                    {SCHEDULE_TIMES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Loyalty & Delivery Perks Tracker */}
            {lines.length > 0 && (
              <div className="border-b border-ink/8 bg-amber-50/70 px-6 py-2.5 space-y-1.5">
                {fulfilment === 'delivery' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-body font-bold text-ink">
                      <span>
                        {freeDeliveryRemaining > 0 ? (
                          <>🛵 Add <strong className="text-amber-800">{gbp(freeDeliveryRemaining)}</strong> for <strong>FREE Home Delivery</strong></>
                        ) : (
                          <span className="text-emerald-700">🎉 FREE Home Delivery Unlocked!</span>
                        )}
                      </span>
                      <span className="tabular-nums font-black text-amber-800">{freeDeliveryProgress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500"
                        style={{ width: `${freeDeliveryProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] font-body text-slate-600">
                  <span>
                    {perkRemaining > 0 ? (
                      <>🎁 Add <strong className="text-amber-700">{gbp(perkRemaining)}</strong> for a <strong>Free Dip / Drink Perk</strong></>
                    ) : (
                      <span className="text-emerald-700 font-bold">✓ Free VIP Perk Unlocked</span>
                    )}
                  </span>
                  <span className="tabular-nums font-bold text-amber-700">{perkProgress}%</span>
                </div>
              </div>
            )}

            {lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
                <span className="text-5xl animate-pulse">🥔</span>
                <p className="display text-2xl text-ink">Your bag is empty</p>
                <p className="font-body text-sm text-steel">Pick a freshly baked spud, crusty baguette, or toasted panini from the menu.</p>
                
                {/* Fulfillment selector in empty state */}
                <div className="my-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfilment('pickup')}
                    className={`rounded-full px-4 py-1.5 font-body text-xs font-bold ${fulfilment === 'pickup' ? 'bg-amber-400 text-ink' : 'bg-paper text-slate-600'}`}
                  >
                    🛍️ Pick Up
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfilment('delivery')}
                    className={`rounded-full px-4 py-1.5 font-body text-xs font-bold ${fulfilment === 'delivery' ? 'bg-amber-400 text-ink' : 'bg-paper text-slate-600'}`}
                  >
                    🛵 Home Delivery
                  </button>
                </div>

                <Link
                  to="/menu"
                  onClick={close}
                  className="mt-2 rounded-full bg-amber-400 px-8 py-3.5 font-body text-[11px] font-bold uppercase tracking-wider text-ink transition hover:bg-amber-300 shadow-glow"
                >
                  Browse Menu →
                </Link>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                  {/* Items List */}
                  <ul className="divide-y divide-ink/8">
                    {lines.map((l) => {
                      const isMealEligible = l.category === 'SPUDS' || l.category === 'BAGUETTES' || l.category === 'PANINIS' || l.category === 'SALADS'
                      return (
                        <li key={l.lineId} className="py-4 space-y-3">
                          <div className="flex gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-paper border border-ink/5">
                              <SmartImage src={l.image} alt="" className="h-full w-full" cover />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between">
                                <p className="display text-[17px] text-ink leading-tight">{l.name}</p>
                                <span className="font-body text-sm font-bold tabular-nums text-ink">
                                  {gbp(lineUnitPrice(l) * l.qty)}
                                </span>
                              </div>
                              
                              {(l.extras.length > 0 || (l.salads && l.salads.length > 0) || l.sauces.length > 0 || l.meal) && (
                                <div className="mt-1 space-y-0.5 font-body text-[11px] leading-snug text-slate-500">
                                  {(l.extras.length > 0 || l.sauces.length > 0) && (
                                    <p>
                                      {[...l.extras.map(optionLabel), ...l.sauces.map(optionLabel)].join(' · ')}
                                    </p>
                                  )}
                                  {l.salads && l.salads.length > 0 && (
                                    <p className="text-emerald-800 font-medium">
                                      🥗 Salads: {l.salads.map(optionLabel).join(', ')}
                                    </p>
                                  )}
                                  {l.meal && (
                                    <p className="text-amber-800 font-semibold flex items-center gap-1">
                                      <span>⚡ Meal Deal:</span>
                                      <span>
                                        {MEAL_DEAL.drinkOptions.find((d) => d.id === l.mealDrink)?.name || 'Can of Drink'} + {MEAL_DEAL.snackOptions.find((s) => s.id === l.mealSnack)?.name || 'Snack'}
                                      </span>
                                    </p>
                                  )}
                                </div>
                              )}

                              <div className="mt-3 flex items-center justify-between">
                                <div className="flex items-center rounded-full border border-ink/15 bg-white">
                                  <button
                                    type="button"
                                    onClick={() => setQty(l.lineId, l.qty - 1)}
                                    aria-label={`Decrease ${l.name}`}
                                    className="grid h-7 w-7 place-items-center text-slate-500 hover:text-ink font-bold"
                                  >
                                    −
                                  </button>
                                  <span className="min-w-6 text-center font-body text-xs font-bold">{l.qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => setQty(l.lineId, l.qty + 1)}
                                    aria-label={`Increase ${l.name}`}
                                    className="grid h-7 w-7 place-items-center text-slate-500 hover:text-ink font-bold"
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => remove(l.lineId)}
                                  className="font-body text-[10px] font-bold uppercase tracking-wider text-red-500 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Interactive Meal Deal Upgrade & Customizer */}
                          {isMealEligible && (
                            <div className="mt-2">
                              {!l.meal ? (
                                <button
                                  type="button"
                                  onClick={() => toggleMeal(l.lineId)}
                                  className="flex w-full items-center justify-between rounded-2xl border border-dashed border-amber-400 bg-amber-50/50 p-3 text-left transition hover:bg-amber-100/50 shadow-xs"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-xl">⚡</span>
                                    <div>
                                      <p className="font-body text-xs font-bold text-ink">
                                        Upgrade to Meal Deal (+{gbp(MEAL_DEAL.price)})
                                      </p>
                                      <p className="font-body text-[10px] text-slate-500">
                                        Adds any can of drink + crisps or chocolate
                                      </p>
                                    </div>
                                  </div>
                                  <span className="rounded-full bg-amber-400 px-3 py-1 font-body text-[10px] font-black uppercase text-ink shadow-sm">
                                    + Add Deal
                                  </span>
                                </button>
                              ) : (
                                <div className="rounded-2xl border border-amber-400/80 bg-gradient-to-br from-amber-50 to-amber-100/40 p-3.5 space-y-2.5 shadow-sm">
                                  <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-white text-[11px] font-black">✓</span>
                                      <span className="font-body text-xs font-bold text-amber-950">
                                        Meal Deal Active (+{gbp(MEAL_DEAL.price)})
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleMeal(l.lineId)}
                                      className="font-body text-[10px] font-bold text-red-600 hover:underline uppercase tracking-wider"
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    {/* Drink Selector */}
                                    <div>
                                      <label className="block font-body text-[10px] font-bold uppercase text-amber-900 mb-1 flex items-center gap-1">
                                        <span>🥤</span> Choose Drink:
                                      </label>
                                      <select
                                        value={l.mealDrink || MEAL_DEAL.drinkOptions[0].id}
                                        onChange={(e) => updateMeal(l.lineId, e.target.value, l.mealSnack || MEAL_DEAL.snackOptions[0].id)}
                                        className="w-full rounded-xl border border-amber-300 bg-white px-2.5 py-1.5 font-body text-xs font-semibold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
                                      >
                                        {MEAL_DEAL.drinkOptions.map((d) => (
                                          <option key={d.id} value={d.id}>
                                            {d.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    {/* Snack / Chocolate Selector */}
                                    <div>
                                      <label className="block font-body text-[10px] font-bold uppercase text-amber-900 mb-1 flex items-center gap-1">
                                        <span>🍫</span> Choose Snack / Crisps:
                                      </label>
                                      <select
                                        value={l.mealSnack || MEAL_DEAL.snackOptions[0].id}
                                        onChange={(e) => updateMeal(l.lineId, l.mealDrink || MEAL_DEAL.drinkOptions[0].id, e.target.value)}
                                        className="w-full rounded-xl border border-amber-300 bg-white px-2.5 py-1.5 font-body text-xs font-semibold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
                                      >
                                        {MEAL_DEAL.snackOptions.map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.name} ({s.type})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>

                  {/* Add More Food Prompt */}
                  <div className="flex items-center justify-between bg-paper border border-ink/8 rounded-2xl p-3.5">
                    <div>
                      <p className="font-body text-xs font-bold text-ink">Hungry for more?</p>
                      <p className="font-body text-[11px] text-slate-500">Browse hot paninis, baguettes &amp; salads</p>
                    </div>
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-full bg-ink px-4 py-2 font-body text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-700 transition shadow-sm"
                    >
                      + Add Items
                    </button>
                  </div>

                  {/* Home Delivery Address Details (Conditional) */}
                  {fulfilment === 'delivery' && (
                    <div className="rounded-2xl border border-amber-400/40 bg-amber-50/50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                          <span>🏠</span>
                          <span>Delivery Address (Aylesbury)</span>
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${postcodeValidation.canDeliver ? 'text-emerald-800 bg-emerald-100' : 'text-amber-800 bg-amber-200/80'}`}>
                          {postcodeValidation.canDeliver ? postcodeValidation.zone?.name : 'Zone Check'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <input
                            type="text"
                            value={deliveryAddress.street}
                            onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, street: e.target.value }))}
                            placeholder="Street Address, Flat / House No. *"
                            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink placeholder:text-steel focus:border-amber-500 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <input
                              type="text"
                              value={deliveryAddress.postcode}
                              onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, postcode: e.target.value.toUpperCase() }))}
                              placeholder="Postcode (e.g. HP20 1SN)"
                              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs uppercase text-ink placeholder:normal-case placeholder:text-steel focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <select
                              value={deliveryTime}
                              onChange={(e) => setDeliveryTime(e.target.value)}
                              className="w-full rounded-xl border border-ink/15 bg-white px-2 py-2 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
                            >
                              {DELIVERY_TIMES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Live Postcode Validation Feedback */}
                        {deliveryAddress.postcode && (
                          <div className={`rounded-xl p-2 text-[11px] font-body flex items-start gap-1.5 ${postcodeValidation.canDeliver ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                            <span>{postcodeValidation.canDeliver ? '✓' : 'ℹ️'}</span>
                            <span>{postcodeValidation.message}</span>
                          </div>
                        )}

                        {/* Delivery Instructions & Preset Chips */}
                        <div className="space-y-1.5 pt-1">
                          <input
                            type="text"
                            value={deliveryAddress.instructions || ''}
                            onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, instructions: e.target.value }))}
                            placeholder="Delivery notes (e.g. Ring buzzer 4B, leave in safe place)"
                            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs text-ink placeholder:text-steel focus:border-amber-500 focus:outline-none"
                          />
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {['🚪 Leave at door', '🤝 Hand to me', '🔔 Ring buzzer', '📦 Leave in porch'].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setDeliveryAddress((prev) => ({ ...prev, instructions: preset }))}
                                className="rounded-lg border border-ink/10 bg-white px-2 py-1 font-body text-[10px] font-medium text-slate-700 hover:bg-amber-100 hover:text-ink transition"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Estimated Pick Up Time (Conditional) */}
                  {fulfilment === 'pickup' && (
                    <div className="rounded-2xl border border-ink/10 bg-paper/60 p-4">
                      <label htmlFor="collection-time" className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink">
                        🕒 Estimated Store Pick Up Time
                      </label>
                      <select
                        id="collection-time"
                        value={collectionTime}
                        onChange={(e) => setCollectionTime(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-ink/15 bg-white p-2.5 font-body text-xs font-medium text-ink focus:border-amber-500 focus:outline-none"
                      >
                        {PICKUP_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <p className="mt-1.5 font-body text-[10px] text-slate-500">
                        📍 Pick up at: Market Square, Shop B Brook House, Aylesbury
                      </p>
                    </div>
                  )}

                  {/* Frequently Ordered Together / Quick 1-Tap Add Carousel */}
                  <div className="rounded-2xl border border-ink/10 bg-paper/60 p-4">
                    <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink">
                      🥤 Complete Your Order (1-Tap Add)
                    </span>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {QUICK_PAIRINGS.map((item) => {
                        const prod = getProduct(item.id)
                        if (!prod) return null
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => add(prod)}
                            className="flex items-center justify-between rounded-xl border border-ink/10 bg-white p-2.5 text-left transition hover:border-amber-400 hover:bg-amber-50/40 shadow-xs"
                          >
                            <div className="min-w-0 pr-1">
                              <p className="font-body text-[11px] font-bold text-ink truncate">{item.icon} {item.name}</p>
                              <p className="font-body text-[10px] text-amber-700 font-bold">{gbp(item.price)}</p>
                            </div>
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-xs font-black text-ink shrink-0">
                              +
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Promo Code Input */}
                  <div className="rounded-2xl border border-ink/10 bg-paper/60 p-4">
                    <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink">
                      🎁 First-Time Voucher Code
                    </span>
                    {promoCode ? (
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-300 p-2.5">
                        <span className="font-body text-xs font-bold text-emerald-800">
                          ✓ Code &quot;{promoCode}&quot; Applied (-{gbp(discount)})
                        </span>
                        <button
                          type="button"
                          onClick={removePromo}
                          className="font-body text-[10px] font-bold text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={inputCode}
                          onChange={(e) => { setInputCode(e.target.value); setPromoError(null) }}
                          placeholder="e.g. FIRSTSPUD"
                          className="flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs uppercase text-ink placeholder:normal-case focus:border-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          className="rounded-xl bg-ink px-4 py-2 font-body text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-700"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                    {promoError && (
                      <p className="mt-1.5 font-body text-[10px] text-red-500">{promoError}</p>
                    )}
                  </div>

                  {/* Kitchen Special Notes */}
                  <div className="rounded-2xl border border-ink/10 bg-paper/60 p-4">
                    <label htmlFor="kitchen-notes" className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink">
                      📝 Kitchen or Allergen Notes
                    </label>
                    <textarea
                      id="kitchen-notes"
                      rows={2}
                      value={kitchenNotes}
                      onChange={(e) => setKitchenNotes(e.target.value)}
                      placeholder="e.g. Extra crispy skin, butter on the side, allergies..."
                      className="mt-2 w-full rounded-xl border border-ink/15 bg-white p-2.5 font-body text-xs text-ink placeholder:text-steel focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Delivery Partner Apps Pill */}
                  <div className="rounded-2xl border border-ink/8 bg-paper/40 p-3 text-center">
                    <p className="font-body text-[10px] text-slate-500">
                      Also available on <strong>Deliveroo</strong>, <strong>Uber Eats</strong>, and <strong>Just Eat</strong>
                    </p>
                  </div>
                </div>

                {/* Footer / Checkout */}
                <footer className="border-t border-ink/10 bg-white px-6 py-5 shadow-2xl">
                  <div className="space-y-1.5 text-xs font-body">
                    <div className="flex justify-between text-steel">
                      <span>Items Subtotal</span>
                      <span>{gbp(rawSubtotal)}</span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>First Visit Discount</span>
                        <span>-{gbp(discount)}</span>
                      </div>
                    )}

                    {fulfilment === 'delivery' && (
                      <div className="flex justify-between text-ink font-medium">
                        <span>Delivery Fee</span>
                        <span className={deliveryFee === 0 ? 'text-emerald-600 font-bold' : ''}>
                          {deliveryFee === 0 ? 'FREE' : gbp(deliveryFee)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-baseline justify-between pt-1 border-t border-ink/8">
                      <div>
                        <span className="font-bold uppercase tracking-wider text-ink text-sm">Total</span>
                        <span className="ml-2 font-body text-[10px] text-slate-500">
                          ({fulfilment === 'delivery' ? 'Home Delivery' : 'Pick Up'})
                        </span>
                      </div>
                      <span className="display text-3xl text-ink font-bold">{gbp(finalTotal)}</span>
                    </div>
                  </div>

                  {/* Direct Ordering Savings Callout */}
                  <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-50/70 p-2.5 text-center">
                    <p className="font-body text-[10px] text-emerald-900 font-medium">
                      🏷️ <strong className="font-bold text-emerald-950">Direct Savings:</strong> Save up to £2.50 vs Deliveroo/Uber Eats with 0% aggregator markup!
                    </p>
                  </div>

                  {/* Delivery Boundary / Minimum Order Warnings */}
                  {fulfilment === 'delivery' && !isMinOrderMet && (
                    <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-amber-900 text-xs font-body">
                      <p className="font-bold">⚠️ Min. Delivery is {gbp(minOrderPence)}</p>
                      <p className="text-[10px] mt-0.5 text-amber-800">
                        Add {gbp(minOrderPence - rawSubtotal)} more for home delivery, or switch to Store Pick Up.
                      </p>
                    </div>
                  )}

                  {fulfilment === 'delivery' && !postcodeValidation.canDeliver && (
                    <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-amber-900 text-xs font-body">
                      <p className="font-bold">📍 Outside Delivery Area</p>
                      <p className="text-[10px] mt-0.5 text-amber-800">
                        We deliver to Aylesbury postcodes (HP17-HP22). Switch to Store Pick Up to order!
                      </p>
                    </div>
                  )}

                  {(storeStatus.isKitchenPaused || kitchenPause.isPaused) && !isScheduled && (
                    <div className="mt-2.5 rounded-2xl border border-rose-400 bg-rose-950 p-3 text-xs font-body shadow-sm text-rose-100">
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <span>⏸️ Live Orders Temporarily Paused</span>
                      </p>
                      <p className="text-[11px] mt-1 text-white/85 leading-snug">
                        {storeStatus.pauseReason || 'Staff have temporarily paused instant live orders to catch up with tickets.'}
                        {storeStatus.pauseResumeTime ? ` Auto-resumes at ~${storeStatus.pauseResumeTime}.` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTimingMode('scheduled')}
                        className="mt-2 text-[11px] font-bold text-amber-300 underline hover:text-amber-200"
                      >
                        📅 Tap here to select a scheduled pre-order time slot →
                      </button>
                    </div>
                  )}

                  {!storeStatus.isOpen && !storeStatus.isKitchenPaused && !kitchenPause.isPaused && !isScheduled && (
                    <div className="mt-2.5 rounded-2xl border border-amber-400 bg-amber-950 p-3 text-xs font-body shadow-sm text-amber-100">
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <span>🌙 Ordering Hours: 11am – 10pm</span>
                      </p>
                      <p className="text-[11px] mt-1 text-white/85 leading-snug">
                        {storeStatus.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTimingMode('scheduled')}
                        className="mt-2 text-[11px] font-bold text-amber-300 underline hover:text-amber-200"
                      >
                        📅 Tap here to schedule a pre-order slot (11am – 10pm) →
                      </button>
                    </div>
                  )}

                  {!isOnlineOrderingEnabled && (
                    <div className="mt-2.5 rounded-2xl border border-amber-400/40 bg-amber-950 p-3 text-xs font-body shadow-sm text-amber-100">
                      <p className="font-bold text-amber-300 flex items-center gap-1.5">
                        <span>📢 {orderingPausedTitle}</span>
                      </p>
                      <p className="text-[11px] mt-1 text-white/90 leading-snug">
                        {orderingPausedMessage}
                      </p>
                      <button
                        type="button"
                        onClick={() => setPausedModalOpen(true)}
                        className="mt-2 text-[11px] font-bold text-amber-300 underline hover:text-amber-200"
                      >
                        📍 View Store Location &amp; Hours →
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!isOnlineOrderingEnabled) {
                        setPausedModalOpen(true)
                        return
                      }
                      if ((storeStatus.isKitchenPaused || kitchenPause.isPaused) && !isScheduled) {
                        setTimingMode('scheduled')
                      }
                      checkout()
                    }}
                    disabled={
                      isOnlineOrderingEnabled && fulfilment === 'delivery' && (!isMinOrderMet || !postcodeValidation.canDeliver)
                    }
                    className="mt-4 w-full rounded-full bg-amber-400 py-4 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-ink shadow-glow transition-all duration-300 hover:bg-amber-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {!isOnlineOrderingEnabled
                      ? '📢 Online Ordering Launching Soon →'
                      : fulfilment === 'delivery' && !isMinOrderMet
                      ? `Add ${gbp(minOrderPence - rawSubtotal)} to Deliver`
                      : fulfilment === 'delivery' && !postcodeValidation.canDeliver
                      ? 'Switch to Store Pick Up'
                      : (storeStatus.isKitchenPaused || kitchenPause.isPaused) && !isScheduled
                      ? '📅 Schedule Pre-Order Slot'
                      : !storeStatus.isOpen && !isScheduled
                      ? '📅 Pick Scheduled Time Slot'
                      : `Proceed to Checkout (${gbp(finalTotal)}) →`}
                  </button>
                </footer>
              </>
            )}
          </motion.aside>
        </div>
      )}
      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setCheckoutOpen(false)} />
      <OnlineOrderingPausedModal
        isOpen={isPausedModalOpen}
        onClose={() => setPausedModalOpen(false)}
        title={orderingPausedTitle}
        message={orderingPausedMessage}
      />
    </AnimatePresence>
  )
}

