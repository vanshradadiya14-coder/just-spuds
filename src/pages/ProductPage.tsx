import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import SmartImage from '../components/SmartImage'
import ProductStage from '../components/ProductStage'
import Reveal from '../components/Reveal'
import FulfillmentSwitcher from '../components/FulfillmentSwitcher'
import {
  MEAL_DEAL, extrasFor, optionPrice,
} from '../data/menu'
import { getOnlineProductById, getOnlineProducts, getSauces, isProductSoldOut, subscribeMenu } from '../services/menuStore'
import { useCart } from '../hooks/useCart'
import { cx, gbp } from '../utils/format'
import { subscribeStock } from '../services/orderStore'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(() => (id ? getOnlineProductById(id) : undefined))

  useDocumentMeta({
    title: product
      ? `${product.name} ${product.calories ? `(${product.calories} kcal, ` : '('}${gbp(product.price)})`
      : 'Product Details',
    description: product
      ? `Order ${product.name} from Just Spuds in Aylesbury. ${product.description} Fresh King Edward potato with custom extras.`
      : undefined,
  })

  // Sauces from menuStore rather than the static SAUCES array, so admin-added
  // sauces appear here as they already did in the item modal.
  const [availableSauces, setAvailableSauces] = useState(() => getSauces())

  useEffect(() => {
    setProduct(id ? getOnlineProductById(id) : undefined)
    return subscribeMenu(() => {
      setProduct(id ? getOnlineProductById(id) : undefined)
      setAvailableSauces(getSauces())
    })
  }, [id])

  // Subscribed rather than read inline during render, so a staff 86 reaches an
  // already-open product page instead of waiting for an unrelated re-render.
  const [stockMap, setStockMap] = useState<Record<string, boolean>>({})
  useEffect(() => subscribeStock(setStockMap), [])
  const isOutOfStock = product ? isProductSoldOut(product, stockMap) : false
  const { add, open, fulfilment, storeStatus, kitchenPause, isScheduled } = useCart()

  const [extras, setExtras] = useState<string[]>([])
  const [sauces, setSauces] = useState<string[]>([])
  const [meal, setMeal] = useState(false)
  const [mealDrink, setMealDrink] = useState<string>(MEAL_DEAL.drinkOptions[0].id)
  const [mealSnack, setMealSnack] = useState<string>(MEAL_DEAL.snackOptions[0].id)
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setExtras([])
    setSauces([])
    setMeal(false)
    setMealDrink(MEAL_DEAL.drinkOptions[0].id)
    setMealSnack(MEAL_DEAL.snackOptions[0].id)
    setQty(1)
    setNotes('')
  }, [id])

  if (!product) {
    return (
      <div className="bg-stock px-5 pb-32 pt-[160px] text-center">
        <p className="display text-4xl text-ink">We can&rsquo;t find that one</p>
        <Link to="/menu" className="ul-draw mt-6 inline-block font-body text-[11px] font-bold uppercase tracking-[0.16em] text-ink">
          Back to the menu
        </Link>
      </div>
    )
  }

  const available = extrasFor(product)
  const unit =
    product.price +
    extras.reduce((n, x) => n + optionPrice(x, product.category), 0) +
    (meal ? MEAL_DEAL.price : 0)

  const related = getOnlineProducts().filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4)
  const toggle = (list: string[], set: (v: string[]) => void, x: string) =>
    set(list.includes(x) ? list.filter((i) => i !== x) : [...list, x])

  return (
    <>
      <div className="bg-stock pb-24 pt-[104px] sm:pt-[124px]">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <nav className="flex items-center gap-2 font-body text-[11px] text-steel" aria-label="Breadcrumb">
            <Link to="/menu" className="ul-draw hover:text-ink">Menu</Link>
            <span aria-hidden>/</span>
            <span className="text-ink">{product.name}</span>
          </nav>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              {/* Parallax off: this stage sits mid-page, so scroll-linked
                  recession would be keyed to the wrong origin. */}
              <ProductStage
                src={product.image}
                alt={product.name}
                tone="light"
                parallax={false}
                className="mx-auto w-[86%] max-w-[560px] lg:w-full lg:max-w-none"
              />
            </div>

            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {product.vegetarian && (
                      <span className="rounded-full bg-emerald-600 px-3 py-1 font-body text-[10px] font-bold uppercase text-white shadow-sm">
                        🌿 Vegetarian
                      </span>
                    )}
                    {product.protein && (
                      <span className="rounded-full bg-ink px-3 py-1 font-body text-[10px] font-bold uppercase text-amber-300">
                        {product.protein} Protein
                      </span>
                    )}
                    {product.calories && (
                      <span className="rounded-full border border-ink/15 bg-white px-3 py-1 font-body text-[10px] font-bold text-steel">
                        ~{product.calories} kcal
                      </span>
                    )}
                  </div>
                  <h1 className="display display-tight text-5xl text-ink sm:text-6xl">{product.name}</h1>
                </div>
              </div>

              <p className="mt-4 max-w-lg font-body text-[15px] leading-relaxed text-slate-600">{product.description}</p>
              <p className="mt-5 font-body text-4xl font-bold tabular-nums text-ink">{gbp(product.price)}</p>

              {available.length > 0 && (
                <fieldset className="mt-8 rounded-2xl border border-ink/10 bg-white/60 p-5">
                  <legend className="label text-ink font-bold">Add extra toppings &amp; melts</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {available.map((t) => {
                      const already = product.baseToppings.includes(t.id)
                      const on = extras.includes(t.id)
                      return (
                        <button
                          key={t.id} type="button" disabled={already} aria-pressed={on}
                          onClick={() => toggle(extras, setExtras, t.id)}
                          className={cx(
                            'rounded-xl border px-4 py-2.5 font-body text-[11px] font-bold uppercase tracking-[0.08em] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40',
                            on ? 'border-amber-500 bg-amber-500 text-ink shadow-sm' : 'border-ink/15 bg-white text-slate-700 hover:border-ink/45',
                          )}
                        >
                          {t.label}
                          <span className={cx('ml-2 tabular-nums', on ? 'text-ink/80 font-black' : 'text-amber-700')}>
                            {already ? '✓ in base' : `+${gbp(t.price)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}

              {product.sauces && (
                <fieldset className="mt-6 rounded-2xl border border-ink/10 bg-white/60 p-5">
                  <legend className="label text-ink font-bold">Choose your signature sauce — no charge</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {availableSauces.map((s) => {
                      const on = sauces.includes(s.id)
                      return (
                        <button
                          key={s.id} type="button" aria-pressed={on}
                          onClick={() => toggle(sauces, setSauces, s.id)}
                          className={cx(
                            'rounded-full border px-4 py-2 font-body text-[11px] font-bold uppercase tracking-[0.08em] transition-all duration-300',
                            on ? 'border-amber-500 bg-amber-400 text-ink font-black shadow-sm' : 'border-ink/15 bg-white text-slate-700 hover:border-ink/45',
                          )}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}

              {product.mealEligible && (
                <div className="mt-6 rounded-2xl border border-amber-400/80 bg-gradient-to-br from-amber-50/90 to-amber-100/40 p-5 shadow-sm space-y-4">
                  <label className="flex cursor-pointer items-start gap-3.5">
                    <input
                      type="checkbox"
                      checked={meal}
                      onChange={(e) => setMeal(e.target.checked)}
                      className="mt-1 h-5 w-5 rounded accent-amber-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                          {MEAL_DEAL.label} (+{gbp(MEAL_DEAL.price)})
                        </span>
                        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 font-body text-[10px] font-black text-ink shadow-sm">
                          {MEAL_DEAL.saving}
                        </span>
                      </div>
                      <p className="mt-1 font-body text-[12px] text-slate-600">
                        {MEAL_DEAL.detail}. <span className="text-amber-900 font-semibold">({MEAL_DEAL.exclusions})</span>
                      </p>
                    </div>
                  </label>

                  {meal && (
                    <div className="mt-4 pt-4 border-t border-amber-200/80 space-y-4">
                      {/* Drink Selector */}
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
                                    ? 'border-amber-500 bg-amber-400 text-ink shadow-sm'
                                    : 'border-amber-300/60 bg-white text-slate-700 hover:border-amber-400'
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
                        <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                          <span>🥨</span> 2. Select Crisps or Chocolate:
                        </span>
                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[190px] overflow-y-auto pr-1 no-scrollbar">
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
                                    ? 'border-amber-500 bg-amber-400 text-ink shadow-sm'
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

              {/* Fulfillment Method Selection */}
              <div className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-50/70 p-4">
                <FulfillmentSwitcher variant="expanded" showTiming={true} />
              </div>

              <div className="mt-6">
                <label htmlFor="product-notes" className="block font-body text-[11px] font-bold uppercase tracking-wider text-steel">
                  Special Instructions / Allergen Requests
                </label>
                <input
                  id="product-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Extra crispy skin, sauce on the side..."
                  className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 font-body text-[13px] text-ink placeholder:text-steel focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex items-center gap-4 border-t border-ink/12 pt-6">
                <div className="flex items-center rounded-full border border-ink/15 bg-white">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    className="grid h-12 w-12 place-items-center text-slate-500 hover:text-ink font-bold"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-body text-base font-bold tabular-nums" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                    aria-label="Increase quantity"
                    className="grid h-12 w-12 place-items-center text-slate-500 hover:text-ink font-bold"
                  >
                    +
                  </button>
                </div>
                {isOutOfStock ? (
                  <div className="flex-1 rounded-full bg-red-100 py-4 text-center font-body text-xs font-bold uppercase tracking-[0.14em] text-red-700">
                    Sold Out Today ✕
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      add(product, {
                        extras,
                        sauces,
                        meal,
                        mealDrink: meal ? mealDrink : undefined,
                        mealSnack: meal ? mealSnack : undefined,
                        notes: notes.trim() || undefined,
                        qty,
                      })
                      open()
                    }}
                    className="group relative flex-1 overflow-hidden rounded-full bg-amber-400 py-4 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-ink shadow-glow transition-all duration-300 hover:bg-amber-300 active:scale-95"
                  >
                    <span className="relative z-10 font-black">
                      {(storeStatus.isKitchenPaused || kitchenPause.isPaused)
                        ? (fulfilment === 'delivery' ? `🛵 Add for Scheduled Delivery · ${gbp(unit * qty)}` : `🛍️ Add for Scheduled Pick Up · ${gbp(unit * qty)}`)
                        : isScheduled
                        ? (fulfilment === 'delivery' ? `📅 Add for Scheduled Delivery · ${gbp(unit * qty)}` : `📅 Add for Scheduled Pick Up · ${gbp(unit * qty)}`)
                        : (fulfilment === 'delivery' ? `🛵 Add for Delivery · ${gbp(unit * qty)}` : `🛍️ Add for Pick Up · ${gbp(unit * qty)}`)}
                    </span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => navigate('/menu')}
                className="group mt-6 inline-flex items-center gap-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-steel hover:text-ink"
              >
                <span>← Keep browsing the menu</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="bg-stock pb-24 sm:pb-32">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <Reveal>
              <h2 className="display border-b border-ink/12 pb-5 text-3xl text-ink">More {' '}
                <span className="italic text-steel">like this</span>
              </h2>
            </Reveal>
            <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <li key={p.id}>
                  <Link to={`/menu/${p.id}`} className="group block">
                    <div className="aspect-[4/5] overflow-hidden bg-line/30">
                      <SmartImage src={p.image} alt={p.name} fallbackLabel={p.name} className="h-full w-full" imgClassName="transition-transform duration-700 ease-cine group-hover:scale-[1.05]" cover />
                    </div>
                    <div className="mt-3.5 flex items-baseline">
                      <h3 className="display text-[17px] text-ink">{p.name}</h3>
                      <span className="leader" />
                      <span className="font-body text-[13px] font-semibold tabular-nums text-ink">{gbp(p.price)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  )
}
