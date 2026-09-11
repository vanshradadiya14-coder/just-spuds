import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Reveal from './Reveal'
import Backdrop from './Backdrop'
import FulfillmentSwitcher from './FulfillmentSwitcher'
import SmartImage from './SmartImage'
import {
  CHEF_PRESETS, NUTRITION_MAP, MEAL_DEAL,
  optionLabel, optionPrice, extrasFor, type CategoryId, type Product, FRESH_SALAD_OPTIONS,
} from '../data/menu'
import { getOnlineProducts, getProductById, getSauces, isProductSoldOut, subscribeMenu } from '../services/menuStore'
import { useCart } from '../hooks/useCart'
import { subscribeStock } from '../services/orderStore'
import { cx, gbp } from '../utils/format'

const ease = [0.16, 1, 0.3, 1] as const

const BUILD_CATEGORIES = [
  { id: 'SPUDS' as CategoryId, label: 'Jacket Spuds', icon: '🥔' },
  { id: 'WRAPS' as CategoryId, label: 'Toasted Wraps', icon: '🌯' },
  { id: 'RICE_BOXES' as CategoryId, label: 'Rice Boxes', icon: '🍚' },
  { id: 'BAGUETTES' as CategoryId, label: 'Baguettes', icon: '🥖' },
  { id: 'PANINIS' as CategoryId, label: 'Paninis', icon: '🥪' },
  { id: 'SALADS' as CategoryId, label: 'Salad Bowls', icon: '🥗' },
]

