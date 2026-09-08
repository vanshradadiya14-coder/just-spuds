import { Link } from 'react-router-dom'
import Hero from '../components/Hero'
import NameBand from '../components/NameBand'
import Range from '../components/Range'
import FactsBand from '../components/FactsBand'
import Values from '../components/Values'
import Reveal from '../components/Reveal'
import Backdrop, { GhostType } from '../components/Backdrop'
import RevealImage from '../components/RevealImage'
import ReviewsSection from '../components/ReviewsSection'
import { SITE } from '../data/site'
import { useCart } from '../hooks/useCart'

import BentoGrid from '../components/BentoGrid'
import ReorderWidget from '../components/ReorderWidget'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function HomePage() {
  const { applyPromo, open } = useCart()

  useDocumentMeta({
    title: 'Fresh Hot Jacket Potatoes, Wraps & Meal Deals in Aylesbury',
    description:
      'Order piping hot British King Edward jacket potatoes, slow-cooked chilli, melted mature cheddar, and meal deals in Market Square, Aylesbury. Collect or get fast hot delivery.',
  })

  return (
    <>
      <Hero />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 pb-2">
        <ReorderWidget />
      </div>
      <BentoGrid />
      <NameBand />
      <Range />
      <FactsBand />
      <Values />

      {/* Build teaser */}
      <section className="on-dark relative overflow-hidden bg-ink-stock py-28 sm:py-40">
        <Backdrop tone="dark" grid={false} spotlight intensity={1.15} />
        <GhostType className="-left-[5%] bottom-[-10%] text-[24vw]">YOURS</GhostType>
        <div className="relative mx-auto grid max-w-[1400px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-400">
              ⚡ Customizer
            </span>
            <h2 className="mt-4 display display-tight text-5xl text-white sm:text-[72px]">
              Build it
              <span className="block italic text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-amber-500">
                exactly how you want
              </span>
            </h2>
            <p className="mt-6 max-w-md font-body text-[15px] leading-relaxed text-white/70">
              Start from any fluffy jacket potato, crusty baguette, toasted panini, or crunchy salad bowl.
              Load it up with melting cheeses, savoury meats, fresh toppings, and signature sauces.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/build"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-amber-400 px-8 py-4 font-body text-[12px] font-bold uppercase tracking-[0.16em] text-ink shadow-glow transition-all duration-300 hover:bg-amber-300 hover:scale-105"
              >
                <span>⚡</span>
                <span className="font-black">Build Your Meal</span>
              </Link>
              <Link
                to="/menu"
                className="rounded-full border border-white/25 px-7 py-4 font-body text-[12px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
              >
                Browse Menu
              </Link>
            </div>
          </Reveal>

          <RevealImage
            src="/assets/food/spuds/spud-father.png"
            alt="The Spud Father"
            fallbackLabel="Build a spud"
            className="aspect-square overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl"
            cover
          />
        </div>
      </section>

      {/* Customer Reviews & Social Proof */}
      <ReviewsSection />

      {/* First Visit Interactive Voucher Box */}
      <section className="bg-stock py-20 sm:py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal className="relative overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-white via-amber-50/50 to-amber-100/40 p-8 sm:p-14 shadow-warm text-center flex flex-col items-center">
            <span className="rounded-full bg-amber-500 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-ink">
              First Visit Promotion
            </span>
            <h2 className="mt-4 display display-tight max-w-2xl text-4xl text-ink sm:text-6xl">
              Your first drink&rsquo;s <span className="italic text-amber-600">on us</span>
            </h2>
            <p className="mt-4 max-w-lg font-body text-[15px] leading-relaxed text-slate-700">
              {SITE.offer.body}
            </p>
            
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-white px-5 py-3 shadow-inner">
                <span className="font-body text-[11px] font-bold uppercase text-steel">Code:</span>
                <code className="font-mono text-base font-black tracking-widest text-amber-700">
                  {SITE.offer.code}
                </code>
              </div>
              <button
                type="button"
                onClick={() => { applyPromo(SITE.offer.code); open() }}
                className="rounded-full bg-ink px-8 py-3.5 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-slate-700 active:scale-95 shadow-md"
              >
                Apply Voucher &amp; Order
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Story teaser */}
      <section className="bg-stock pb-28 sm:pb-40">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="grid items-center gap-12 border-t border-ink/12 pt-20 lg:grid-cols-2 lg:gap-16">
            <RevealImage
              src="/assets/heritage/victorian-potato-seller.png"
              alt="A Victorian street vendor beside a coal-fired baked potato can"
              fallbackLabel="1851"
              className="aspect-[16/10] overflow-hidden rounded-3xl bg-line/40 shadow-md"
              imgClassName="grayscale-[.3]"
            />
            <Reveal>
              <span className="label text-amber-700 font-black">A British Classic</span>
              <h2 className="mt-3 display display-tight text-4xl text-ink sm:text-6xl">
                The Story of the
                <span className="block italic text-amber-600">Jacket Potato</span>
              </h2>
              <p className="mt-6 max-w-lg font-body text-[15px] leading-relaxed text-slate-700">
                The baked potato is Britain&rsquo;s original comfort food. In the 1800s, Victorian street vendors
                in bustling town squares sold ten tons of piping-hot potatoes every single day.
                Today at Just Spuds, we keep that rich British tradition alive — baking fluffy King Edward
                potatoes fresh in Aylesbury every day.
              </p>
              <Link
                to="/story"
                className="group mt-7 inline-flex items-center gap-2 font-body text-[12px] font-bold uppercase tracking-[0.16em] text-ink transition hover:text-amber-600"
              >
                <span>Discover the spud&rsquo;s history</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}

