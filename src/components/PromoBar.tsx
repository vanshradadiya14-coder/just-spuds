import { useState, useEffect } from 'react'
import { SITE } from '../data/site'
import { getStoreSettings, subscribeMenu, type StoreSettings } from '../services/menuStore'
import { useCart } from '../hooks/useCart'

export default function PromoBar() {
  const [dismissed, setDismissed] = useState(false)
  const [settings, setSettings] = useState<StoreSettings>(() => getStoreSettings())
  const { applyPromo, open, isOnlineOrderingEnabled } = useCart()

  useEffect(() => {
    return subscribeMenu(() => {
      setSettings(getStoreSettings())
    })
  }, [])

  // If dismissed or disabled in admin, don't show
  if (dismissed || !settings.announcementBanner.enabled) return null

  // If online ordering is paused, hide the online coupon banner to prevent mixed signals
  if (!isOnlineOrderingEnabled) return null

  const handleClaim = () => {
    applyPromo(SITE.offer.code)
    open()
  }

  const bannerText = settings.announcementBanner.text || 'Free Barista Coffee or Thick Shake with your first spud!'

  return (
    <aside
      aria-label="First visit promotion"
      className="relative z-50 border-b border-amber-500/25 bg-slate-950 px-3 py-1.5 text-white shadow-xs backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 text-center">
        <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden font-body text-[11px]">
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-950 shrink-0">
            <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-slate-900" />
            First Visit
          </span>
          <span className="font-semibold text-amber-200 truncate">
            {bannerText}
          </span>
          <button
            type="button"
            onClick={handleClaim}
            className="shrink-0 rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-[10px] font-black uppercase tracking-wider text-slate-950 transition hover:bg-amber-300"
          >
            Claim
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
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
