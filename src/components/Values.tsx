import Reveal from './Reveal'
import { PillarIcon } from './Brand'
import { SITE } from '../data/site'

export default function Values() {
  return (
    <section className="bg-stock py-16 sm:py-24 border-y border-line/40">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <ul className="grid gap-6 sm:grid-cols-3">
          {SITE.pillars.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i} className="group relative rounded-3xl border border-line/70 bg-white/80 p-8 shadow-sm transition-all duration-300 hover:border-amber-400/50 hover:shadow-xl hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 transition-transform group-hover:scale-110">
                  <PillarIcon name={p.icon} className="h-6 w-6" />
                </div>
                <span className="font-body text-xs font-black text-steel/40">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-6 display text-xl text-ink">{p.title}</h3>
              <p className="mt-2 font-body text-[13px] leading-relaxed text-slate-600">{p.copy}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
