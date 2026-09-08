import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SmartImage from './SmartImage'
import {
  type Product, MEAL_DEAL, extrasFor, optionPrice, NUTRITION_MAP, FRESH_SALAD_OPTIONS,
} from '../data/menu'
import { getSauces, isProductSoldOut, subscribeMenu } from '../services/menuStore'
import { useCart } from '../hooks/useCart'
import { subscribeStock } from '../services/orderStore'
import { cx, gbp } from '../utils/format'

interface ItemModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

export default function ItemModal({ product, isOpen, onClose }: ItemModalProps) {
  const { add, open, fulfilment, setFulfilment, storeStatus, kitchenPause, isScheduled } = useCart()

  const [availableSauces, setAvailableSauces] = useState(() => getSauces())
  const [extras, setExtras] = useState<string[]>([])
  const [salads, setSalads] = useState<string[]>([])
  const [sauces, setSauces] = useState<string[]>([])
  const [meal, setMeal] = useState(false)
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    return subscribeMenu(() => {
      setAvailableSauces(getSauces())
    })
  }, [])

  // Live stock, so an item 86'd while this modal is open flips to "Sold Out"
  // instead of staying addable.
  const [stockMap, setStockMap] = useState<Record<string, boolean>>({})
  useEffect(() => subscribeStock(setStockMap), [])

  const [mealDrink, setMealDrink] = useState<string>(MEAL_DEAL.drinkOptions[0].id)
  const [mealSnack, setMealSnack] = useState<string>(MEAL_DEAL.snackOptions[0].id)

  // Reset state when product changes
  useEffect(() => {
    if (product) {
      setExtras([])
      setSalads([])
      setSauces([])
      setMeal(false)
      setMealDrink(MEAL_DEAL.drinkOptions[0].id)
      setMealSnack(MEAL_DEAL.snackOptions[0].id)
      setQty(1)
      setNotes('')
    }
  }, [product])

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const availableExtras = product ? extrasFor(product) : []

  // Dynamic nutrition calculation
  const liveMacros = useMemo(() => {
    if (!product) return { cal: 0, prot: 0, carb: 0, fat: 0 }
    let cal = product.calories ?? 450
    let prot = parseInt(product.protein?.replace(/\D/g, '') ?? '20', 10)
    let carb = parseInt(product.carbs?.replace(/\D/g, '') ?? '60', 10)
    let fat = parseInt(product.fat?.replace(/\D/g, '') ?? '15', 10)

    extras.forEach((extId) => {
      const extraNut = NUTRITION_MAP[extId]
      if (extraNut) {
        cal += extraNut.calories
        prot += extraNut.protein
        carb += extraNut.carbs
        fat += extraNut.fat
      }
    })

    if (meal) {
      cal += 150
      carb += 35
    }

    return { cal, prot, carb, fat }
  }, [product, extras, meal])

  if (!product) return null

  const unitPrice =
    product.price +
    extras.reduce((n, x) => n + optionPrice(x, product.category), 0) +
    (meal ? MEAL_DEAL.price : 0)

  const totalPrice = unitPrice * qty

  const toggleExtra = (id: string) => {
    setExtras((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSalad = (id: string) => {
    setSalads((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSauce = (id: string) => {
    setSauces((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleAddToCart = () => {
    add(product, {
      extras,
      salads,
      sauces,
      meal,
      mealDrink: meal ? mealDrink : undefined,
      mealSnack: meal ? mealSnack : undefined,
      notes: notes.trim() || undefined,
      qty,
    })
    onClose()
    open()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white text-ink shadow-2xl z-10 my-auto max-h-[92vh] flex flex-col"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink shadow-md backdrop-blur-md transition hover:bg-white hover:scale-105"
              aria-label="Close dialog"
            >
              ✕
            </button>

            {/* Scrollable Content Area */}
            <div className="overflow-y-auto flex-1 no-scrollbar">
              {/* Product Header Image */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-paper">
                <SmartImage
                  src={product.image}
                  alt={product.name}
                  fallbackLabel={product.name}
                  className="h-full w-full"
                  cover
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between text-white">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {product.vegetarian && (
                        <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 font-body text-[9px] font-bold uppercase text-white">
                          🌿 Vegetarian
                        </span>
                      )}
                      {product.glutenFree && (
                        <span className="rounded-full bg-amber-600 px-2.5 py-0.5 font-body text-[9px] font-bold uppercase text-white">
                          🌾 Gluten-Free
                        </span>
                      )}
                      <span className="rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-[9px] font-black uppercase text-ink">
                        {liveMacros.prot}g Protein
                      </span>
                      <span className="rounded-full bg-black/60 px-2.5 py-0.5 font-body text-[9px] font-bold text-white/90 backdrop-blur-sm">
                        ~{liveMacros.cal} kcal
                      </span>
                    </div>
                    <h2 className="display text-2xl sm:text-3xl text-white font-bold">
                      {product.name}
                    </h2>
                  </div>

                  <span className="font-body text-xl font-black text-amber-400 tabular-nums">
                    {gbp(product.price)}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Description */}
                <p className="font-body text-[14px] leading-relaxed text-slate-600">
                  {product.description}
                </p>

                {/* Allergen & Dietary Transparency Pill */}
                {product.allergens && product.allergens.length > 0 && (
                  <div className="rounded-2xl border border-amber-300/60 bg-amber-50/50 p-3.5 flex items-center justify-between text-xs font-body">
                    <span className="font-bold text-ink">⚠️ Contains Allergens:</span>
                    <span className="font-semibold text-amber-900">{product.allergens.join(', ')}</span>
                  </div>
                )}

                {/* Extras Selection */}
                {availableExtras.length > 0 && (
                  <fieldset className="rounded-2xl border border-ink/10 bg-paper/50 p-4">
                    <legend className="font-body text-[12px] font-bold uppercase tracking-wider text-ink">
                      Customize Your Extras &amp; Melts
                    </legend>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {availableExtras.map((t) => {
                        const already = product.baseToppings.includes(t.id)
                        const isSelected = extras.includes(t.id)
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={already}
                            onClick={() => toggleExtra(t.id)}
                            className={cx(
                              'flex items-center justify-between rounded-xl border p-3 text-left transition-all',
                              isSelected
                                ? 'border-amber-500 bg-amber-400 text-ink font-bold shadow-sm'
                                : 'border-ink/10 bg-white text-slate-700 hover:border-ink/30',
                              already && 'opacity-40 cursor-not-allowed'
                            )}
                          >
                            <span className="font-body text-[12px]">
                              {isSelected ? '✓ ' : '+ '}{t.label}
                            </span>
                            <span className={cx('font-body text-[11px] tabular-nums', isSelected ? 'text-ink font-black' : 'text-amber-700')}>
                              {already ? 'In Base' : `+${gbp(t.price)}`}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                {/* Fresh Salad Selection */}
                {['SPUDS', 'WRAPS', 'RICE_BOXES', 'BAGUETTES', 'PANINIS', 'SALADS'].includes(product.category) && (
                  <fieldset className="rounded-2xl border border-emerald-600/20 bg-emerald-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <legend className="font-body text-[12px] font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                        <span>🥗</span> Choose Fresh Salad Selection <span className="text-[10px] text-emerald-700 font-semibold normal-case">(Included Free)</span>
                      </legend>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSalads(FRESH_SALAD_OPTIONS.map((s) => s.id))}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 font-body text-[10px] font-bold text-white hover:bg-emerald-500 transition shadow-xs"
                        >
                          All Salads 🥗
                        </button>
                        <button
                          type="button"
                          onClick={() => setSalads([])}
                          className="rounded-lg border border-ink/10 bg-white px-2.5 py-1 font-body text-[10px] font-semibold text-slate-600 hover:bg-slate-100 transition shadow-xs"
                        >
                          No Salad ✕
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {FRESH_SALAD_OPTIONS.map((s) => {
                        const isSelected = salads.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleSalad(s.id)}
                            className={cx(
                              'flex items-center justify-between rounded-xl border p-2.5 text-left transition-all',
                              isSelected
                                ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-xs'
                                : 'border-ink/10 bg-white text-slate-700 hover:border-ink/30'
                            )}
                          >
                            <span className="font-body text-[11px] truncate">
                              {isSelected ? '✓ ' : '+ '}{s.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                {/* Signature Sauce Selection */}
                {product.sauces && (
                  <fieldset className="rounded-2xl border border-ink/10 bg-paper/50 p-4">
                    <legend className="font-body text-[12px] font-bold uppercase tracking-wider text-ink">
                      Choose Complimentary Sauces
                    </legend>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableSauces.map((s) => {
                        const isSelected = sauces.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleSauce(s.id)}
                            className={cx(
                              'rounded-full border px-3.5 py-1.5 font-body text-[11px] font-bold transition-all',
                              isSelected
                                ? 'border-amber-500 bg-amber-400 text-ink font-black shadow-sm'
                                : 'border-ink/15 bg-white text-slate-700 hover:border-ink/40'
                            )}
                          >
                            {isSelected ? `✓ ${s.label}` : s.label}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                {/* Meal Deal Upgrade Section */}
                {product.mealEligible && (
                  <div className="rounded-2xl border border-amber-400/80 bg-gradient-to-br from-amber-50/90 to-amber-100/40 p-4 shadow-sm space-y-4">
                    <label className="flex cursor-pointer items-start gap-3.5">
                      <input
                        type="checkbox"
                        checked={meal}
                        onChange={(e) => setMeal(e.target.checked)}
                        className="mt-1 h-5 w-5 rounded accent-amber-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-body text-[13px] font-black uppercase tracking-wider text-ink">
                            {MEAL_DEAL.label} (+{gbp(MEAL_DEAL.price)})
                          </span>
                          <span className="rounded-full bg-amber-500 px-2.5 py-0.5 font-body text-[10px] font-black text-ink shadow-sm">
                            {MEAL_DEAL.saving}
                          </span>
                        </div>
                        <p className="mt-1 font-body text-[12px] text-slate-700 leading-snug">
                          {MEAL_DEAL.detail}. <span className="font-semibold text-amber-900">({MEAL_DEAL.exclusions})</span>
                        </p>
                      </div>
                    </label>

                    {/* Expandable Drink & Snack Choice */}
                    {meal && (
                      <div className="mt-4 pt-4 border-t border-amber-200/80 space-y-4 animate-fadeIn">
                        {/* 1. Choose Can of Drink */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                              <span>🥤</span> 1. Select Can of Drink:
                            </span>
                            <span className="font-body text-[10px] font-semibold text-amber-800">
                              Excl. Red Bull &amp; Orange Juice
                            </span>
                          </div>
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {MEAL_DEAL.drinkOptions.map((drink) => {
                              const isSelected = mealDrink === drink.id
                              return (
                                <button
                                  key={drink.id}
                                  type="button"
                                  onClick={() => setMealDrink(drink.id)}
                                  className={cx(
                                    'rounded-xl border p-2.5 text-left font-body text-[11px] font-bold transition-all',
                                    isSelected
                                      ? 'border-amber-500 bg-amber-400 text-ink shadow-sm scale-[1.02]'
                                      : 'border-amber-300/60 bg-white text-slate-700 hover:border-amber-400'
                                  )}
                                >
                                  {isSelected ? '✓ ' : ''}{drink.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* 2. Choose Crisps or Chocolate */}
                        <div>
                          <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                            <span>🥨</span> 2. Select Crisps or Chocolate:
                          </span>
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-[190px] overflow-y-auto pr-1 no-scrollbar">
                            {MEAL_DEAL.snackOptions.map((snack) => {
                              const isSelected = mealSnack === snack.id
                              return (
                                <button
                                  key={snack.id}
                                  type="button"
                                  onClick={() => setMealSnack(snack.id)}
                                  className={cx(
                                    'flex items-center justify-between rounded-xl border p-2.5 text-left font-body text-[11px] font-bold transition-all',
                                    isSelected
                                      ? 'border-amber-500 bg-amber-400 text-ink shadow-sm scale-[1.02]'
                                      : 'border-amber-300/60 bg-white text-slate-700 hover:border-amber-400'
                                  )}
                                >
                                  <span className="truncate pr-1">
                                    {isSelected ? '✓ ' : ''}{snack.name}
                                  </span>
                                  <span className={cx('text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0 font-semibold', isSelected ? 'bg-ink text-white' : 'bg-amber-100 text-amber-900')}>
                                    {snack.type}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Fulfillment Selection (Pick Up vs Home Delivery) */}
                <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 p-3.5 space-y-2">
                  <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink">
                    How would you like to receive this order?
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFulfilment('pickup')}
                      className={cx(
                        'flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-left font-body text-xs font-bold transition-all',
                        fulfilment === 'pickup'
                          ? 'bg-amber-400 text-ink shadow-sm font-black scale-[1.01]'
                          : 'bg-white text-slate-700 hover:bg-amber-100/50 border border-ink/10'
                      )}
                    >
                      <span className="text-base">🛍️</span>
                      <div>
                        <p className="leading-tight">Store Pick Up</p>
                        <p className="text-[9px] font-normal text-slate-600">~15m &bull; Market Sq</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFulfilment('delivery')}
                      className={cx(
                        'flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-left font-body text-xs font-bold transition-all',
                        fulfilment === 'delivery'
                          ? 'bg-amber-400 text-ink shadow-sm font-black scale-[1.01]'
                          : 'bg-white text-slate-700 hover:bg-amber-100/50 border border-ink/10'
                      )}
                    >
                      <span className="text-base">🛵</span>
                      <div>
                        <p className="leading-tight">Home Delivery</p>
                        <p className="text-[9px] font-normal text-slate-600">25-35m &bull; Aylesbury</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Special Instructions */}
                <div>
                  <label htmlFor="notes" className="block font-body text-[11px] font-bold uppercase tracking-wider text-steel">
                    Special Instructions / Allergen Requests
                  </label>
                  <input
                    id="notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Extra crispy skin, sauce on the side..."
                    className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 font-body text-[13px] text-ink placeholder:text-steel focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Sticky Action Bar */}
            <div className="sticky bottom-0 shrink-0 z-30 border-t border-ink/10 bg-white p-4 sm:p-5 flex items-center gap-4 shadow-2xl">
              {/* Quantity Stepper */}
              <div className="flex items-center rounded-full border border-ink/20 bg-paper">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="grid h-11 w-11 place-items-center text-lg font-bold text-slate-600 hover:text-ink"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="min-w-7 text-center font-body text-sm font-bold tabular-nums">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  className="grid h-11 w-11 place-items-center text-lg font-bold text-slate-600 hover:text-ink"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              {/* Add To Cart Button */}
              {product && isProductSoldOut(product, stockMap) ? (
                <div className="flex-1 rounded-full bg-red-100 py-3.5 px-6 font-body text-xs font-bold uppercase tracking-wider text-red-700 text-center">
                  Sold Out Today ✕
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 rounded-full bg-amber-400 py-3.5 px-6 font-body text-[13px] font-black uppercase tracking-wider text-ink shadow-glow transition hover:bg-amber-300 active:scale-95 flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <span>
                      {(storeStatus.isKitchenPaused || kitchenPause.isPaused)
                        ? (fulfilment === 'delivery' ? '🛵 Add for Scheduled Delivery' : '🛍️ Add for Scheduled Pick Up')
                        : isScheduled
                        ? (fulfilment === 'delivery' ? '📅 Add for Scheduled Delivery' : '📅 Add for Scheduled Pick Up')
                        : (fulfilment === 'delivery' ? '🛵 Add for Delivery' : '🛍️ Add for Pick Up')}
                    </span>
                  </div>
                  <span className="tabular-nums font-black">{gbp(totalPrice)}</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
