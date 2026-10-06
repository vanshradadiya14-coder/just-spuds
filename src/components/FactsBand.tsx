import { useState, useEffect } from 'react'
import Reveal from './Reveal'
import { getOnlineProducts, getExtras, getSauces, subscribeMenu } from '../services/menuStore'
import { gbp } from '../utils/format'

/**
 * Four terse facts, one idea each, with a lot of air around them -- the
 * pacing device this genre uses instead of a paragraph.
 *
 * Every figure is counted from the live menu rather than typed in, so the
 * band cannot drift out of step with the board in the shop.
 */
export default function FactsBand() {
  const [products, setProducts] = useState(() => getOnlineProducts())
  const [extras, setExtras] = useState(() => getExtras())
  const [sauces, setSauces] = useState(() => getSauces())

  useEffect(() => {
    return subscribeMenu(() => {
      setProducts(getOnlineProducts())
      setExtras(getExtras())
      setSauces(getSauces())
    })
  }, [])

  // Priced items only: a few snack lines carry no price on the board yet, and
  // counting them would quietly overstate the menu.
  const priced = products.filter((p) => p.price > 0)
  const from = priced.reduce((min, p) => Math.min(min, p.price), Infinity)

  const facts = [
    { figure: `${priced.length}+`, label: 'Fresh Menu Items Made Daily' },
    { figure: gbp(from), label: 'Wholesome Mains Starting From' },
    { figure: `${extras.length}+`, label: 'Fresh Toppings & Grated Cheeses' },
    { figure: `${sauces.length}`, label: 'Signature Sauces Free With Order' },
  ]

  return (
    <section className="on-dark relative overflow-hidden bg-[#161310] border-y border-amber-500/20 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <ul className="grid grid-cols-2 gap-y-12 sm:gap-y-16 lg:grid-cols-4">
          {facts.map((f, i) => (
            <Reveal as="li" key={f.label} delay={i} className="text-center px-3">
              <p className="display display-tight text-[48px] text-amber-300 sm:text-[68px] lg:text-[76px] font-bold">
                {f.figure}
              </p>
              <p className="mx-auto mt-3 max-w-[16ch] font-body text-[11px] font-bold uppercase leading-relaxed tracking-[0.18em] text-amber-100/70">
                {f.label}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
