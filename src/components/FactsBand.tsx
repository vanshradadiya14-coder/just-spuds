import { useState, useEffect } from 'react'
import Reveal from './Reveal'
import { getProducts, getExtras, getSauces, subscribeMenu } from '../services/menuStore'
import { gbp } from '../utils/format'

/**
 * Four terse facts, one idea each, with a lot of air around them -- the
 * pacing device this genre uses instead of a paragraph.
 *
 * Every figure is counted from the live menu rather than typed in, so the
 * band cannot drift out of step with the board in the shop.
 */
export default function FactsBand() {
  const [products, setProducts] = useState(() => getProducts())
  const [extras, setExtras] = useState(() => getExtras())
  const [sauces, setSauces] = useState(() => getSauces())

  useEffect(() => {
    return subscribeMenu(() => {
      setProducts(getProducts())
      setExtras(getExtras())
      setSauces(getSauces())
    })
  }, [])

  // Priced items only: a few snack lines carry no price on the board yet, and
  // counting them would quietly overstate the menu.
  const priced = products.filter((p) => p.price > 0)
  const from = priced.reduce((min, p) => Math.min(min, p.price), Infinity)

  const facts = [
    { figure: String(priced.length), label: 'things on the menu' },
    { figure: gbp(from), label: 'is where they start' },
    { figure: String(extras.length), label: 'extras to pile on' },
    { figure: String(sauces.length), label: 'sauces, all included' },
  ]

  return (
    <section className="on-dark relative overflow-hidden bg-ink py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <ul className="grid grid-cols-2 gap-y-14 sm:gap-y-16 lg:grid-cols-4">
          {facts.map((f, i) => (
            <Reveal as="li" key={f.label} delay={i} className="text-center">
              <p className="display display-tight text-[54px] text-white sm:text-[76px] lg:text-[88px]">
                {f.figure}
              </p>
              <p className="mx-auto mt-3 max-w-[15ch] font-body text-[11px] font-bold uppercase leading-relaxed tracking-[0.2em] text-white/45">
                {f.label}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
