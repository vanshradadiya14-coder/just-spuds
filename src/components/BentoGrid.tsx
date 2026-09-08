import { Link } from 'react-router-dom'
import Reveal from './Reveal'
import RevealImage from './RevealImage'
import { gbp } from '../utils/format'

export default function BentoGrid() {
  return (
    <section className="relative overflow-hidden bg-ink-stock py-24 sm:py-36 text-white">
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        
        {/* Section Header */}
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-400">
                ✨ The Just Spuds Standard
              </span>
              <h2 className="mt-4 display display-tight text-4xl sm:text-6xl text-white">
                Crafted for flavour, <br className="hidden sm:inline" />
                <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
                  baked with passion
                </span>
              </h2>
            </div>
            <Link
              to="/menu"
              className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md transition hover:border-amber-400 hover:bg-white/10"
            >
              <span>Explore All 30+ Items</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </Reveal>

        {/* Award-Winning Bento Grid Layout */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-12">
          
          {/* Bento 1: Large Feature Card (The Spud Father) */}
          <Reveal className="sm:col-span-2 lg:col-span-7">
            <div className="group relative h-full min-h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#16181D] p-8 shadow-2xl transition-all duration-500 hover:border-amber-400/50 flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />
              <RevealImage
                src="/assets/food/spuds/spud-father.png"
                alt="The Spud Father Loaded Potato"
                className="absolute inset-0 h-full w-full opacity-65 transition-transform duration-700 ease-cine group-hover:scale-105"
                cover
              />

              <div className="relative z-20 flex items-start justify-between">
                <span className="rounded-full bg-amber-500 px-3.5 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-ink shadow-md">
                  ⭐ Signature Dish
                </span>
                <span className="font-body text-xl font-black text-amber-300 tabular-nums">
                  {gbp(695)}
                </span>
              </div>

              <div className="relative z-20 mt-auto">
                <p className="font-body text-xs font-bold uppercase tracking-wider text-amber-400">
                  Heavyweight Classic
                </p>
                <h3 className="mt-1 display text-3xl sm:text-4xl text-white">
                  The Spud Father
                </h3>
                <p className="mt-2 font-body text-sm text-white/80 max-w-md line-clamp-2">
                  Giant British jacket potato loaded with mature cheddar, crunchy fresh coleslaw, and signature golden spud sauce.
                </p>
                <Link
                  to="/menu"
                  className="mt-4 inline-flex items-center gap-1.5 font-body text-xs font-bold uppercase tracking-wider text-amber-400 group-hover:text-amber-300 transition"
                >
                  <span>Customise &amp; Order</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </Reveal>

          {/* Bento 2: 100% British Potatoes */}
          <Reveal className="sm:col-span-1 lg:col-span-5">
            <div className="group relative h-full min-h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#16181D] p-8 shadow-2xl transition-all duration-500 hover:border-amber-400/50 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-3xl">🥔</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-body text-[10px] font-bold uppercase text-white/70">
                  Grade A Produce
                </span>
              </div>

              <div className="my-6">
                <span className="font-body text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Continuous Small-Batch Baking
                </span>
                <h3 className="mt-2 display text-3xl text-white">
                  King Edward &amp; Maris Piper
                </h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-white/75">
                  Selected for their naturally fluffy, steaming center and crisp golden jacket skin. Baked fresh in Market Square every hour.
                </p>
              </div>

              <div className="flex items-center gap-3 border-t border-white/10 pt-4">
                <div className="flex-1">
                  <p className="font-body text-lg font-black text-amber-400">11 AM – 10 PM</p>
                  <p className="font-body text-[10px] uppercase text-white/60">Baking Fresh Daily</p>
                </div>
                <div className="flex-1">
                  <p className="font-body text-lg font-black text-amber-400">0 mins delay</p>
                  <p className="font-body text-[10px] uppercase text-white/60">Ready to Collect</p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Bento 3: Artisan Baguettes & Paninis */}
          <Reveal className="sm:col-span-1 lg:col-span-6">
            <div className="group relative h-full min-h-[340px] overflow-hidden rounded-3xl border border-white/10 bg-[#16181D] p-8 shadow-2xl transition-all duration-500 hover:border-amber-400/50 flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent z-10" />
              <RevealImage
                src="/assets/food/panini/panini-feature.png"
                alt="Toasted Pulled Chicken Panini"
                className="absolute inset-0 h-full w-full opacity-55 transition-transform duration-700 ease-cine group-hover:scale-105"
                cover
              />

              <div className="relative z-20 flex items-center justify-between">
                <span className="rounded-full bg-amber-500 px-3 py-0.5 font-body text-[10px] font-bold uppercase text-ink">
                  🥪 Hot Toasted
                </span>
                <span className="font-body text-sm font-bold text-amber-300">from £4.95</span>
              </div>

              <div className="relative z-20">
                <h3 className="display text-2xl sm:text-3xl text-white">
                  Toasted Paninis &amp; Crusty Baguettes
                </h3>
                <p className="mt-2 font-body text-xs text-white/80 line-clamp-2">
                  Ciabatta with dark diagonal grill marks and molten cheese pulls, or flour-dusted baguettes packed with fresh fillings.
                </p>
              </div>
            </div>
          </Reveal>

          {/* Bento 4: British Street Food Heritage */}
          <Reveal className="sm:col-span-2 lg:col-span-6">
            <div className="group relative h-full min-h-[340px] overflow-hidden rounded-3xl border border-white/10 bg-[#16181D] p-8 shadow-2xl transition-all duration-500 hover:border-amber-400/50 flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent z-10" />
              <RevealImage
                src="/assets/heritage/aylesbury-market.png"
                alt="Aylesbury Market Square"
                className="absolute inset-0 h-full w-full opacity-50 transition-transform duration-700 ease-cine group-hover:scale-105"
                cover
              />

              <div className="relative z-20 flex items-center justify-between">
                <span className="rounded-full bg-white/10 border border-white/20 px-3 py-0.5 font-body text-[10px] font-bold uppercase text-amber-300 backdrop-blur-md">
                  🥔 British Classic
                </span>
                <span className="font-body text-xs font-bold text-white/80">Market Square, Aylesbury</span>
              </div>

              <div className="relative z-20">
                <h3 className="display text-2xl sm:text-3xl text-white">
                  A Timeless Street Food Tradition
                </h3>
                <p className="mt-2 font-body text-xs text-white/80 line-clamp-2">
                  From Victorian street corners to historic market squares, the British jacket potato has always been the ultimate hot, hearty comfort food.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
