  import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal'
import RevealImage from './RevealImage'
import Backdrop from './Backdrop'
import { type CategoryId } from '../data/menu'
import { getCategories } from '../services/menuStore'
import { getProducts, subscribeMenu } from '../services/menuStore'
import { gbp } from '../utils/format'

/**
 * The shop is not a jacket-potato stall -- it makes four kinds of food plus
 * drinks and snacks. This is the section that says so.
 *
 * Counts and from-prices are derived from the menu, and each tile borrows its
 * picture from the first item in the category, so nothing here has to be kept
 * in sync by hand.
 */
const FOOD: CategoryId[] = ['SPUDS', 'WRAPS', 'RICE_BOXES', 'BAGUETTES', 'PANINIS', 'SALADS']

export default function Range() {
  const [products, setProducts] = useState(() => getProducts())

  useEffect(() => {
    return subscribeMenu(() => {
      setProducts(getProducts())
    })
  }, [])

  const activeCategories = getCategories()

  const tiles = FOOD.map((id) => {
    const cat = activeCategories.find((c) => c.id === id)
    if (!cat) return null
    const items = products.filter((p) => p.category === id)
    const from = items.reduce((m, p) => Math.min(m, p.price), Infinity)
    return { cat, items, from, lead: items[0] }
  }).filter((t): t is NonNullable<typeof t> => t !== null && t.items.length > 0)

  const extras = activeCategories.filter(
    (c) => !FOOD.includes(c.id) && products.some((p) => p.category === c.id),
  )

  return (
    <section className="relative overflow-hidden bg-stock py-28 sm:py-40">
      <Backdrop tone="light" spotlight intensity={0.5} />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-6 border-b border-ink/12 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="label text-steel">More than just spuds</span>
              <h2 className="mt-3 display display-tight text-5xl text-ink sm:text-[72px]">
                Freshly made
                <span className="block italic text-steel">hot &amp; loaded your way</span>
              </h2>
            </div>
            <Link
              to="/menu"
              className="ul-draw shrink-0 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-ink"
            >
              See the full menu
            </Link>
          </div>
        </Reveal>

        <ul className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <li key={t.cat.id}>
              <Link
                to={`/menu#${t.cat.id}`}
                className="group flex flex-col h-full overflow-hidden rounded-3xl border border-ink/8 bg-white p-4 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-warm"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper">
                  <RevealImage
                    src={t.lead.image}
                    alt={t.cat.label}
                    fallbackLabel={t.cat.label}
                    className="h-full w-full"
                    imgClassName="transition-transform duration-[900ms] ease-cine group-hover:scale-[1.08]"
                    cover
                    delay={i * 0.07}
                  />
                  <span className="absolute bottom-3 right-3 rounded-full bg-ink/80 px-3 py-1 font-body text-[10px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-md">
                    from {gbp(t.from)}
                  </span>
                </div>
                
                <div className="mt-4 flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="display text-[22px] text-ink group-hover:text-amber-600 transition-colors">
                        {t.cat.label}
                      </h3>
                      <span className="font-body text-[10px] font-bold uppercase tracking-wider text-steel">
                        {t.items.length} options
                      </span>
                    </div>
                    <p className="mt-1.5 font-body text-[12px] leading-relaxed text-slate-600">
                      {t.cat.blurb}
                    </p>
                  </div>
                  
                  <div className="mt-4 flex items-center gap-1 font-body text-[11px] font-bold uppercase tracking-wider text-ink group-hover:text-amber-600 transition-colors">
                    <span>View items</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {extras.length > 0 && (
          <Reveal>
            <p className="mt-14 border-t border-ink/12 pt-8 font-body text-[12px] leading-relaxed text-steel">
              Plus{' '}
              {extras.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && (i === extras.length - 1 ? ' and ' : ', ')}
                  <Link to={`/menu#${c.id}`} className="ul-draw text-ink">
                    {c.label.toLowerCase()}
                  </Link>
                </span>
              ))}
              .
            </p>
          </Reveal>
        )}
      </div>
    </section>
  )
}
