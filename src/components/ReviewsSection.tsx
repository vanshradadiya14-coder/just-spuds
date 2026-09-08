import Reveal from './Reveal'
import { REVIEWS, SITE } from '../data/site'

export default function ReviewsSection() {
  return (
    <section className="relative overflow-hidden bg-stock py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-50 px-4 py-1.5 font-body text-[11px] font-bold uppercase tracking-wider text-amber-700">
              <span className="text-amber-500">★★★★★</span>
              <span>{SITE.stats.rating} Local Rating ({SITE.stats.reviewCount} Reviews)</span>
            </div>
            <h2 className="mt-4 display display-tight text-4xl text-ink sm:text-6xl">
              Loved by <span className="italic text-amber-600">Aylesbury</span>
            </h2>
            <p className="mt-4 max-w-lg font-body text-[14px] leading-relaxed text-steel">
              From market stall shoppers to lunch-break regulars, here is what people are saying
              about our freshly baked jacket potatoes and sandwiches.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REVIEWS.map((r, i) => (
            <Reveal key={r.id} delay={i * 0.08}>
              <div className="glass-card flex h-full flex-col justify-between rounded-3xl p-6 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-warm">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex text-amber-500 text-sm">
                      {Array.from({ length: r.rating }).map((_, idx) => (
                        <span key={idx}>★</span>
                      ))}
                    </div>
                    <span className="font-body text-[10px] font-medium text-steel">{r.date}</span>
                  </div>

                  <h3 className="mt-3 font-body text-[14px] font-bold text-ink leading-snug">
                    &ldquo;{r.title}&rdquo;
                  </h3>
                  <p className="mt-2.5 font-body text-[12px] leading-relaxed text-slate-600">
                    {r.text}
                  </p>
                </div>

                <div className="mt-6 border-t border-ink/8 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-body text-[12px] font-bold text-ink">{r.author}</p>
                      <p className="font-body text-[10px] text-steel">{r.location}</p>
                    </div>
                    <span className="rounded-full bg-amber-100/80 px-2.5 py-1 font-body text-[9px] font-bold uppercase tracking-wider text-amber-800">
                      {r.item}
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Live Market Counter Banner */}
        <Reveal delay={3}>
          <div className="mt-16 rounded-3xl border border-ink/10 bg-gradient-to-r from-stone-900 via-zinc-900 to-stone-900 p-8 text-white shadow-xl sm:p-10">
            <div className="grid gap-8 sm:grid-cols-3 sm:divide-x sm:divide-white/10 text-center">
              <div className="space-y-1">
                <p className="display text-4xl sm:text-5xl text-amber-400 font-bold">{SITE.stats.potatoesBaked}</p>
                <p className="font-body text-[11px] uppercase tracking-wider text-white/60">Spuds Baked in Aylesbury</p>
              </div>
              <div className="space-y-1">
                <p className="display text-4xl sm:text-5xl text-white font-bold">{SITE.stats.rating} / 5.0</p>
                <p className="font-body text-[11px] uppercase tracking-wider text-white/60">Average Customer Score</p>
              </div>
              <div className="space-y-1">
                <p className="display text-4xl sm:text-5xl text-amber-400 font-bold">100%</p>
                <p className="font-body text-[11px] uppercase tracking-wider text-white/60">British Farm Potatoes</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
