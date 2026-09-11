import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { useIsScrolled } from '../hooks/useScrollProgress'
import { cx, gbp } from '../utils/format'
import { getCurrentUser, subscribeAuth, hasRole, homePortalForRole, INTERNAL_ROLES, type AuthUser } from '../services/authStore'
import CustomerAuthModal from './CustomerAuthModal'
import ActiveOrderBanner from './ActiveOrderBanner'
import PromoBar from './PromoBar'
import StoreStatusBanner from './StoreStatusBanner'
import CommandPalette from './CommandPalette'

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/menu', label: 'Order Online' },
  { to: '/story', label: 'Our Story' },
  { to: '/find-us', label: 'Find Us' },
]

const PORTAL_LINKS: Record<string, { icon: string; label: string }> = {
  '/admin': { icon: '📊', label: 'Admin' },
  '/staff': { icon: '👨‍🍳', label: 'Kitchen' },
  '/pos': { icon: '🧾', label: 'Till' },
  '/driver': { icon: '🛵', label: 'Driver' },
}

function portalLinkFor(role?: AuthUser['role']) {
  const path = homePortalForRole(role)
  return path && PORTAL_LINKS[path] ? { path, ...PORTAL_LINKS[path] } : null
}

export default function Navbar() {
  const isScrolled = useIsScrolled(40)
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const solid = isScrolled || !isHome
  const { count, subtotal, open, fulfilment, setFulfilment } = useCart()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getCurrentUser())
  const portal = portalLinkFor(currentUser?.role)

  useEffect(() => { setMenuOpen(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    const unsubAuth = subscribeAuth((user) => {
      setCurrentUser(user)
    })
    return () => {
      unsubAuth()
    }
  }, [])

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>

      <header className={cx('on-dark fixed inset-x-0 top-0 z-50 transition-all duration-300', solid ? 'bg-slate-950/95 shadow-xl backdrop-blur-xl' : 'bg-slate-950/85 backdrop-blur-md')}>
        <PromoBar />
        <StoreStatusBanner />
        <nav className={cx('mx-auto flex max-w-[1400px] items-center justify-between px-4 transition-all duration-300 sm:px-8', solid ? 'h-[56px]' : 'h-[64px]')} aria-label="Primary">
          <div className="flex items-center gap-6">
            <Link to="/" className="display text-white group flex items-center gap-2.5" aria-label="Just Spuds Aylesbury, home">
              <img
                src="/assets/brand/logo.png"
                alt="Just Spuds Logo"
                className={cx('rounded-full object-cover transition-all duration-300 ring-1 ring-amber-400/40 group-hover:scale-105 shadow-md shadow-amber-950/30', solid ? 'h-9 w-9' : 'h-10 w-10')}
              />
              <span className={cx('transition-all duration-300 font-bold tracking-tight', solid ? 'text-[20px] sm:text-[22px]' : 'text-[22px] sm:text-[25px]')}>
                Just <span className="italic text-amber-400 group-hover:text-amber-300 transition-colors">Spuds</span>
              </span>
            </Link>
          </div>

          <ul className="hidden items-center gap-8 lg:flex">
            {LINKS.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) =>
                    cx('ul-draw font-body text-[11px] font-bold uppercase tracking-[0.18em] transition-colors',
                       isActive ? 'text-amber-400' : 'text-white/70 hover:text-white')
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Instant Search Button (Ctrl+K) */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-1.5 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white transition active:scale-95"
              title="Search menu & shortcuts (Ctrl + K)"
              aria-label="Search menu"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <kbd className="hidden lg:inline rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/60">
                ⌘K
              </kbd>
            </button>

            {/* Quick Fulfillment Toggle in Nav (Desktop) */}
            <div className="hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setFulfilment('pickup')}
                className={cx(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-[10px] font-bold transition-all',
                  fulfilment === 'pickup'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-white/60 hover:text-white'
                )}
                title="Store Pick Up (Market Square)"
              >
                <span>Pick Up</span>
              </button>

              <button
                type="button"
                onClick={() => setFulfilment('delivery')}
                className={cx(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-[10px] font-bold transition-all',
                  fulfilment === 'delivery'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-white/60 hover:text-white'
                )}
                title="Home Delivery (Aylesbury)"
              >
                <span>Delivery</span>
              </button>
            </div>

            {/* Customer Sign In / Account Button */}
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 rounded-full p-1.5 sm:px-3 sm:py-1.5 font-body text-xs font-bold text-white/90 hover:bg-white/10 hover:text-white transition-all active:scale-95 border border-white/15"
              title="Customer Sign In & Rewards Account"
              aria-label="Customer Account"
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name}
                  className="h-5 w-5 rounded-full object-cover border border-amber-400"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
              <span className="hidden sm:inline">
                {currentUser ? (currentUser.name.split(' ')[0] || 'Account') : 'Sign In'}
              </span>
            </button>

            {/* Staff / Admin Fast Switch Button */}
            {hasRole(currentUser, INTERNAL_ROLES) && portal && (
              <Link
                to={portal.path}
                className="hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-[11px] font-bold text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition"
                title="Return to Internal Portal"
              >
                <span>{portal.icon}</span>
                <span>{portal.label}</span>
              </Link>
            )}

            {/* Bag Button */}
            <button
              type="button"
              onClick={open}
              className={cx(
                'relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-white transition-all duration-300',
                count > 0
                  ? 'border-amber-400 bg-amber-500/15 text-amber-300 shadow-glow'
                  : 'border-white/20 hover:border-white hover:bg-white/10'
              )}
              aria-label="Open Cart Drawer"
            >
              <BagIcon className="h-4 w-4" />
              <span className="font-body text-[11px] font-bold tabular-nums">
                {count > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-amber-400 text-[9px] font-black text-slate-950">
                      {count}
                    </span>
                    <span className="hidden sm:inline">{gbp(subtotal)}</span>
                  </span>
                ) : (
                  <span className="hidden sm:inline">Bag</span>
                )}
              </span>
            </button>

            {/* Hamburger Button */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center text-white lg:hidden active:scale-95"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span className="relative block h-3 w-4">
                <span className={cx('absolute left-0 h-[1.5px] w-full bg-current transition-all duration-300', menuOpen ? 'top-[5px] rotate-45' : 'top-0')} />
                <span className={cx('absolute left-0 top-[5px] h-[1.5px] w-full bg-current transition-all duration-300', menuOpen && 'opacity-0')} />
                <span className={cx('absolute left-0 h-[1.5px] w-full bg-current transition-all duration-300', menuOpen ? 'top-[5px] -rotate-45' : 'top-[10px]')} />
              </span>
            </button>
          </div>
        </nav>
        <ActiveOrderBanner />
      </header>

      {/* Mobile Drawer Menu */}
      <div className={cx('on-dark fixed inset-0 z-40 bg-slate-950/98 backdrop-blur-2xl transition-all duration-500 ease-cine lg:hidden', menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')}>
        <ul className="flex h-full flex-col items-center justify-center gap-7">
          {LINKS.map((l, i) => (
            <li
              key={l.to}
              style={{ transitionDelay: menuOpen ? `${110 + i * 60}ms` : '0ms' }}
              className={cx('transition-all duration-500 ease-cine', menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0')}
            >
              <Link to={l.to} className="display text-3xl text-white hover:text-amber-400 transition-colors">{l.label}</Link>
            </li>
          ))}
          <li className="pt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setIsAuthModalOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-2.5 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow active:scale-95 transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{currentUser ? currentUser.name : 'Sign In to Account'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setIsSearchOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-2.5 font-body text-xs font-bold uppercase tracking-wider text-white active:scale-95 transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span>Search Menu</span>
            </button>
          </li>
        </ul>
      </div>

      {/* Customer Account & Loyalty Modal */}
      <CustomerAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isSearchOpen}
        onOpen={() => setIsSearchOpen(true)}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  )
}

export function BagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M4 6h12l-1 11.5a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 5 17.5L4 6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.2 8V5.4a2.8 2.8 0 0 1 5.6 0V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