export default function Builder({ embedded = false }: { embedded?: boolean } = {}) {
  const [allProducts, setAllProducts] = useState<Product[]>(() => getOnlineProducts())
  const [activeCategory, setActiveCategory] = useState<CategoryId>('SPUDS')
  const [baseId, setBaseId] = useState(() => getOnlineProducts().filter((p) => p.category === 'SPUDS')[0]?.id || 'classic-cheddar-beans')
  const [extras, setExtras] = useState<string[]>([])
  const [salads, setSalads] = useState<string[]>([])
  const [sauces, setSauces] = useState<string[]>([])
  const [meal, setMeal] = useState(false)
  const [mealDrink, setMealDrink] = useState<string>(MEAL_DEAL.drinkOptions[0].id)
  const [mealSnack, setMealSnack] = useState<string>(MEAL_DEAL.snackOptions[0].id)
  const [notes, setNotes] = useState('')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const { add, open, fulfilment } = useCart()

  // Sauces come from menuStore, not the static SAUCES array, so an admin-added
  // sauce shows up here too. ItemModal already did this; the builder and product
  // page didn't, so the three surfaces disagreed about what was on offer.
  const [availableSauces, setAvailableSauces] = useState(() => getSauces())

  useEffect(() => {
    const unsub = subscribeMenu(() => {
      setAllProducts(getOnlineProducts())
      setAvailableSauces(getSauces())
    })
    return unsub
  }, [])

  // Live stock rather than an inline read, so a 86'd base disables the add button
  // while the builder is open.
  const [stockMap, setStockMap] = useState<Record<string, boolean>>({})
  useEffect(() => subscribeStock(setStockMap), [])

  const currentProducts = useMemo(() => {
    return allProducts.filter((p) => p.category === activeCategory)
  }, [allProducts, activeCategory])

  const base = getProductById(baseId) || currentProducts[0] || allProducts[0]
  const isOutOfStock = base ? isProductSoldOut(base, stockMap) : false
  const availableExtras = base ? extrasFor(base) : []
  const included = base ? base.baseToppings.filter((t) => t !== 'butter' && t !== 'spud-sauce') : []
  const total = (base?.price || 545) + extras.reduce((n, id) => n + optionPrice(id, base?.category || 'SPUDS'), 0) + (meal ? MEAL_DEAL.price : 0)

  // Live Deep Nutrition & Macro Engine
  const liveNutrition = useMemo(() => {
    let cal = base.calories ?? 450
    let prot = parseInt(base.protein?.replace(/\D/g, '') ?? '18', 10)
    let carb = parseInt(base.carbs?.replace(/\D/g, '') ?? '65', 10)
    let fat = parseInt(base.fat?.replace(/\D/g, '') ?? '15', 10)

    extras.forEach((extId) => {
      const extraNut = NUTRITION_MAP[extId]
      if (extraNut) {
        cal += extraNut.calories
        prot += extraNut.protein
        carb += extraNut.carbs
        fat += extraNut.fat
      }
    })

    sauces.forEach((sId) => {
      const sObj = availableSauces.find((s) => s.id === sId)
      if (sObj) {
        cal += sObj.calories ?? 25
        prot += sObj.protein ?? 0
        carb += sObj.carbs ?? 2
        fat += sObj.fat ?? 1
      }
    })

    if (meal) {
      cal += 150
      carb += 35
    }

    const totalMacros = Math.max(1, prot + carb + fat)
    const protPct = Math.round((prot / totalMacros) * 100)
    const carbPct = Math.round((carb / totalMacros) * 100)
    const fatPct = Math.round((fat / totalMacros) * 100)

    // Dynamic dietary tags detection
    const dynamicTags: string[] = []
    if (prot >= 28) dynamicTags.push('High Protein 💪')
    if (base.glutenFree && !extras.includes('crispy-onions')) dynamicTags.push('Gluten-Free 🌾')
    if (base.vegetarian && !extras.some((e) => e.includes('chicken') || e.includes('tuna') || e.includes('chilli'))) {
      dynamicTags.push('Vegetarian 🌿')
    }
    if (cal < 500) dynamicTags.push('Under 500 kcal 🥗')

    return { cal, prot, carb, fat, protPct, carbPct, fatPct, dynamicTags }
  }, [base, extras, sauces, meal])

  const markers = useMemo(() => {
    const all = [...extras]
    return all.map((id, i) => ({
      id,
      top: `${16 + i * 13}%`,
    }))
  }, [extras])

  const handleCategoryChange = (cat: CategoryId) => {
    setActiveCategory(cat)
    setActivePreset(null)
    setExtras([])
    setSalads([])
    setSauces([])
    const prods = allProducts.filter((p) => p.category === cat)
    if (prods.length > 0) setBaseId(prods[0].id)
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    setActivePreset(null)
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const categoryPresets = useMemo(() => {
    return CHEF_PRESETS.filter((p) => (p.category ?? 'SPUDS') === activeCategory)
  }, [activeCategory])

  const loadPreset = (presetId: string) => {
    const p = CHEF_PRESETS.find((x) => x.id === presetId)
    if (!p) return
    const targetCat = p.category ?? 'SPUDS'
    setActiveCategory(targetCat)
    setActivePreset(p.id)
    setBaseId(p.baseId)
    setExtras(p.extras)
    setSauces(p.sauces)
  }

  const baseNoun =
    activeCategory === 'SPUDS' ? 'jacket spud' :
    activeCategory === 'WRAPS' ? 'toasted wrap' :
    activeCategory === 'RICE_BOXES' ? 'rice box' :
    activeCategory === 'BAGUETTES' ? 'crusty baguette' :
    activeCategory === 'PANINIS' ? 'pressed panini' : 'salad bowl'

  return (
    <section id="build" className={`on-dark relative overflow-hidden bg-ink-stock ${embedded ? "pb-24 pt-10 sm:pb-32" : "py-20 sm:py-32"}`}>
      <Backdrop tone="dark" grid={false} spotlight intensity={0.9} />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        {!embedded && (
          <Reveal>
            <div className="flex flex-col gap-4 border-b border-white/12 pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  <span>⚡</span>
                  <span>Custom Meal Lab</span>
                </span>
                <h2 className="mt-3 display display-tight text-5xl text-white sm:text-7xl">
                  Build Your Meal
                  <span className="block italic text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-500">
                    topped &amp; tailored your way
                  </span>
                </h2>
              </div>
              <p className="max-w-md font-body text-[14px] leading-relaxed text-white/70">
                Fresh British potatoes, toasted tikka wraps, fragrant rice boxes, crusty baguettes or paninis. Watch live macros &amp; nutrition update in real time.
              </p>
            </div>
          </Reveal>
        )}

        {/* Category Tabs: Spuds, Wraps, Rice Boxes, Baguettes, Paninis, Salads */}
        <div className="mt-8 flex flex-wrap items-center gap-2 sm:gap-3">
          {BUILD_CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-body text-[12px] font-bold uppercase tracking-wider transition-all duration-300',
                  active
                    ? 'bg-amber-400 text-ink shadow-glow scale-105 font-black'
                    : 'border border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.10] hover:text-white'
                )}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            )
          })}
        </div>

        {/* Chef's Signature Quick Presets */}
        {categoryPresets.length > 0 && (
          <div className="mt-8">
            <p className="font-body text-[11px] font-bold uppercase tracking-wider text-amber-400">
              ⚡ Quick-Load Chef Presets:
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categoryPresets.map((preset) => {
                const active = activePreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => loadPreset(preset.id)}
                    className={cx(
                      'flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-300',
                      active
                        ? 'border-amber-400 bg-amber-500/20 text-white shadow-glow'
                        : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/30 hover:bg-white/[0.06]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[13px] font-bold text-white">{preset.name}</span>
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-body text-[9px] font-bold uppercase text-amber-300">
                        {preset.badge}
                      </span>
                    </div>
                    <p className="mt-2 font-body text-[11px] leading-snug text-white/60">
                      {preset.tagline}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Photo + Markers + Live Macro & Nutrition Engine */}
          <div className="lg:sticky lg:top-28 lg:self-start space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={base.id}
                  initial={{ opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease }}
                  className="absolute inset-0"
                >
                  <SmartImage
                    src={base.image}
                    alt={base.name}
                    fallbackLabel={base.name}
                    className="h-full w-full"
                    imgClassName=""
                  />
                </motion.div>
              </AnimatePresence>

              {/* Added extras dock around the edge */}
              <AnimatePresence>
                {markers.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: 26 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 26 }}
                    transition={{ duration: 0.45, ease }}
                    className="absolute right-4 flex items-center gap-2.5 z-20"
                    style={{ top: m.top }}
                  >
                    <span className="h-px w-5 bg-amber-400" />
                    <span className="rounded-full border border-amber-400/40 bg-ink/90 px-3.5 py-1.5 font-body text-[10px] font-bold uppercase tracking-wider text-amber-300 shadow-lg backdrop-blur-md">
                      + {optionLabel(m.id)}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>

              {included.length > 0 && (
                <div className="absolute bottom-4 left-4 max-w-[65%] rounded-2xl border border-white/10 bg-ink/85 p-3 backdrop-blur-md">
                  <span className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-amber-400">
                    Included in Base
                  </span>
                  <p className="mt-0.5 font-body text-[11px] leading-snug text-white/80">
                    {included.map(optionLabel).join(' · ')}
                  </p>
                </div>
              )}

              {/* Dynamic Dietary Tags Pill */}
              <div className="absolute top-4 left-4 flex flex-wrap gap-1.5 max-w-[70%]">
                {liveNutrition.dynamicTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/20 bg-ink/85 px-2.5 py-1 font-body text-[10px] font-bold text-amber-300 shadow-md backdrop-blur-md"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Sweetgreen-Grade Live Nutrition & Macro Dashboard */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-body text-[11px] font-bold uppercase tracking-wider text-white/70">
                  ⚡ Live Nutrition &amp; Macro Engine
                </span>
                <span className="font-body text-[14px] font-black text-amber-400">
                  {liveNutrition.cal} kcal
                </span>
              </div>

              {/* Macro Meters */}
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="font-body text-[10px] font-semibold text-white/50 uppercase">Protein</p>
                  <p className="mt-1 font-body text-[16px] font-black text-emerald-400">{liveNutrition.prot}g</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${Math.min(100, liveNutrition.prot * 2.5)}%` }} />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="font-body text-[10px] font-semibold text-white/50 uppercase">Carbs</p>
                  <p className="mt-1 font-body text-[16px] font-black text-amber-300">{liveNutrition.carb}g</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${Math.min(100, liveNutrition.carb)}%` }} />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="font-body text-[10px] font-semibold text-white/50 uppercase">Fat</p>
                  <p className="mt-1 font-body text-[16px] font-black text-rose-400">{liveNutrition.fat}g</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-rose-400 transition-all duration-300" style={{ width: `${Math.min(100, liveNutrition.fat * 3)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Customizer Controls */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 backdrop-blur-sm shadow-2xl">
            <Step n="1" label={`Choose your ${baseNoun} base`} />
            <ul className="mt-4 divide-y divide-white/8 border-y border-white/8 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
              {currentProducts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { setBaseId(p.id); setExtras([]); setActivePreset(null) }}
                    aria-pressed={baseId === p.id}
                    className="group flex w-full items-baseline py-3.5 text-left transition"
                  >
                    <span className={cx('grid h-4 w-4 shrink-0 translate-y-0.5 place-items-center rounded-full border transition-colors duration-300', baseId === p.id ? 'border-amber-400 bg-amber-400' : 'border-white/30')}>
                      {baseId === p.id && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                    </span>
                    <div className="ml-3 flex flex-col">
                      <span className={cx('font-body text-[14px] font-semibold transition-colors', baseId === p.id ? 'text-amber-300 font-bold' : 'text-white/80 group-hover:text-white')}>
                        {p.name}
                      </span>
                      <span className="font-body text-[10px] text-white/50">
                        {p.calories} kcal &bull; {p.protein} protein
                      </span>
                    </div>
                    <span className="leader text-white/20" />
                    <span className={cx('shrink-0 font-body text-[13px] tabular-nums font-semibold', baseId === p.id ? 'text-white' : 'text-white/45')}>
                      {gbp(p.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {availableExtras.length > 0 && (
              <div className="mt-8">
                <Step n="2" label="Add delicious extras & melts" hint="Slow cooked & freshly grated" />
                <ul className="mt-4 grid grid-cols-2 gap-2.5">
                  {availableExtras.map((t) => {
                    const already = base.baseToppings.includes(t.id)
                    const on = extras.includes(t.id)
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => toggle(extras, setExtras, t.id)}
                          aria-pressed={on}
                          className={cx(
                            'flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-35',
                            on ? 'border-amber-400 bg-amber-500 text-ink font-bold shadow-glow scale-[1.02]' : 'border-white/15 bg-white/[0.03] text-white/80 hover:border-white/40',
                          )}
                        >
                          <div>
                            <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em]">{t.label}</p>
                            {t.calories && (
                              <p className={cx("font-body text-[9px]", on ? "text-ink/80" : "text-white/50")}>
                                +{t.calories} kcal &bull; +{t.protein}g protein
                              </p>
                            )}
                          </div>
                          <span className={cx('font-body text-[11px] tabular-nums shrink-0', on ? 'text-ink font-black' : 'text-amber-400/90')}>
                            {already ? '✓ in base' : `+${gbp(t.price)}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Step: Fresh Salad Selection */}
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <Step n={availableExtras.length > 0 ? "3" : "2"} label="Pick fresh salad fillings" hint="Freshly cut daily · Free" />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSalads(FRESH_SALAD_OPTIONS.map((s) => s.id))}
                    className="rounded-full bg-emerald-500 px-3 py-1 font-body text-[10px] font-bold text-white hover:bg-emerald-400 transition"
                  >
                    All Salads 🥗
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalads([])}
                    className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-body text-[10px] font-bold text-white/70 hover:bg-white/10 transition"
                  >
                    No Salad ✕
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FRESH_SALAD_OPTIONS.map((s) => {
                  const on = salads.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(salads, setSalads, s.id)}
                      className={cx(
                        'flex items-center justify-between rounded-xl border p-2.5 text-left font-body text-[11px] font-bold transition-all',
                        on
                          ? 'border-emerald-400 bg-emerald-500 text-white shadow-glow scale-[1.02]'
                          : 'border-white/15 bg-white/[0.03] text-white/80 hover:border-white/30'
                      )}
                    >
                      <span className="truncate">{on ? '✓ ' : '+ '}{s.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-8">
              <Step n={availableExtras.length > 0 ? "4" : "3"} label="Pick signature sauces & dressings" hint="Always complimentary" />
              <div className="mt-4 flex flex-wrap gap-2">
                {availableSauces.map((s) => {
                  const on = sauces.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(sauces, setSauces, s.id)}
                      aria-pressed={on}
                      className={cx(
                        'rounded-full border px-4 py-2 font-body text-[11px] font-bold uppercase tracking-[0.08em] transition-all duration-300',
                        on ? 'border-amber-400 bg-amber-400 text-ink font-black shadow-glow scale-105' : 'border-white/15 bg-white/[0.02] text-white/75 hover:border-white/40',
                      )}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step: Meal Deal Upgrade */}
            <div className="mt-8">
              <Step n={availableExtras.length > 0 ? "4" : "3"} label="Make it a Meal Deal" hint="+£1.95 · Save £1.50" />
              <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 sm:p-5">
                <label className="flex cursor-pointer items-start gap-3.5">
                  <input
                    type="checkbox"
                    checked={meal}
                    onChange={(e) => setMeal(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded accent-amber-400"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[13px] font-bold uppercase tracking-wider text-amber-300">
                        {MEAL_DEAL.label} (+{gbp(MEAL_DEAL.price)})
                      </span>
                      <span className="rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-[10px] font-black text-ink">
                        {MEAL_DEAL.saving}
                      </span>
                    </div>
                    <p className="mt-1 font-body text-[12px] text-white/75 leading-snug">
                      {MEAL_DEAL.detail}. <span className="text-amber-300 font-semibold">({MEAL_DEAL.exclusions})</span>
                    </p>
                  </div>
                </label>

                {meal && (
                  <div className="mt-5 space-y-4 border-t border-white/15 pt-4">
                    {/* Drink Selector */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                          <span>🥤</span> 1. Pick Your Can of Drink:
                        </span>
                        <span className="font-body text-[10px] text-white/60">
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
                                  ? 'border-amber-400 bg-amber-400 text-ink shadow-glow font-black'
                                  : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/30'
                              )}
                            >
                              {isSelected ? '✓ ' : ''}{drink.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Snack Selector */}
                    <div>
                      <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <span>🥨</span> 2. Pick Your Crisps or Chocolate:
                      </span>
                      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1 no-scrollbar">
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
                                  ? 'border-amber-400 bg-amber-400 text-ink shadow-glow font-black'
                                  : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/30'
                              )}
                            >
                              <span className="truncate pr-1">
                                {isSelected ? '✓ ' : ''}{snack.name}
                              </span>
                              <span className={cx('text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0 font-semibold', isSelected ? 'bg-ink text-white' : 'bg-white/10 text-white/70')}>
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
            </div>

            {/* Special Instructions */}
            <div className="mt-8">
              <label htmlFor="builder-notes" className="block font-body text-[11px] font-bold uppercase tracking-wider text-white/50">
                Special Instructions / Allergen Requests
              </label>
              <input
                id="builder-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Extra crispy skin, sauce on the side..."
                className="mt-2 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 font-body text-[13px] text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
              />
            </div>

            {/* Fulfillment choice & Total summary with Add button */}
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="border-b border-white/10 pb-4 mb-4">
                <FulfillmentSwitcher variant="expanded" showTiming={true} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-body text-[10px] font-bold uppercase tracking-wider text-white/50">Your Custom Total</p>
                  <p className="display text-3xl text-amber-400">{gbp(total)}</p>
                </div>

                <div className="flex items-center gap-3">
                  {(extras.length > 0 || sauces.length > 0 || meal) && (
                    <button
                      type="button"
                      onClick={() => { setExtras([]); setSauces([]); setMeal(false); setNotes(''); setActivePreset(null) }}
                      className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 transition hover:text-white"
                    >
                      Reset
                    </button>
                  )}
                  {isOutOfStock ? (
                    <div className="rounded-full bg-red-500/20 border border-red-400/50 px-8 py-4 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-red-300">
                      {base.name} is sold out today ✕
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        add(base, {
                          extras,
                          salads,
                          sauces,
                          meal,
                          mealDrink: meal ? mealDrink : undefined,
                          mealSnack: meal ? mealSnack : undefined,
                          notes: notes.trim() || undefined,
                        })
                        open()
                      }}
                      className="group relative overflow-hidden rounded-full bg-amber-400 px-8 py-4 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-ink shadow-glow transition-all duration-300 hover:bg-amber-300 hover:scale-105"
                    >
                      <span className="relative z-10 font-black">
                        {fulfilment === 'delivery' ? `🛵 Add for Delivery · ${gbp(total)} →` : `🛍️ Add for Pick Up · ${gbp(total)} →`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Step({ n, label, hint }: { n: string; label: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-500/20 font-body text-[11px] font-bold text-amber-400">
        {n}
      </span>
      <span className="label text-white/90">{label}</span>
      {hint && <span className="font-body text-[10px] text-amber-400/80 font-semibold">— {hint}</span>}
    </div>
  )
}
