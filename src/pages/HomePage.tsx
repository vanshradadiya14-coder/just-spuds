import { Link } from 'react-router-dom'
import Hero from '../components/Hero'
import NameBand from '../components/NameBand'
import Range from '../components/Range'
import FactsBand from '../components/FactsBand'
import Values from '../components/Values'
import Reveal from '../components/Reveal'
import Backdrop from '../components/Backdrop'
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
      <section className="on-dark relative overflow-hidden bg-ink-stock py-24 sm:py-36 border-t border-amber-500/15">
        <Backdrop tone="dark" grid={false} spotlight intensity={1.3} particles3D={true} />
        {/* Glowing Hearth Ambient Pool */}
        <div className="pointer-events-none absolute -top-32 right-1/4 h-[450px] w-[450px] rounded-full bg-gradient-to-br from-amber-400/20 to-amber-600/10 blur-[120px]" />
        <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-300">
              🥔 Handcrafted Your Way
            </span>
            <h2 className="mt-4 display display-tight text-5xl text-white sm:text-[72px]">
              Craft it
              <span className="block italic text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
                exactly how you like
              </span>
            </h2>
            <p className="mt-6 max-w-lg font-body text-[15px] sm:text-[16px] leading-relaxed text-amber-50/80">
              Start from any steaming British jacket potato, toasted ciabatta panini, flour-dusted baguette, or crisp salad bowl.
              Pile high with melting mature cheeses, savoury meats, fresh crunchy toppings, and our signature sauces.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/build"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-amber-400 px-8 py-4 font-body text-[12px] font-black uppercase tracking-[0.14em] text-ink shadow-hearth transition-all duration-300 hover:bg-amber-300 hover:scale-105 active:scale-95"
              >
                <span>🥔</span>
                <span>Craft Your Meal</span>
              </Link>
              <Link
                to="/menu"
                className="rounded-full border border-white/25 px-7 py-4 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/10 active:scale-95"
              >
                Browse Menu
              </Link>
            </div>
          </Reveal>

          <RevealImage
            src="/assets/food/spuds/spud-father.png"
            alt="The Spud Father"
            fallbackLabel="Craft a spud"
            className="aspect-square overflow-hidden rounded-3xl border border-amber-500/20 bg-white/[0.03] shadow-2xl"
            cover
          />
        </div>
      </section>

      {/* Customer Reviews & Social Proof */}
      <ReviewsSection />

      {/* First Visit Interactive Voucher Box - Artisan Ticket Design */}
      <section className="relative overflow-hidden bg-stock py-20 sm:py-28">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[550px] w-[550px] rounded-full bg-gradient-to-tr from-amber-400/20 via-amber-200/20 to-orange-400/10 blur-[130px]" />
        <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
          <Reveal className="relative overflow-hidden rounded-3xl border-2 border-dashed border-amber-400/60 bg-gradient-to-br from-white via-amber-50/60 to-amber-100/40 p-8 sm:p-14 shadow-warm text-center flex flex-col items-center">
            <span className="rounded-full bg-amber-400 px-4 py-1 font-body text-[10px] font-black uppercase tracking-wider text-ink shadow-sm">
              🎁 First Time Visitor Gift
            </span>
            <h2 className="mt-4 display display-tight max-w-2xl text-4xl text-ink sm:text-6xl font-bold">
              Your first drink&rsquo;s <span className="italic text-amber-700">on us</span>
            </h2>
            <p className="mt-4 max-w-xl font-body text-[15px] sm:text-[16px] leading-relaxed text-slate-700">
              {SITE.offer.body}
            </p>
            
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5">
              <div className="flex items-center gap-2.5 rounded-full border border-amber-300/80 bg-white px-5 py-3 shadow-inner">
                <span className="font-body text-[11px] font-bold uppercase text-slate-400">Coupon:</span>
                <code className="font-mono text-base font-black tracking-widest text-amber-800">
                  {SITE.offer.code}
                </code>
              </div>
              <button
                type="button"
                onClick={() => { applyPromo(SITE.offer.code); open() }}
                className="rounded-full bg-ink px-8 py-3.5 font-body text-[12px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-slate-800 active:scale-95 shadow-md hover:shadow-warm"
              >
                Apply Voucher &amp; Order →
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

