import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import ProductStage from './ProductStage'
import Backdrop, { GhostType } from './Backdrop'
import { SITE } from '../data/site'
import { useCart } from '../hooks/useCart'

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
  '🥔 Fluffy British Potatoes',
  '🧀 Golden 3-Cheese Melts',
  '🔥 Baked Fresh in Aylesbury',
  '🥗 Crisp Fresh Salad Bowls',
  '🥪 Hot Golden Paninis',
  '☕ Barista Coffee & Thick Shakes',
  '⚡ Order Ahead for Pickup',
]

export default function Hero() {
  const [activeTab, setActiveTab] = useState(0)
  const currentItem = SHOWCASE_ITEMS[activeTab]
  const { setFulfilment } = useCart()

  return (
    <section id="top" className="on-dark relative min-h-[100svh] overflow-hidden bg-ink-stock">
      <Backdrop tone="dark" grid={false} spotlight intensity={1.35} particles3D />
      <GhostType className="-right-[3%] top-[8%] text-[22vw]">AYLESBURY</GhostType>

      <div className="relative mx-auto grid min-h-[100svh] max-w-[1400px] items-center gap-8 px-5 pb-20 pt-36 sm:pt-40 lg:pt-44 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-6 lg:pb-16">
        {/* Copy */}
        <div className="order-2 max-w-2xl lg:order-1">
          <motion.div {...stage(0)} className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/50 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-emerald-400 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Open Everyday: 11:00 AM – 10:00 PM
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-body text-[10px] font-medium text-white/70">
              <span className="text-amber-400">★</span> 4.9 Rating &bull; Market Square, Aylesbury
            </span>
          </motion.div>

          <motion.h1
            {...stage(1)}
            className="mt-6 display display-tight text-[60px] text-white sm:text-[92px] lg:text-[112px]"
          >
            Just{' '}
            <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
              Spuds
            </span>
          </motion.h1>

          <motion.p
            {...stage(2)}
            className="mt-4 max-w-lg font-body text-[15px] sm:text-[16px] leading-relaxed text-white/75"
          >
            King Edward &amp; Maris Piper jacket potatoes oven-baked fresh in Aylesbury throughout the day. Split
            steaming hot and loaded with mature cheeses, slow-cooked fillings, fresh salads, and signature house sauces.
          </motion.p>

          {/* Interactive Hero Category Switcher */}
          <motion.div {...stage(2.5)} className="mt-6 flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {SHOWCASE_ITEMS.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 font-body text-[11px] font-bold transition-all ${
                  activeTab === idx
                    ? 'bg-amber-400 text-ink shadow-glow font-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white border border-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </motion.div>

          <motion.div {...stage(3)} className="mt-8 flex flex-wrap items-center gap-3.5">
            <Link
              to="/menu"
              onClick={() => setFulfilment('pickup')}
              className="group relative overflow-hidden rounded-full bg-amber-400 px-6 sm:px-7 py-3.5 sm:py-4 font-body text-[12px] font-bold uppercase tracking-[0.12em] text-ink shadow-glow transition-all duration-300 hover:bg-amber-300 hover:scale-105"
            >
              <span className="relative z-10 font-black flex items-center gap-1.5">
                <span>🛍️</span>
                <span>Store Pick Up (~15m) →</span>
              </span>
            </Link>

            <Link
              to="/menu"
              onClick={() => setFulfilment('delivery')}
              className="group relative overflow-hidden rounded-full border border-amber-400/80 bg-amber-500/20 px-6 sm:px-7 py-3.5 sm:py-4 font-body text-[12px] font-bold uppercase tracking-[0.12em] text-amber-300 backdrop-blur-md transition-all duration-300 hover:bg-amber-400 hover:text-ink hover:scale-105"
            >
              <span className="relative z-10 font-black flex items-center gap-1.5">
                <span>🛵</span>
                <span>Home Delivery (25-35m) →</span>
              </span>
            </Link>

            <Link
              to="/menu?view=build"
              className="group flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 sm:py-4 font-body text-[11px] font-bold uppercase tracking-[0.12em] text-white/80 backdrop-blur-md transition-all duration-300 hover:border-white hover:text-white"
            >
              <span>⚡</span>
              <span>Build Lab</span>
            </Link>
          </motion.div>

          <motion.div
            {...stage(4)}
            className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 max-w-md backdrop-blur-md"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-lg">
              🎁
            </div>
            <div>
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-amber-300">
                {SITE.offer.short}
              </p>
              <p className="font-body text-[11px] text-white/60">
                Code <strong className="text-white font-bold">{SITE.offer.code}</strong> at checkout
              </p>
            </div>
          </motion.div>
        </div>

        {/* Hero Interactive Food Showcase with Floating Dynamic Cards */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.1, ease }}
          className="order-1 lg:order-2 relative"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="relative"
            >
              {/* Floating Badge 1 */}
              <div className="hidden sm:flex absolute -left-4 top-10 z-20 items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#1C1F28]/95 to-[#12141A]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md shadow-amber-950/20">
                <span className="text-xl">{currentItem.badge1.icon}</span>
                <div>
                  <p className="font-body text-[11px] font-bold text-white">{currentItem.badge1.title}</p>
                  <p className="font-body text-[9px] font-semibold text-amber-300">{currentItem.badge1.sub}</p>
                </div>
              </div>

              {/* Floating Badge 2 */}
              <div className="hidden sm:flex absolute -right-2 bottom-14 z-20 items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#1C1F28]/95 to-[#12141A]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md shadow-amber-950/20">
                <span className="text-xl">{currentItem.badge2.icon}</span>
                <div>
                  <p className="font-body text-[11px] font-bold text-white">{currentItem.badge2.title}</p>
                  <p className="font-body text-[9px] font-semibold text-amber-300">{currentItem.badge2.sub}</p>
                </div>
              </div>

              {/* Floating Badge 3 */}
              <div className="hidden xl:flex absolute left-8 -bottom-4 z-20 items-center gap-2 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#1C1F28]/95 to-[#12141A]/95 px-3.5 py-2 shadow-2xl backdrop-blur-md">
                <span className="text-base">✨</span>
                <p className="font-body text-[10px] font-bold text-amber-200">{currentItem.tag}</p>
              </div>

              <ProductStage
                src={currentItem.image}
                alt={currentItem.name}
                className="mx-auto w-[82%] max-w-[540px] sm:w-[68%] lg:w-full lg:max-w-none"
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Dynamic Animated Marquee Feature Bar */}
      <div className="relative border-y border-white/10 bg-black/40 py-3.5 backdrop-blur-md overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap gap-12 font-body text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">
          {TICKER_ITEMS.concat(TICKER_ITEMS).map((item, idx) => (
            <span key={idx} className="flex items-center gap-4">
              <span>{item}</span>
              <span className="text-amber-400/50">&bull;</span>
            </span>
          ))}
        </div>
      </div>

      {/* Subtle blend to next section */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-paper/30 to-transparent pointer-events-none" />
    </section>
  )
}

