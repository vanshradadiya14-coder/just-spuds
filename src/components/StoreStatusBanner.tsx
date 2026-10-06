import { useCart } from '../hooks/useCart'
import { cx } from '../utils/format'

export default function StoreStatusBanner() {
  const { storeStatus, kitchenPause, timingMode, setTimingMode } = useCart()

  const isPaused = storeStatus.isKitchenPaused || kitchenPause.isPaused

  // Only show dedicated banner for emergency kitchen pauses to prevent stacking with PromoBar
  if (!isPaused) {
    return null
  }

  return (
    <div
      className={cx(
        'px-3 py-1.5 text-xs font-body border-b backdrop-blur-md transition-colors bg-rose-950/90 text-rose-100 border-rose-500/30'
      )}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-rose-400" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-full px-2 py-0.5 font-body text-[9px] font-black uppercase tracking-wider shrink-0 bg-rose-500 text-white">
              Kitchen Paused
            </span>
            <span className="text-[11px] text-rose-200 truncate font-medium">
              {storeStatus.message || 'Brief kitchen pause to catch up with orders'}
            </span>
          </div>
        </div>

        {timingMode !== 'scheduled' && (
          <button
            type="button"
            onClick={() => {
              setTimingMode('scheduled')
              const switcher = document.getElementById('fulfillment-switcher')
              if (switcher) {
                switcher.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0 transition-all hover:scale-105 bg-rose-400 text-slate-950 hover:bg-rose-300"
          >
            Order Ahead
          </button>
        )}
      </div>
    </div>
  )
}
