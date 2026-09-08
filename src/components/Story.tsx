import Reveal from './Reveal'
import RevealImage from './RevealImage'
import Backdrop from './Backdrop'
import { HERITAGE } from '../data/site'

export default function Story({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <section id="story" className={`relative overflow-hidden bg-stock ${embedded ? "pb-24 pt-16 sm:pb-32" : "py-24 sm:py-32"}`}>
      <Backdrop tone="light" spotlight intensity={0.35} gl={false} />

      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        {!embedded && (
          <Reveal>
            <div className="flex flex-col gap-4 border-b border-ink/12 pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="label text-amber-700 font-bold">British Culinary Heritage</span>
                <h2 className="mt-2 display text-4xl text-ink sm:text-5xl lg:text-6xl">
                  The Story of the <span className="italic text-amber-600">Jacket Potato</span>
                </h2>
              </div>
              <p className="max-w-md font-body text-xs leading-relaxed text-slate-600">
                How a simple potato became Britain&apos;s most iconic comfort food — from Victorian street ovens to fresh daily baking at Just Spuds.
              </p>
            </div>
          </Reveal>
        )}

        <div className="relative mt-12 sm:mt-20">
          {/* Subtle Vertical Heritage Timeline Thread (Desktop) */}
          <div className="absolute left-1/2 top-8 bottom-8 hidden -translate-x-1/2 w-0.5 bg-gradient-to-b from-amber-500/20 via-amber-500/40 to-amber-500/10 lg:block" />

          <ol className="space-y-16 sm:space-y-24">
            {HERITAGE.map((h, i) => {
              const isEven = i % 2 === 0
              return (
                <Reveal as="li" key={h.year} delay={i * 0.1}>
                  <article className={`relative grid items-center gap-8 rounded-3xl border border-ink/8 bg-white/85 p-6 sm:p-10 shadow-warm backdrop-blur-md transition-all duration-500 hover:border-amber-400/40 lg:grid-cols-12 lg:gap-14 ${!isEven ? 'lg:[&>figure]:col-start-7' : ''}`}>
                    
                    {/* Media Figure */}
                    <figure className="lg:col-span-6">
                      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-paper shadow-md">
                        <RevealImage
                          src={h.image}
                          alt={h.alt}
                          fallbackLabel={h.year}
                          className="h-full w-full"
                          imgClassName="transition-transform duration-1000 ease-cine hover:scale-105"
                          cover
                        />
                        <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl pointer-events-none" />
                      </div>
                      {h.source && (
                        <figcaption className="mt-3 font-body text-[11px] italic text-steel flex items-center gap-1.5">
                          <span>📜</span>
                          <span>Source: {h.source}</span>
                        </figcaption>
                      )}
                    </figure>

                    {/* Text Narrative */}
                    <div className={`lg:col-span-6 ${!isEven ? 'lg:col-start-1 lg:row-start-1' : ''} lg:self-center`}>
                      <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/80 border border-amber-300/60 px-3.5 py-1 text-amber-900 font-body text-[11px] font-bold uppercase tracking-wider shadow-sm">
                        <span>{h.year === 'Today' ? '🥔' : '⏳'} Era:</span>
                        <span className="font-black text-amber-700">{h.year}</span>
                      </div>

                      <h3 className="mt-4 display text-2xl font-bold uppercase leading-tight text-ink sm:text-3xl lg:text-4xl">
                        {h.title}
                      </h3>

                      <p className="mt-4 font-body text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
                        {h.body}
                      </p>

                      {h.year === '1239' && (
                        <blockquote className="mt-5 rounded-2xl border-l-4 border-amber-500 bg-amber-50/50 p-4 font-body text-xs italic text-slate-700">
                          &ldquo;Historic market squares have brought communities together for hot, wholesome hearth food for centuries.&rdquo;
                        </blockquote>
                      )}

                      {h.year === '1851' && (
                        <blockquote className="mt-5 rounded-2xl border-l-4 border-amber-500 bg-amber-50/50 p-4 font-body text-xs italic text-slate-700">
                          &ldquo;Hot, floury, and comforting on the coldest winter nights — the original British street food.&rdquo;
                        </blockquote>
                      )}

                      {h.year === 'Today' && (
                        <blockquote className="mt-5 rounded-2xl border-l-4 border-amber-500 bg-amber-50/50 p-4 font-body text-xs italic text-slate-700">
                          &ldquo;At Just Spuds, we honor this timeless British street food tradition with fresh small-batch baking every day in Aylesbury.&rdquo;
                        </blockquote>
                      )}
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
