import Reveal from './Reveal'
import Backdrop, { GhostType } from './Backdrop'
import RevealImage from './RevealImage'
import { SITE } from '../data/site'

export default function Offer() {
  return (
    <section className="on-dark relative overflow-hidden bg-ink py-24 sm:py-32">
      <Backdrop tone="dark" grid={false} spotlight intensity={1.0} />
      <GhostType className="-left-[4%] top-[-8%] text-[22vw]">FREE</GhostType>
      <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr]">
        <Reveal>
          <span className="label text-white/40">First visit</span>
          <h2 className="mt-3 display text-5xl uppercase leading-[0.86] text-white sm:text-7xl">
            Your first
            <span className="block italic text-white/40">one&rsquo;s on us</span>
          </h2>
          <p className="mt-6 max-w-md font-body text-[15px] leading-relaxed text-white/60">{SITE.offer.body}</p>
          <p className="mt-7 inline-flex items-center gap-3 border border-white/20 px-5 py-2.5 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
            {SITE.offer.qualifier}
          </p>
        </Reveal>

        <Reveal delay={1}>
          <div className="grid grid-cols-2 gap-4">
            <figure>
              <div className="aspect-[4/5] overflow-hidden bg-white/[0.04]">
                <RevealImage src="/assets/drinks/coffee/coffee-promo.png" alt="Coffee" fallbackLabel="Coffee" className="h-full w-full" imgClassName="p-5" cover={false} />
              </div>
              <figcaption className="mt-2.5 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Coffee</figcaption>
            </figure>
            <figure className="sm:translate-y-8">
              <div className="aspect-[4/5] overflow-hidden bg-white/[0.04]">
                <RevealImage src="/assets/drinks/thick-shake/shake-promo.png" alt="Thick shake" fallbackLabel="Thick shakes" className="h-full w-full" imgClassName="p-5" cover={false} delay={0.12} />
              </div>
              <figcaption className="mt-2.5 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Thick shakes</figcaption>
            </figure>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
