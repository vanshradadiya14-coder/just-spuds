import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SITE } from '../data/site'
import { getStoreSettings, subscribeMenu, type StoreSettings } from '../services/menuStore'
import { useCart } from '../hooks/useCart'

const pill = 'shrink-0 rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider text-ink transition hover:bg-amber-300 active:scale-95 shadow-sm'

export default function PromoBar() {
  const [dismissed, setDismissed] = useState(false)
  const [settings, setSettings] = useState<StoreSettings>(() => getStoreSettings())
  const { applyPromo, open, isOnlineOrderingEnabled, orderingPausedTitle, storeStatus, setTimingMode } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    return subscribeMenu(() => {
      setSettings(getStoreSettings())
    })
  }, [])

  if (dismissed) return null

  const hours = `${storeStatus.opensTodayAt} – ${storeStatus.closingTime}`
  // Kitchen pauses have their own red banner; don't stack a second "closed" one.
  const isClosed = isOnlineOrderingEnabled && !storeStatus.isOpen && !storeStatus.isKitchenPaused

  const handleClaim = () => {
    applyPromo(SITE.offer.code)
    open()
  }

  const handlePreorder = () => {
    setTimingMode('scheduled')
    // The pick-up/delivery time switcher lives on the menu page.
    const el = document.getElementById('fulfillment-switcher')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    else navigate('/menu')
  }

  return (
    <aside
      aria-label="Announcement"
      className="relative z-50 border-b border-amber-500/20 bg-[#161310] px-3 py-1 text-white shadow-xs backdrop-blur-md short:hidden"
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 text-center">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 font-body text-[11px]">
          {!isOnlineOrderingEnabled ? (
            // Launch mode: online orders are switched off, so never promise pre-orders.
            <>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300 border border-amber-400/30 shrink-0">
                <span>🚀</span>
                <span>{orderingPausedTitle}</span>
              </span>
              <span className="font-medium text-amber-200/90 truncate">
                <span className="sm:hidden">{orderingPausedTitle} · </span>
                Visit us in Market Square · open {hours}
              </span>
              <Link to="/find-us" className={pill}>
                Find Us
              </Link>
            </>
          ) : isClosed ? (
            <>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300 border border-amber-400/30 shrink-0">
                <span>🌙</span>
                <span>Hours: {hours}</span>
              </span>
              <span className="font-medium text-amber-200/90 truncate">
                Closed now · kitchen opens {storeStatus.opensTodayAt} · pre-order for collection or delivery
              </span>
              <button type="button" onClick={handlePreorder} className={pill}>
                Pre-Order
              </button>
            </>
          ) : (
            <>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink shrink-0 shadow-sm">
                <span>✨</span>
                <span>First Visit</span>
              </span>
              <span className="font-semibold text-amber-200 truncate">
                {settings.announcementBanner.text || 'Free Barista Coffee or Thick Shake with your first spud!'}
              </span>
              <button type="button" onClick={handleClaim} className={pill}>
                Claim
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="-my-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss banner"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
