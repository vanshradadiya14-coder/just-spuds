import { useState } from 'react'
import Reveal from './Reveal'
import { FAQS } from '../data/site'

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i)
  }

  return (
    <section className="bg-stock py-24 sm:py-32">
      <div className="mx-auto max-w-[900px] px-5 sm:px-8">
        <Reveal>
          <div className="text-center">
            <span className="label text-steel">Questions & Answers</span>
            <h2 className="mt-3 display display-tight text-4xl text-ink sm:text-5xl">
              Frequently <span className="italic text-amber-600">Asked</span>
            </h2>
            <p className="mt-3 font-body text-[14px] leading-relaxed text-steel">
              Everything you need to know about our ingredients, ordering, and market visits.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 space-y-4">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i
            return (
              <Reveal key={i} delay={i * 0.05}>
                <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white/90 shadow-sm transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between p-5 text-left font-body text-[14px] font-bold text-ink sm:text-[15px]"
                  >
                    <span>{faq.q}</span>
                    <span
                      className={`ml-4 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-ink/10 text-xs transition-transform duration-300 ${
                        isOpen ? 'rotate-180 bg-ink text-white' : 'bg-paper text-ink'
                      }`}
                    >
                      ↓
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-ink/8 px-5 pb-5 pt-3 font-body text-[13px] leading-relaxed text-slate-600">
                      {faq.a}
                    </div>
                  )}
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
