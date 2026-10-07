import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import ProductStage from './ProductStage'
import Backdrop from './Backdrop'
import { SITE } from '../data/site'
import { useCart } from '../hooks/useCart'
import { useOpeningHours } from '../hooks/useOpeningHours'

const ease = [0.16, 1, 0.3, 1] as const
const stage = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay: 0.2 + i * 0.12, ease },
})

const SHOWCASE_ITEMS = [
  {
    id: 'spuds',
    label: '🥔 Jacket Spuds',
    name: 'The Great British Classic',
    price: 545,
    tag: 'Steaming Fluffy British Potato',
    desc: 'King Edward jacket potato loaded with mature cheddar cheese, baked beans, garlic butter, and crispy golden onions.',
    image: '/assets/food/spuds/great-british-classic.png',
    badge1: { icon: '🔥', title: 'Crispy Skin', sub: 'Steaming Fluffy Center' },
    badge2: { icon: '🧀', title: '3-Cheese Blend', sub: 'Melted to Order' },
  },
  {
    id: 'baguettes',
    label: '🥖 Crusty Baguettes',
    name: 'Coronation Chicken Baguette',
    price: 595,
    tag: 'Artisan Crusty Sourdough',
    desc: 'Freshly baked French baguette stuffed with tender coronation chicken, crisp romaine lettuce, and vine tomatoes.',
    image: '/assets/food/baguette/baguette-feature.png',
    badge1: { icon: '🥖', title: 'Artisan Crust', sub: 'Flour Dusted Daily' },
    badge2: { icon: '🍗', title: 'Tender Chicken', sub: 'Fresh Herb Dressing' },
  },
  {
    id: 'paninis',
    label: '🥪 Toasted Paninis',
    name: 'Pulled Chicken Melt Panini',
    price: 595,
    tag: 'Hot Pressed Sourdough Ciabatta',
    desc: 'Toasted Italian panini with dark grill marks, succulent pulled chicken, basil pesto, and molten mozzarella cheese.',
    image: '/assets/food/panini/panini-feature.png',
    badge1: { icon: '🥪', title: 'Toasted Ciabatta', sub: 'Crispy Grill Marks' },
    badge2: { icon: '🧀', title: 'Mozzarella Melt', sub: 'Molten Cheese Pull' },
  },
  {
    id: 'salads',
    label: '🥗 Fresh Salad Bowls',
    name: 'Healthy Harvest Salad Bowl',
    price: 575,
    tag: 'Crisp Farm Fresh Bowl',
    desc: 'Mixed salad greens, cherry tomatoes, sweet corn, grated mature cheddar cheese, and sliced grilled chicken breast.',
    image: '/assets/food/salad/salad-feature.png',
    badge1: { icon: '🥗', title: 'Crisp Greens', sub: 'Tossed to Order' },
    badge2: { icon: '💪', title: 'High Protein', sub: 'Grilled Chicken & Cheese' },
  },
]

const TICKER_ITEMS = [
  '🥔 Steaming British King Edwards',
  '🧀 Golden 3-Cheese Melts',
  '🔥 Oven-Baked Hourly in Market Square',
  '🥪 Hot Pressed Ciabatta Paninis',
  '🥖 Crusty Artisan Baguettes',
  '🥗 Crisp Fresh Farm Salads',
  '☕ Barista Coffee & Thick Shakes',
  '🛵 Fast Hot Delivery in Aylesbury',
]

