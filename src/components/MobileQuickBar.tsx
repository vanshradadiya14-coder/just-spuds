import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { gbp } from '../utils/format'

export default function MobileQuickBar() {
  const { pathname } = useLocation()
  const { count, subtotal, open, isOpen } = useCart()
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

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 block border-t border-ink/10 bg-white/95 px-3 py-2.5 shadow-2xl backdrop-blur-lg lg:hidden">
      <div className="flex items-center justify-between gap-1.5">
        <Link
          to="/"
          className={`flex flex-1 items-center justify-center gap-1 rounded-full py-2 font-body text-[10px] font-bold uppercase tracking-wider transition ${
            pathname === '/' ? 'bg-amber-400 text-ink shadow-sm font-black' : 'bg-paper text-ink hover:bg-stone-200'
          }`}
        >
          <span>🏠</span>
          <span>Home</span>
        </Link>

        <Link
          to="/menu"
          className={`flex flex-1 items-center justify-center gap-1 rounded-full py-2 font-body text-[10px] font-bold uppercase tracking-wider transition ${
            pathname.startsWith('/menu') ? 'bg-amber-400 text-ink shadow-sm font-black' : 'bg-paper text-ink hover:bg-stone-200'
          }`}
        >
          <span>🍽️</span>
          <span>Order</span>
        </Link>

        <Link
          to="/find-us"
          className={`flex flex-1 items-center justify-center gap-1 rounded-full py-2 font-body text-[10px] font-bold uppercase tracking-wider transition ${
            pathname === '/find-us' ? 'bg-amber-400 text-ink shadow-sm font-black' : 'bg-paper text-ink hover:bg-stone-200'
          }`}
        >
          <span>📍</span>
          <span>Location</span>
        </Link>

        <button
          type="button"
          onClick={open}
          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-ink py-2 font-body text-[10px] font-bold uppercase tracking-wider text-white transition active:scale-95 shadow-sm"
        >
          <span>🛍️</span>
          <span className="truncate">{count > 0 ? `${count} · ${gbp(subtotal)}` : 'Bag'}</span>
        </button>
      </div>
    </div>
  )
}
