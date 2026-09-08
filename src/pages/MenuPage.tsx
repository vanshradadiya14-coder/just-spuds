import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Reveal from '../components/Reveal'
import RevealImage from '../components/RevealImage'
import PageHeader from '../components/PageHeader'
import Backdrop from '../components/Backdrop'
import ItemModal from '../components/ItemModal'
import Builder from '../components/Builder'
import FulfillmentSwitcher from '../components/FulfillmentSwitcher'
import ReorderWidget from '../components/ReorderWidget'
import {
  ALLERGY_NOTICE, MEAL_DEAL, type CategoryId, type Product,
} from '../data/menu'
import { getProducts, isProductSoldOut, subscribeMenu, getCategories } from '../services/menuStore'
import { SITE } from '../data/site'
import { useCart } from '../hooks/useCart'
import { cx, gbp } from '../utils/format'
import { getMenuStockOverrides, subscribeStock } from '../services/orderStore'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

const VISUAL: CategoryId[] = ['SPUDS', 'WRAPS', 'RICE_BOXES', 'BAGUETTES', 'PANINIS', 'SALADS']

const FILTER_TAGS = [
  { id: 'all', label: 'All Items' },
  { id: 'veg', label: 'Vegetarian 🌿' },
  { id: 'gf', label: 'Gluten-Free 🌾' },
  { id: 'protein', label: 'High Protein 💪' },
  { id: 'lowcal', label: 'Under 500 kcal 🥗' },
  { id: 'budget', label: 'Under £5 🏷️' },
  { id: 'popular', label: 'Best Sellers ⭐' },
]

