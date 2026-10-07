import Reveal from './Reveal'
import { REVIEWS, SITE } from '../data/site'
import { getBusinessDetails } from '../services/menuStore'

/**
 * Publishing made-up reviews or a made-up rating is a banned practice under
 * the UK's Digital Markets, Competition and Consumers Act 2024. The sample
 * reviews in data/site.ts were written for the design, so only entries marked
 * `verified: true` (copied from a real Google review) and a verified rating
 * are shown. Until then the section asks customers for their review instead.
 */
export default function ReviewsSection() {
  const reviews = REVIEWS.filter((r) => (r as { verified?: boolean }).verified === true)
  const ratingVerified = (SITE.stats as { ratingVerified?: boolean }).ratingVerified === true
  const reviewUrl = getBusinessDetails().social.googleReviews || 'https://maps.google.com/?q=Just+Spuds+Aylesbury'

  return (
    <section className="relative overflow-hidden bg-stock py-24 sm:py-32 border-b border-amber-900/10">
      {/* Radiant Ambient Honey & Hearth Pools */}
      <div className="pointer-events-none absolute -top-40 right-1/4 h-[550px] w-[550px] rounded-full bg-gradient-to-br from-amber-400/20 via-amber-200/15 to-transparent blur-[130px]" />
      <div className="pointer-events-none absolute bottom-20 left-10 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-500/15 to-transparent blur-[120px]" />
      <div className="relative z-10 mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            {ratingVerified && (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-1.5 font-body text-[11px] font-black uppercase tracking-wider text-amber-800 shadow-xs">
                <span className="text-amber-500">★★★★★</span>
                <span>{SITE.stats.rating} on Google &bull; {SITE.stats.reviewCount}+ local reviews</span>
              </div>
            )}
            <h2 className="mt-4 display display-tight text-4xl text-ink sm:text-6xl">
              {reviews.length ? (
                <>Loved by <span className="italic text-amber-700">Aylesbury</span></>
              ) : (
                <>Tried us? <span className="italic text-amber-700">Tell Aylesbury.</span></>
              )}
            </h2>
            <p className="mt-4 max-w-xl font-body text-[15px] leading-relaxed text-slate-700">
              {reviews.length
                ? 'From market stall shoppers to lunch-break regulars, here is what our local community says about our steaming jacket potatoes, toasted paninis, and friendly service.'
                : 'We are a small, local kitchen and every honest review helps. Tell other people what you had and what you thought.'}
            </p>
          </div>
        </Reveal>

        {reviews.length > 0 && (
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {reviews.map((r, i) => (
            <Reveal key={r.id} delay={i * 0.08}>
              <div className="group flex h-full flex-col justify-between rounded-3xl border border-amber-900/10 bg-white/95 p-6 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-warm-lg hover:border-amber-400/40">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex text-amber-500 text-sm tracking-tight">
                      {Array.from({ length: r.rating }).map((_, idx) => (
                        <span key={idx}>★</span>
                      ))}
                    </div>
                    <span className="font-body text-[11px] font-medium text-slate-400">{r.date}</span>
                  </div>

                  <h3 className="mt-3.5 font-display text-[16px] font-bold text-ink leading-snug">
                    &ldquo;{r.title}&rdquo;
                  </h3>
                  <p className="mt-2.5 font-body text-[13px] leading-relaxed text-slate-700">
                    {r.text}
                  </p>
                </div>

                <div className="mt-6 border-t border-amber-900/10 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-400/20 font-body text-[11px] font-black text-amber-900 border border-amber-400/30">
                        {r.author.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-body text-[12px] font-bold text-ink">{r.author}</p>
                        <p className="font-body text-[10px] text-slate-500">{r.location}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100/90 px-2.5 py-1 font-body text-[9px] font-black uppercase tracking-wider text-amber-900 shrink-0">
                      {r.item}
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        )}

        {/* Live Market Counter Banner */}
        <Reveal delay={3}>
          <div className="mt-16 rounded-3xl border border-amber-500/25 bg-[#161310] p-8 text-white shadow-warm-lg sm:p-10">
            <div className="grid gap-8 sm:grid-cols-3 sm:divide-x sm:divide-white/10 text-center">
              <div className="space-y-1">
                <p className="display text-4xl sm:text-5xl text-amber-400 font-bold">{SITE.stats.potatoesBaked}</p>
                <p className="font-body text-[11px] uppercase tracking-wider text-amber-100/70">Spuds Baked in Aylesbury</p>
              </div>
              <div className="space-y-1">
                {ratingVerified ? (
                  <>
                    <p className="display text-4xl sm:text-5xl text-white font-bold">{SITE.stats.rating} / 5.0</p>
                    <p className="font-body text-[11px] uppercase tracking-wider text-amber-100/70">Average Google rating ({SITE.stats.reviewCount}+ reviews)</p>
                  </>
                ) : (
                  <>
                    <p className="display text-4xl sm:text-5xl text-white font-bold">20–30 min</p>
                    <p className="font-body text-[11px] uppercase tracking-wider text-amber-100/70">Fresh batches from the oven</p>
                  </>
                )}
              </div>
              <div className="space-y-1">
                <p className="display text-4xl sm:text-5xl text-amber-400 font-bold">100%</p>
                <p className="font-body text-[11px] uppercase tracking-wider text-amber-100/70">British Farm Potatoes</p>
              </div>
            </div>
          </div>
        </Reveal>

        <div className={reviews.length ? 'mt-10 text-center' : 'mt-8 text-center'}>
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-amber-900/20 bg-white/80 px-6 py-3 font-body text-xs font-bold uppercase tracking-wider text-ink hover:bg-amber-400 hover:text-ink hover:border-amber-400 shadow-sm transition active:scale-95"
          >
            <span className="text-amber-500">★</span>
            <span>Leave a Google Review</span>
            <span>→</span>
          </a>
        </div>
      </div>
    </section>
  )
}
