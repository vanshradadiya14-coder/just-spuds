import { useCart } from '../hooks/useCart'
import { cx } from '../utils/format'

export default function StoreStatusBanner() {
  const { storeStatus, kitchenPause, timingMode, setTimingMode, isOnlineOrderingEnabled, orderingPausedMessage, orderingPausedTitle } = useCart()

  if (!isOnlineOrderingEnabled) {
    return (
      <div className="bg-slate-950/95 border-b border-amber-500/25 px-3 py-1.5 text-xs font-body text-white backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-body text-[9px] font-black uppercase tracking-wider text-amber-300 shrink-0">
              {orderingPausedTitle}
            </span>
            <span className="text-[11px] text-slate-200 font-medium truncate sm:hidden">
              Market Square Open 11am – 10pm
            </span>
            <span className="hidden sm:inline text-[12px] text-slate-300">
              {orderingPausedMessage} (Open 11am – 10pm)
            </span>
          </div>
          <a
            href="https://maps.google.com/?q=Market+Square+Aylesbury+HP20+1SN"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-xs shrink-0 hover:bg-amber-300 transition"
          >
            <span>Visit Shop</span>
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </a>
        </div>
      </div>
    )
  }

  if (storeStatus.isOpen && storeStatus.isAcceptingDelivery) {
    return null
  }

  const isPaused = storeStatus.isKitchenPaused || kitchenPause.isPaused

  return (
    <div
      className={cx(
        'px-3 py-1.5 text-xs font-body border-b backdrop-blur-md transition-colors',
        isPaused
          ? 'bg-rose-950/90 text-rose-100 border-rose-500/30'
          : 'bg-slate-950/90 text-slate-100 border-amber-500/20'
      )}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={cx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', isPaused ? 'bg-rose-400' : 'bg-amber-400')} />
            <span className={cx('relative inline-flex rounded-full h-2 w-2', isPaused ? 'bg-rose-500' : 'bg-amber-500')} />
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cx(
                'rounded-full px-2 py-0.5 font-body text-[9px] font-black uppercase tracking-wider shrink-0',
                isPaused ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
              )}
            >
              {isPaused ? 'Kitchen Paused' : 'Store Hours'}
            </span>
            <span className="text-[11px] text-slate-200 truncate font-medium">
              {isPaused ? storeStatus.message : '11:00 AM – 10:00 PM'}
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
            className={cx(
              'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0 transition-all hover:scale-105',
              isPaused
                ? 'bg-rose-400 text-slate-950 hover:bg-rose-300'
                : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
            )}
          >
            Order Ahead
          </button>
        )}
      </div>
    </div>
  )
}
