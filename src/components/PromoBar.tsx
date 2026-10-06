import { useState, useEffect } from 'react'
import { SITE } from '../data/site'
import { getStoreSettings, subscribeMenu, type StoreSettings } from '../services/menuStore'
import { useCart } from '../hooks/useCart'

export default function PromoBar() {
  const [dismissed, setDismissed] = useState(false)
  const [settings, setSettings] = useState<StoreSettings>(() => getStoreSettings())
  const { applyPromo, open, isOnlineOrderingEnabled, storeStatus, setTimingMode } = useCart()

  useEffect(() => {
    return subscribeMenu(() => {
      setSettings(getStoreSettings())
    })
  }, [])

  if (dismissed) return null

  const isClosed = !isOnlineOrderingEnabled || !storeStatus.isOpen

  const handleClaim = () => {
    applyPromo(SITE.offer.code)
    open()
  }

  const handlePreorder = () => {
    setTimingMode('scheduled')
    const el = document.getElementById('fulfillment-switcher')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <aside
      aria-label="Announcement"
      className="relative z-50 border-b border-amber-500/20 bg-[#161310] px-3 py-1.5 text-white shadow-xs backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 text-center">
        <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden font-body text-[11px]">
          {isClosed ? (
            <>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300 border border-amber-400/30 shrink-0">
                <span>🌙</span>
                <span>Hours: 11am – 10pm</span>
              </span>
              <span className="font-medium text-amber-200/90 truncate">
                Kitchen opens at {storeStatus.opensTodayAt || '11:00 AM'} &bull; Pre-orders welcome for collection &amp; delivery
              </span>
              <button
                type="button"
                onClick={handlePreorder}
                className="shrink-0 rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider text-ink transition hover:bg-amber-300 active:scale-95 shadow-sm"
              >
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
              <button
                type="button"
                onClick={handleClaim}
                className="shrink-0 rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider text-ink transition hover:bg-amber-300 active:scale-95 shadow-sm"
              >
                Claim
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss banner"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor">
            <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
