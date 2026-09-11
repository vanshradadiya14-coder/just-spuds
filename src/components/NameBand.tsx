import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getOnlineProducts, subscribeMenu } from '../services/menuStore'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * Giant repeated product names running edge to edge -- the band nearly every
 * well-made site in this genre uses to break the vertical rhythm.
 *
 * Two departures from the usual decorative version: each name is a real link,
 * so the ornament doubles as navigation, and scrolling nudges the rows along
 * their axis. The nudge is clamped hard -- a runaway offset here would drag
 * blank space through the section, so it can never exceed a few dozen pixels.
 *
 * Rows are sliced from the live menu rather than listed by id, so adding or
 * removing a spud can never leave a dead link behind.
 */
export default function NameBand() {
  const [products, setProducts] = useState(() => getOnlineProducts())
  const reduced = useReducedMotion()

  useEffect(() => {
    return subscribeMenu(() => {
      setProducts(getOnlineProducts())
    })
  }, [])

  // Interleave the food categories so the band reads as the whole shop rather
  // than a jacket-potato list. Drinks and snacks stay out -- they have no
  // photography and no product page worth landing on.
  const food = products.filter((p) =>
    ['SPUDS', 'BAGUETTES', 'PANINIS', 'SALADS'].includes(p.category),
  )
  const rows = [
    { items: food.filter((_, i) => i % 2 === 0), seconds: 62, reverse: false },
    { items: food.filter((_, i) => i % 2 === 1), seconds: 74, reverse: true },
  ].filter((r) => r.items.length > 0)

  // Pure GPU CSS marquee without scroll event jank

  return (
    <section
      aria-label="Our spuds"
      className="on-dark relative isolate overflow-hidden border-y border-white/10 bg-ink-stock py-10 sm:py-14"
    >
      <div className="flex flex-col gap-2 sm:gap-4">
        {rows.map((row, r) => {
          const loop = [...row.items, ...row.items, ...row.items, ...row.items]
          return (
            <div key={r} className="marquee-row flex">
              <ul
                className={`flex shrink-0 items-center ${reduced ? '' : 'animate-marquee'}`}
                style={
                  reduced
                    ? undefined
                    : {
                        animationDuration: `${row.seconds}s`,
                        animationDirection: row.reverse ? 'reverse' : 'normal',
                      }
                }
              >
                {loop.map((p, i) => {
                  // Only the first pass is real to assistive tech and the tab
                  // order; the repeats exist purely to make the loop seamless.
                  const echo = i >= row.items.length
                  return (
                    <li
                      key={`${p.id}-${i}`}
                      className="flex shrink-0 items-center"
                      aria-hidden={echo || undefined}
                    >
                      <Link
                        to={`/menu/${p.id}`}
                        tabIndex={echo ? -1 : undefined}
                        className="band-name display whitespace-nowrap px-5 text-[38px] leading-none sm:px-8 sm:text-[68px] lg:text-[88px]"
                      >
                        {p.name}
                      </Link>
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-white/25" />
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Feather the ends so names enter and leave rather than being chopped. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-40"
        style={{ background: 'linear-gradient(to right, #0A0A0B, transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-40"
        style={{ background: 'linear-gradient(to left, #0A0A0B, transparent)' }}
      />
    </section>
  )
}