export default function Hero() {
  const [activeTab, setActiveTab] = useState(0)
  const currentItem = SHOWCASE_ITEMS[activeTab]
  const { setFulfilment, storeStatus } = useCart()
  const hours = useOpeningHours()
  const ratingVerified = (SITE.stats as { ratingVerified?: boolean }).ratingVerified === true

  return (
    <section id="top" className="on-dark relative min-h-[100svh] overflow-hidden bg-ink-stock">
      <Backdrop tone="dark" grid={false} spotlight intensity={1.35} particles3D={true} />
      {/* Radiant Ambient Hearth Glow Orbs behind Food Stage & Typography */}
      <div className="pointer-events-none absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-amber-400/20 to-amber-600/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-[450px] w-[450px] rounded-full bg-gradient-to-tr from-amber-500/25 via-red-500/10 to-transparent blur-[120px]" />

      <div className="relative mx-auto grid min-h-[100svh] max-w-[1400px] items-center gap-8 px-5 pb-16 pt-24 sm:pt-32 lg:pt-36 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pb-16">
        {/* Copy - Positioned First on All Screens for Instant Clarity & Thumb Access */}
        <div className="order-1 max-w-2xl">
          <motion.div {...stage(0)} className="flex flex-wrap items-center gap-2.5">
            {/* Live open/closed status from the hours set in Admin › Store Ops. */}
            <span
              className={
                storeStatus.isOpen
                  ? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-emerald-400 backdrop-blur-md'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-950/50 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-md'
              }
            >
              <span className={storeStatus.isOpen ? 'h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse' : 'h-1.5 w-1.5 rounded-full bg-amber-400'} />
              {storeStatus.isOpen ? `Open now · ${hours.today}` : `Closed now · ${hours.week}`}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3.5 py-1 font-body text-[10px] font-semibold text-amber-300 backdrop-blur-md">
              {ratingVerified && (
                <>
                  <span>★ {SITE.stats.rating} Rating</span>
                  <span className="text-white/40">&bull;</span>
                </>
              )}
              <span>Market Square, Aylesbury</span>
            </span>
          </motion.div>

          <motion.h1
            {...stage(1)}
            className="mt-5 display display-tight text-[52px] text-white sm:text-[84px] lg:text-[104px]"
          >
            Just{' '}
            <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
              Spuds
            </span>
          </motion.h1>

          <motion.p
            {...stage(2)}
            className="mt-4 max-w-xl font-body text-[15px] sm:text-[17px] leading-relaxed text-amber-50/85"
          >
            Britain&rsquo;s finest King Edward &amp; Maris Piper jacket potatoes, oven-baked throughout the day in historic Market Square, Aylesbury. Split steaming hot and loaded with melted mature cheeses, hearty slow-cooked fillings, fresh salads, and house dressings.
          </motion.p>

          {/* Interactive Hero Category Switcher */}
          <motion.div {...stage(2.5)} className="mt-6 flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {SHOWCASE_ITEMS.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`shrink-0 rounded-full px-4 py-2 font-body text-[11px] font-bold transition-all ${
                  activeTab === idx
                    ? 'bg-amber-400 text-ink shadow-hearth font-black scale-105'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white border border-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </motion.div>

          {/* Primary Action Buttons */}
          <motion.div {...stage(3)} className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/menu"
              onClick={() => setFulfilment('pickup')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-6 sm:px-7 py-3.5 sm:py-4 font-body text-[12px] font-black uppercase tracking-[0.12em] text-ink shadow-hearth transition-all duration-300 hover:bg-amber-300 hover:scale-105 active:scale-95"
            >
              <span>🛍️</span>
              <span>Store Pick Up (~15m) →</span>
            </Link>

            <Link
              to="/menu"
              onClick={() => setFulfilment('delivery')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/15 px-6 sm:px-7 py-3.5 sm:py-4 font-body text-[12px] font-black uppercase tracking-[0.12em] text-amber-300 backdrop-blur-md transition-all duration-300 hover:bg-amber-400 hover:text-ink hover:scale-105 active:scale-95"
            >
              <span>🛵</span>
              <span>Home Delivery (25-35m) →</span>
            </Link>

            <Link
              to="/menu?view=build"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-3 font-body text-[11px] font-bold uppercase tracking-[0.12em] text-white/80 backdrop-blur-md transition-all duration-300 hover:border-amber-400/50 hover:text-white hover:bg-white/10"
            >
              <span>🥔</span>
              <span>Craft Your Own Spud</span>
            </Link>
          </motion.div>

          {/* First Visit Friendly Voucher Badge */}
          <motion.div
            {...stage(4)}
            className="mt-7 flex items-center gap-3.5 rounded-2xl border border-amber-400/25 bg-[#201A16]/80 p-3.5 max-w-md backdrop-blur-md shadow-warm"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/20 text-xl text-amber-300">
              🎁
            </div>
            <div>
              <p className="font-body text-[11px] font-black uppercase tracking-wider text-amber-300">
                First Time Visitor Gift
              </p>
              <p className="font-body text-[12px] text-white/75 mt-0.5">
                Free barista coffee or thick shake with code <strong className="text-amber-300 font-bold tracking-wider">{SITE.offer.code}</strong>
              </p>
            </div>
          </motion.div>
        </div>

        {/* Hero Food Showcase with Warm Hearth Badges */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.1, ease }}
          className="order-2 relative mt-4 lg:mt-0"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35 }}
              className="relative"
            >
              {/* Warm Foodie Badge 1 */}
              <div className="hidden sm:flex absolute -left-3 top-8 z-20 items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-[#221C18]/95 px-4 py-2.5 shadow-warm-lg backdrop-blur-md">
                <span className="text-2xl">{currentItem.badge1.icon}</span>
                <div>
                  <p className="font-body text-[12px] font-bold text-white">{currentItem.badge1.title}</p>
                  <p className="font-body text-[10px] font-semibold text-amber-300">{currentItem.badge1.sub}</p>
                </div>
              </div>

              {/* Warm Foodie Badge 2 */}
              <div className="hidden sm:flex absolute -right-2 bottom-12 z-20 items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-[#221C18]/95 px-4 py-2.5 shadow-warm-lg backdrop-blur-md">
                <span className="text-2xl">{currentItem.badge2.icon}</span>
                <div>
                  <p className="font-body text-[12px] font-bold text-white">{currentItem.badge2.title}</p>
                  <p className="font-body text-[10px] font-semibold text-amber-300">{currentItem.badge2.sub}</p>
                </div>
              </div>

              {/* Dish tag */}
              <div className="hidden xl:flex absolute left-8 -bottom-3 z-20 items-center gap-2 rounded-2xl border border-amber-400/30 bg-[#221C18]/95 px-4 py-2 shadow-warm-lg backdrop-blur-md">
                <span className="text-base">✨</span>
                <p className="font-body text-[11px] font-bold text-amber-200">{currentItem.tag}</p>
              </div>

              <ProductStage
                src={currentItem.image}
                alt={currentItem.name}
                className="mx-auto w-[88%] max-w-[500px] sm:w-[72%] lg:w-full lg:max-w-none filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Dynamic Animated Marquee Feature Bar */}
      <div className="relative border-y border-amber-500/20 bg-[#141210]/90 py-3 backdrop-blur-md overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap gap-12 font-body text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
          {TICKER_ITEMS.concat(TICKER_ITEMS).map((item, idx) => (
            <span key={idx} className="flex items-center gap-4">
              <span>{item}</span>
              <span className="text-amber-400/60">&bull;</span>
            </span>
          ))}
        </div>
      </div>

      {/* Subtle blend to next section */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-paper/30 to-transparent pointer-events-none" />
    </section>
  )
}

