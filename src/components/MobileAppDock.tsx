import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { gbp, cx } from '../utils/format'

export default function MobileAppDock() {
  const { pathname } = useLocation()
  const {
    count,
    finalTotal,
    open,
    isOpen,
    isOnlineOrderingEnabled,
  } = useCart()
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

  const isHome = pathname === '/'
  const isMenu = pathname.startsWith('/menu')
  const isBuild = pathname === '/build'
  const isFindUs = pathname === '/find-us'

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 block lg:hidden pointer-events-none select-none">
      <div className="relative pointer-events-auto">
        {/* Deliveroo / UberEats style Floating "View Basket" Bar */}
        <AnimatePresence>
          {count > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 26, stiffness: 360 }}
              className="px-3 pb-2"
            >
              <button
                type="button"
                onClick={open}
                className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-slate-950 shadow-[0_10px_25px_-5px_rgba(245,158,11,0.45)] border border-amber-300 active:scale-[0.98] transition-transform"
                aria-label="View basket"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-[11px] font-black text-amber-300 shadow-sm">
                    {count}
                  </span>
                  <span className="font-body text-xs font-black uppercase tracking-wider">
                    View Basket
                  </span>
                  {!isOnlineOrderingEnabled && (
                    <span className="rounded-full bg-slate-950/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-900">
                      Launch Mode
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-body text-sm font-black tabular-nums">
                    {gbp(finalTotal)}
                  </span>
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Native App Bottom Tab Bar */}
        <nav
          className="border-t border-slate-200/80 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
          aria-label="Mobile Navigation"
        >
          <div className="grid grid-cols-5 items-center">
            {/* 1. HOME */}
            <Link
              to="/"
              className={cx(
                'flex flex-col items-center justify-center py-1 transition-all active:scale-90',
                isHome ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className="relative flex items-center justify-center h-6 w-6 mb-0.5">
                <HomeIcon className={cx('h-5 w-5 transition-colors', isHome ? 'stroke-[2.2]' : 'stroke-[1.7]')} />
              </div>
              <span className="font-body text-[10px] tracking-tight uppercase font-bold">Home</span>
              {isHome && <span className="mt-0.5 h-1 w-1 rounded-full bg-amber-500" />}
            </Link>

            {/* 2. MENU */}
            <Link
              to="/menu"
              className={cx(
                'flex flex-col items-center justify-center py-1 transition-all active:scale-90',
                isMenu ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className="relative flex items-center justify-center h-6 w-6 mb-0.5">
                <MenuIcon className={cx('h-5 w-5 transition-colors', isMenu ? 'stroke-[2.2]' : 'stroke-[1.7]')} />
              </div>
              <span className="font-body text-[10px] tracking-tight uppercase font-bold">Menu</span>
              {isMenu && <span className="mt-0.5 h-1 w-1 rounded-full bg-amber-500" />}
            </Link>

            {/* 3. CUSTOM SPUD LAB */}
            <Link
              to="/build"
              className={cx(
                'flex flex-col items-center justify-center py-1 transition-all active:scale-90',
                isBuild ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className="relative flex items-center justify-center h-6 w-6 mb-0.5">
                <BuildIcon className={cx('h-5 w-5 transition-colors', isBuild ? 'stroke-[2.2]' : 'stroke-[1.7]')} />
              </div>
              <span className="font-body text-[10px] tracking-tight uppercase font-bold">Build Lab</span>
              {isBuild && <span className="mt-0.5 h-1 w-1 rounded-full bg-amber-500" />}
            </Link>

            {/* 4. FIND US & HOURS */}
            <Link
              to="/find-us"
              className={cx(
                'flex flex-col items-center justify-center py-1 transition-all active:scale-90',
                isFindUs ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className="relative flex items-center justify-center h-6 w-6 mb-0.5">
                <ShopIcon className={cx('h-5 w-5 transition-colors', isFindUs ? 'stroke-[2.2]' : 'stroke-[1.7]')} />
              </div>
              <span className="font-body text-[10px] tracking-tight uppercase font-bold">Store</span>
              {isFindUs && <span className="mt-0.5 h-1 w-1 rounded-full bg-amber-500" />}
            </Link>

            {/* 5. BAG / BASKET */}
            <button
              type="button"
              onClick={open}
              className="relative flex flex-col items-center justify-center py-1 text-slate-400 hover:text-slate-600 transition-all active:scale-90"
              aria-label="Open Cart"
            >
              <div className="relative flex items-center justify-center h-6 w-6 mb-0.5">
                <BagDockIcon className="h-5 w-5 stroke-[1.7]" />
                {count > 0 && (
                  <span className="absolute -top-1 -right-1.5 grid h-4 min-w-4 px-1 place-items-center rounded-full bg-amber-500 font-body text-[9px] font-black text-slate-950 shadow-xs">
                    {count}
                  </span>
                )}
              </div>
              <span className="font-body text-[10px] tracking-tight uppercase font-bold">Basket</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20V10.5Z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h12" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  )
}

function BuildIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
    </svg>
  )
}

function ShopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function BagDockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z" />
      <path d="M9 9V5a3 3 0 0 1 6 0v4" />
    </svg>
  )
}