export default function MenuPage() {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>(() => getProducts())
  const activeCategories = getCategories()

  useDocumentMeta({
    title: 'Full Menu — Jacket Potatoes, Wraps, Rice Boxes & Paninis',
    description:
      'Browse our complete Aylesbury menu with live calorie counts, allergen filters, vegetarian & gluten-free options. Customise your potato or upgrade to a meal deal.',
  })

  const [activeCategory, setActiveCategory] = useState<CategoryId | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const { fulfilment, lines } = useCart()

  const getItemCartCount = (productId: string) => {
    return lines.filter((l) => l.productId === productId).reduce((sum, l) => sum + l.qty, 0)
  }

  const handleCategoryClick = (id: CategoryId | 'ALL') => {
    setActiveCategory(id)
    if (id !== 'ALL') {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  // Live stock overrides
  const [stockMap, setStockMap] = useState<Record<string, boolean>>(() => getMenuStockOverrides())

  useEffect(() => {
    const unsubMenu = subscribeMenu(() => {
      setProducts(getProducts())
    })
    // Live stock updates: staff 86'ing an item now removes it here immediately,
    // rather than only on the next full page load.
    const unsubStock = subscribeStock(setStockMap)
    return () => {
      unsubMenu()
      unsubStock()
    }
  }, [])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (activeCategory !== 'ALL' && p.category !== activeCategory) return false

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = p.name.toLowerCase().includes(q)
        const matchDesc = p.description.toLowerCase().includes(q)
        const matchTags = p.tags?.some((t) => t.toLowerCase().includes(q))
        if (!matchName && !matchDesc && !matchTags) return false
      }

      // Dietary & Attribute filters
      if (activeFilter === 'veg' && !p.vegetarian) return false
      if (activeFilter === 'gf' && !p.glutenFree) return false
      if (activeFilter === 'protein') {
        const protNum = parseInt(p.protein?.replace(/\D/g, '') ?? '0', 10)
        if (protNum < 24) return false
      }
      if (activeFilter === 'lowcal' && (p.calories ?? 999) > 500) return false
      if (activeFilter === 'budget' && p.price > 500) return false
      if (activeFilter === 'popular' && !p.popular && p.category !== 'SPUDS') return false

      return true
    })
    // `products` must stay in this list — it is replaced by subscribeMenu when an
    // admin edits the menu, and omitting it froze the customer menu against live edits.
  }, [products, activeCategory, search, activeFilter])

  return (
    <>
      <PageHeader
        ghost="ORDER"
        eyebrow={fulfilment === 'delivery' ? 'Home Delivery' : 'Store Pick Up'}
        title="Order Fresh"
        titleItalic="topped your way"
        blurb="Build your custom potato & meal from scratch with live macro tracking, or browse our ready-made chef specials. Prepared hot at Market Square, Aylesbury."
        compactMobile
      />

      {/* Control Hub: Delivery/Pickup & Timing Switcher */}
      <div id="fulfillment-switcher" className="bg-paper pb-5 pt-3 border-b border-ink/8 space-y-4">
        <div className="mx-auto max-w-3xl px-4">
          <ReorderWidget />
        </div>
        <div className="mx-auto max-w-3xl px-4">
          <FulfillmentSwitcher />
        </div>
      </div>

      <main>
        {/* TOP INTERACTIVE FEATURE: Custom Spud & Bowl Lab */}
        <section className="bg-slate-950 text-paper py-3 sm:py-8 px-4 sm:px-8 border-b border-white/10 relative overflow-hidden">
          <div className="mx-auto max-w-[1400px]">
            {/* Mobile Compact View */}
            <div className="sm:hidden rounded-2xl border border-amber-400/30 bg-white/5 p-3.5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                    ⚡ Custom Lab
                  </span>
                  <h3 className="mt-1 font-bold text-sm text-white truncate">Build Custom Spud</h3>
                  <p className="text-[11px] text-slate-400 truncate">Live macro & calorie calculation</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBuilderOpen((prev) => !prev)}
                  className="shrink-0 rounded-full bg-amber-400 px-3.5 py-1.5 font-body text-[11px] font-black uppercase tracking-wider text-slate-950 shadow-sm active:scale-95 transition hover:bg-amber-300"
                >
                  {isBuilderOpen ? 'Close ▲' : 'Open Lab ⚡'}
                </button>
              </div>
            </div>

            {/* Desktop Full View */}
            <div className="hidden sm:block rounded-3xl border border-amber-400/30 bg-white/5 p-6 sm:p-8 backdrop-blur-md relative overflow-hidden">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
                <div className="max-w-xl">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3.5 py-1 text-amber-300 font-body text-xs font-black uppercase tracking-wider">
                    <span>⚡ Interactive Spud Lab</span>
                    <span>&bull;</span>
                    <span>Live Macro Tracker</span>
                  </span>
                  <h2 className="mt-3 display text-2xl sm:text-4xl text-paper">
                    Build Your Custom Spud From Scratch
                  </h2>
                  <p className="mt-2 font-body text-sm text-paper/70 leading-relaxed">
                    Choose your base (Baked Potato, Sweet Potato, Crusty Baguette, Salad Bowl), add unlimited cheeses &amp; hot fillings, select gourmet sauces, and monitor exact protein &amp; calories live in real-time.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsBuilderOpen((prev) => !prev)}
                    className="flex items-center justify-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow transition hover:bg-amber-300 active:scale-95"
                  >
                    <span>{isBuilderOpen ? '▲ Close Custom Lab' : '⚡ Open Custom Spud Lab'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Interactive Custom Spud Builder (Shared) */}
            <AnimatePresence>
              {isBuilderOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-4 sm:mt-8 border-t border-white/10 pt-4 sm:pt-6 overflow-hidden"
                >
                  <Builder embedded />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* SECTION: CHEF SPECIALS & COMPLETE MENU CATALOG */}
        <div>
          {/* Sticky Search & Filter Bar */}
          <div className="sticky top-[80px] sm:top-[88px] z-30 border-y border-ink/10 bg-white/95 shadow-sm backdrop-blur-md">
            <div className="mx-auto max-w-[1400px] px-4 py-2.5 sm:px-8 sm:py-3.5">
              <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search spuds, fillings, baguettes, paninis..."
                    className="w-full rounded-full border border-slate-200 bg-slate-50/80 py-1.5 pl-10 pr-8 font-body text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-xs"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-steel hover:text-ink"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Quick Dietary Filter Tags */}
                <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                  {FILTER_TAGS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActiveFilter(f.id)}
                      className={cx(
                        'shrink-0 rounded-full px-3.5 py-1.5 font-body text-[11px] font-bold transition-all',
                        activeFilter === f.id
                          ? 'bg-ink text-white shadow-sm'
                          : 'border border-ink/10 bg-white/80 text-steel hover:border-ink/30 hover:text-ink'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Anchor Rail */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar border-t border-ink/8 pt-2.5">
                <button
                  type="button"
                  onClick={() => handleCategoryClick('ALL')}
                  className={cx(
                    'shrink-0 rounded-full px-4 py-1.5 font-body text-[11px] font-bold uppercase tracking-wider transition-all',
                    activeCategory === 'ALL'
                      ? 'bg-amber-400 text-ink shadow-sm font-black'
                      : 'bg-white/60 text-slate-700 hover:bg-white'
                  )}
                >
                  🍽️ All Items
                </button>
                {activeCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCategoryClick(c.id)}
                    className={cx(
                      'shrink-0 rounded-full px-4 py-1.5 font-body text-[11px] font-bold uppercase tracking-wider transition-all',
                      activeCategory === c.id
                        ? 'bg-amber-400 text-ink shadow-sm font-black'
                        : 'bg-white/60 text-slate-700 hover:bg-white'
                    )}
                  >
                    {c.id === 'SPUDS' && '🥔 '}
                    {c.id === 'WRAPS' && '🌯 '}
                    {c.id === 'RICE_BOXES' && '🍚 '}
                    {c.id === 'BAGUETTES' && '🥖 '}
                    {c.id === 'PANINIS' && '🥪 '}
                    {c.id === 'SALADS' && '🥗 '}
                    {c.id === 'HOT_DRINKS' && '☕ '}
                    {c.id === 'COLD_DRINKS' && '🥤 '}
                    {c.id === 'SNACKS' && '🍫 '}
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

              <div className="relative overflow-hidden bg-stock pb-24 pt-4 sm:pt-10 sm:pb-32">
                <Backdrop tone="light" spotlight intensity={0.4} gl={false} />
                <div className="relative mx-auto max-w-[1400px] space-y-6 px-4 sm:space-y-16 sm:px-8">
                  
                  {/* Meal Deal Promo Callout & Fast Delivery Bar */}
                  <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
                    <div className="rounded-2xl sm:rounded-3xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-amber-500/10 p-4 sm:p-8 backdrop-blur-sm lg:col-span-8">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                        <div>
                          <span className="rounded-full bg-amber-500 px-2.5 py-0.5 font-body text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-xs">
                            {MEAL_DEAL.saving}
                          </span>
                          <h3 className="mt-1 sm:mt-2 display text-lg sm:text-2xl text-slate-950">
                            Make Any Main A Meal Deal (+{gbp(MEAL_DEAL.price)})
                          </h3>
                          <p className="mt-0.5 font-body text-[12px] sm:text-[13px] text-slate-600">
                            {MEAL_DEAL.detail} &bull; Cold drink + crisps/snack of your choice.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsBuilderOpen(true)
                            window.scrollTo({ top: 180, behavior: 'smooth' })
                          }}
                          className="shrink-0 rounded-full bg-slate-950 px-4 py-2 sm:px-6 sm:py-3 font-body text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-slate-800 shadow-sm"
                        >
                          ⚡ Open Custom Lab ↑
                        </button>
                      </div>
                    </div>

                    {/* Delivery Partners Quick Pill */}
                    <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm lg:col-span-4 flex flex-col justify-between">
                      <div>
                        <span className="font-body text-[10px] font-bold uppercase tracking-wider text-steel">
                          Home &amp; Office Delivery
                        </span>
                        <h4 className="mt-1 display text-xl text-ink">Prefer Partner Apps?</h4>
                        <p className="mt-1 font-body text-[12px] text-slate-500">Order directly to your door in Aylesbury via our official partners:</p>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        {SITE.deliveryPartners.map((partner) => (
                          <a
                            key={partner.name}
                            href={partner.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 rounded-xl border border-ink/10 bg-paper py-2 text-center font-body text-[11px] font-bold text-ink hover:bg-amber-100/60 hover:border-amber-300 transition"
                          >
                            {partner.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Empty search results */}
                  {filteredProducts.length === 0 && (
                    <div className="py-20 text-center">
                      <p className="display text-3xl text-ink">No delicious items match your search</p>
                      <p className="mt-2 font-body text-sm text-steel">Try resetting your filters or searching for another ingredient.</p>
                      <button
                        type="button"
                        onClick={() => { setSearch(''); setActiveFilter('all'); setActiveCategory('ALL') }}
                        className="mt-6 rounded-full bg-ink px-6 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-white hover:bg-slate-700"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  )}

                  {activeCategories.map((cat) => {
                    const items = filteredProducts.filter((p) => p.category === cat.id)
                    if (!items.length) return null
                    const visual = VISUAL.includes(cat.id)

                    return (
                      <section key={cat.id} id={cat.id} className="scroll-mt-40">
                        <Reveal>
                          <div className="flex items-end justify-between gap-6 border-b border-ink/12 pb-4">
                            <div>
                              <h2 className="display text-3xl text-ink sm:text-4xl">{cat.label}</h2>
                              <p className="mt-1 font-body text-[12px] text-steel">{cat.blurb}</p>
                            </div>
                            <span className="hidden font-body text-[11px] font-bold uppercase tracking-wider text-amber-700 sm:block">
                              {items.length} {items.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </Reveal>

                        {visual ? (
                          <div className="mt-6">
                            {/* MOBILE VIEW (Deliveroo / UberEats Horizontal Card List) */}
                            <div className="space-y-3 sm:hidden">
                              {items.map((p) => {
                                const cartQty = getItemCartCount(p.id)
                                const soldOut = isProductSoldOut(p, stockMap)

                                return (
                                  <div
                                    key={p.id}
                                    onClick={() => setSelectedProduct(p)}
                                    className="relative flex items-center justify-between gap-3.5 rounded-2xl border border-ink/10 bg-white p-3.5 shadow-xs transition active:scale-[0.99] active:bg-paper cursor-pointer"
                                  >
                                    {/* Left Details (65%) */}
                                    <div className="flex-1 min-w-0 pr-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <h3 className="display text-base font-bold text-ink leading-snug">
                                          {p.name}
                                        </h3>
                                        {p.popular && (
                                          <span className="rounded-full bg-amber-400/25 px-2 py-0.5 font-body text-[9px] font-black uppercase text-amber-900">
                                            ⭐ Bestseller
                                          </span>
                                        )}
                                      </div>

                                      <p className="mt-1 font-body text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                        {p.description}
                                      </p>

                                      {/* Dietary Badges */}
                                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                        {p.vegetarian && (
                                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                                            🌿 Veg
                                          </span>
                                        )}
                                        {p.glutenFree && (
                                          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                                            🌾 GF
                                          </span>
                                        )}
                                        {p.calories && (
                                          <span className="text-[10px] text-slate-400 font-medium">
                                            ~{p.calories} kcal
                                          </span>
                                        )}
                                      </div>

                                      {/* Price & In-Cart Badge */}
                                      <div className="mt-2.5 flex items-center gap-2">
                                        <span className="font-body text-sm font-black text-ink">
                                          {gbp(p.price)}
                                        </span>
                                        {cartQty > 0 && (
                                          <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 font-body text-[10px] font-black">
                                            ✓ {cartQty} in bag
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Right Image (35%) with floating + button */}
                                    <div className="relative w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-paper shadow-inner border border-ink/8">
                                      <RevealImage
                                        src={p.image}
                                        alt={p.name}
                                        fallbackLabel={p.name}
                                        className="h-full w-full object-cover"
                                        cover
                                      />
                                      {soldOut ? (
                                        <span className="absolute inset-0 bg-ink/75 flex items-center justify-center text-[9px] font-black uppercase text-white text-center p-1">
                                          Sold Out
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedProduct(p)
                                          }}
                                          className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-amber-400 text-ink shadow-md font-bold text-base hover:bg-amber-300 active:scale-90 transition border border-white"
                                          aria-label={`Customise and add ${p.name}`}
                                        >
                                          +
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {/* DESKTOP & TABLET VIEW (Grid Card Layout) */}
                            <ul className="hidden sm:grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                              {items.map((p, i) => {
                                const cartQty = getItemCartCount(p.id)

                                return (
                                  <li key={p.id}>
                                    <div
                                      onClick={() => setSelectedProduct(p)}
                                      className="group cursor-pointer flex flex-col justify-between h-full rounded-3xl border border-ink/8 bg-white p-4 shadow-sm transition-all duration-400 hover:-translate-y-1 hover:shadow-warm"
                                    >
                                      <div>
                                        <div className="block relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper">
                                          <RevealImage
                                            src={p.image}
                                            alt={p.name}
                                            fallbackLabel={p.name}
                                            className="h-full w-full"
                                            imgClassName="transition-transform duration-[800ms] ease-cine group-hover:scale-[1.07]"
                                            cover
                                            delay={(i % 4) * 0.05}
                                          />
                                          
                                          {/* Dietary Badges */}
                                          <div className="absolute top-3 left-3 flex flex-col gap-1">
                                            {p.vegetarian && (
                                              <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 font-body text-[9px] font-bold uppercase text-white shadow-sm">
                                                🌿 Veg
                                              </span>
                                            )}
                                            {p.glutenFree && (
                                              <span className="rounded-full bg-amber-600 px-2.5 py-0.5 font-body text-[9px] font-bold uppercase text-white shadow-sm">
                                                🌾 GF
                                              </span>
                                            )}
                                            {cartQty > 0 && (
                                              <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 font-body text-[9px] font-black uppercase text-white shadow-md">
                                                ✓ {cartQty} in bag
                                              </span>
                                            )}
                                          </div>

                                          {p.protein && (
                                            <span className="absolute top-3 right-3 rounded-full bg-ink/80 px-2.5 py-0.5 font-body text-[9px] font-bold uppercase text-amber-300 backdrop-blur-sm">
                                              {p.protein} Protein
                                            </span>
                                          )}
                                        </div>

                                        <div className="mt-4">
                                          <div className="flex items-baseline justify-between gap-2">
                                            <h3 className="display text-[18px] text-ink group-hover:text-amber-600 transition-colors leading-tight">
                                              {p.name}
                                            </h3>
                                            <span className="font-body text-[15px] font-bold tabular-nums text-ink">
                                              {gbp(p.price)}
                                            </span>
                                          </div>
                                          <p className="mt-1.5 font-body text-[12px] leading-relaxed text-slate-600 line-clamp-2">
                                            {p.description}
                                          </p>
                                          {p.calories && (
                                            <p className="mt-1 font-body text-[10px] font-semibold text-steel">
                                              ~{p.calories} kcal &bull; {p.protein} protein
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="mt-5 border-t border-ink/8 pt-3">
                                        {isProductSoldOut(p, stockMap) ? (
                                          <div className="w-full rounded-full bg-red-100 py-2.5 text-center font-body text-[11px] font-bold uppercase tracking-wider text-red-700">
                                            Sold Out Today ✕
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setSelectedProduct(p)
                                            }}
                                            className="w-full flex items-center justify-center gap-1.5 rounded-full bg-amber-400 py-2.5 px-4 text-center font-body text-[12px] font-black uppercase tracking-wider text-ink transition hover:bg-amber-300 active:scale-95 shadow-sm group-hover:bg-amber-300"
                                          >
                                            <span>⚡</span>
                                            <span>Customise &amp; Add</span>
                                            <span className="font-mono text-sm leading-none ml-1 font-bold">+</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ) : (
                          <ul className="mt-6 grid gap-3 sm:gap-x-12 sm:grid-cols-2">
                            {items.map((p, i) => {
                              const cartQty = getItemCartCount(p.id)

                              return (
                                <Reveal as="li" key={p.id} delay={Math.min(i, 6)}>
                                  <div
                                    onClick={() => setSelectedProduct(p)}
                                    className="cursor-pointer flex items-center justify-between border border-ink/8 sm:border-0 sm:border-b sm:border-ink/8 p-3 sm:py-3.5 hover:bg-white/60 bg-white sm:bg-transparent rounded-2xl sm:rounded-xl transition"
                                  >
                                    <div className="flex-1 min-w-0 pr-4">
                                      <div className="flex items-baseline flex-wrap gap-1.5">
                                        <span className="display text-[16px] sm:text-[18px] text-ink">
                                          {p.name}
                                        </span>
                                        {p.size && <span className="font-body text-[10px] text-steel">({p.size})</span>}
                                        {cartQty > 0 && (
                                          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.2 text-[9px] font-bold">
                                            {cartQty} in bag
                                          </span>
                                        )}
                                      </div>
                                      {p.description && (
                                        <p className="font-body text-[11px] text-steel truncate mt-0.5">{p.description}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                      <span className="font-body text-[14px] font-bold tabular-nums text-ink">
                                        {gbp(p.price)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSelectedProduct(p)
                                        }}
                                        className="grid h-7 w-7 sm:h-auto sm:w-auto sm:px-3.5 sm:py-1.5 place-items-center rounded-full bg-amber-400 text-ink font-body text-[11px] font-black uppercase tracking-wider transition hover:bg-amber-300 active:scale-95 shadow-sm"
                                        aria-label={`Customise ${p.name}`}
                                      >
                                        <span className="sm:hidden text-sm font-bold">+</span>
                                        <span className="hidden sm:inline">Add +</span>
                                      </button>
                                    </div>
                                  </div>
                                </Reveal>
                              )
                            })}
                          </ul>
                        )}
                      </section>
                    )
                  })}

                  <div className="rounded-2xl border border-ink/10 bg-white/70 p-5 text-center shadow-xs">
                    <p className="font-body text-[11px] leading-relaxed text-steel">{ALLERGY_NOTICE}</p>
                  </div>
                </div>
              </div>
            </div>
      </main>

      {/* Item Modal Customizer */}
      <ItemModal
        product={selectedProduct}
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
      />
    </>
  )
}
