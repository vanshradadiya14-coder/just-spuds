import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { cx, gbp } from '../utils/format'

/**
 * Persistent order rail. Once anything is in the basket this stays on screen
 * on every page — the single most important thing a takeaway site can do.
 */
export default function OrderBar() {
  const { count, finalTotal, open, bump, isOpen, fulfilment } = useCart()
  const { pathname } = useLocation()
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (bump === 0) return
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 520)
    return () => clearTimeout(t)
  }, [bump])

  const [isModalActive, setIsModalActive] = useState(false)

  useEffect(() => {
    const checkModal = () => {
      const isLocked = document.body.style.overflow === 'hidden'
      const hasModal = Boolean(document.querySelector('[role="dialog"]'))
      setIsModalActive(isLocked || hasModal)
    }
    checkModal()
    const observer = new MutationObserver(checkModal)
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] })
    return () => observer.disconnect()
  }, [])

  if (isOpen || isModalActive) return null

  const empty = count === 0

  return (
    <div className="hidden lg:block pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6 sm:pb-6">
      <div
        className={cx(
          'pointer-events-auto mx-auto flex max-w-[1400px] items-center gap-4 rounded-full border border-white/10 bg-ink/95 px-5 py-3 text-white shadow-[0_18px_50px_-16px_rgba(0,0,0,.7)] backdrop-blur-xl transition-all duration-500 ease-cine sm:px-6',
          empty ? 'translate-y-[140%] opacity-0' : 'translate-y-0 opacity-100',
          pulse && 'scale-[1.015]',
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 font-body text-[10px] font-black text-ink">
            {count}
          </span>
          <span className="truncate font-body text-[11px] text-white/70">
            {fulfilment === 'delivery' ? '🛵 Home Delivery' : '🛍️ Store Pick Up'}
          </span>
        </span>

        <span className="ml-auto shrink-0 font-body text-[15px] font-semibold tabular-nums text-amber-300">
          {gbp(finalTotal)}
        </span>

        <button
          type="button"
          onClick={open}
          className="shrink-0 rounded-full bg-amber-400 px-6 py-2.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors duration-300 hover:bg-amber-300 shadow-sm"
        >
          View Order
        </button>

        {pathname !== '/menu' && (
          <Link
            to="/menu"
            className="hidden shrink-0 rounded-full border border-white/25 px-6 py-2.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors duration-300 hover:border-white sm:block"
          >
            Add more
          </Link>
        )}
      </div>
    </div>
  )
}
