import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal'
import RevealImage from './RevealImage'
import Backdrop from './Backdrop'
import { type CategoryId } from '../data/menu'
import { getCategories, getOnlineProducts, subscribeMenu } from '../services/menuStore'
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
  const [products, setProducts] = useState(() => getOnlineProducts())

  useEffect(() => {
    return subscribeMenu(() => {
      setProducts(getOnlineProducts())
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
    <section className="relative overflow-hidden bg-stock py-20 sm:py-32">
      <Backdrop tone="light" spotlight intensity={0.65} />
      {/* Radiant Ambient Honey & Hearth Pools */}
      <div className="pointer-events-none absolute -top-40 right-1/4 h-[550px] w-[550px] rounded-full bg-gradient-to-br from-amber-400/20 via-amber-200/15 to-transparent blur-[130px]" />
      <div className="pointer-events-none absolute bottom-20 left-10 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-500/15 to-transparent blur-[120px]" />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-6 border-b border-amber-900/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="label text-amber-800 font-black">Handcrafted Fresh Daily</span>
              <h2 className="mt-3 display display-tight text-5xl text-ink sm:text-[72px]">
                Freshly made
                <span className="block italic text-amber-700">hot &amp; loaded your way</span>
              </h2>
            </div>
            <Link
              to="/menu"
              className="ul-draw shrink-0 font-body text-[12px] font-bold uppercase tracking-[0.16em] text-ink hover:text-amber-700 transition"
            >
              See the full menu →
            </Link>
          </div>
        </Reveal>

        {/* Two across on phones (six full-screen cards was a long scroll), three
            across on desktop so the six food categories make two full rows. */}
        <ul className="mt-10 sm:mt-14 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 lg:gap-8">
          {tiles.map((t, i) => (
            <li key={t.cat.id}>
              <Link
                to={`/menu#${t.cat.id}`}
                className="group flex flex-col h-full overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-900/10 bg-white/95 p-2.5 sm:p-4 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-warm-lg hover:border-amber-500/35"
              >
                <div className="relative aspect-square sm:aspect-[4/3] overflow-hidden rounded-xl sm:rounded-2xl bg-amber-50/50">
                  <RevealImage
                    src={t.lead.image}
                    alt={t.cat.label}
                    fallbackLabel={t.cat.label}
                    className="h-full w-full"
                    imgClassName="transition-transform duration-[900ms] ease-cine group-hover:scale-[1.08]"
                    cover
                    delay={i * 0.07}
                  />
                  <span className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 rounded-full bg-[#1C1713]/90 px-2.5 sm:px-3.5 py-0.5 sm:py-1 font-body text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-md shadow-md">
                    from {gbp(t.from)}
                  </span>
                </div>

                <div className="mt-3 sm:mt-4 flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="display text-lg leading-tight sm:text-[22px] text-ink group-hover:text-amber-700 transition-colors">
                        {t.cat.label}
                      </h3>
                      <span className="hidden sm:inline font-body text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 shrink-0">
                        {t.items.length} options
                      </span>
                    </div>
                    <p className="mt-1 sm:mt-2 font-body text-[12px] sm:text-[13px] leading-snug sm:leading-relaxed text-slate-700 line-clamp-2 sm:line-clamp-none">
                      {t.cat.blurb}
                    </p>
                  </div>

                  <div className="mt-2.5 sm:mt-4 flex items-center gap-1.5 font-body text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-700 group-hover:text-amber-600 transition-colors">
                    <span className="sm:hidden">{t.items.length} options</span>
                    <span className="hidden sm:inline">Explore category</span>
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
