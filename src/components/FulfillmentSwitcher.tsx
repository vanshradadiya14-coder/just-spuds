import { useCart } from '../hooks/useCart'
import { cx } from '../utils/format'

import { SCHEDULE_TIMES, getScheduleDates } from '../utils/scheduling'

interface FulfillmentSwitcherProps {
  variant?: 'compact' | 'expanded' | 'card'
  className?: string
  showTiming?: boolean
}

export default function FulfillmentSwitcher({
  variant = 'expanded',
  className = '',
  showTiming = true,
}: FulfillmentSwitcherProps) {
  const {
    fulfilment,
    setFulfilment,
    freeDeliveryThreshold,
    timingMode,
    setTimingMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    formattedScheduledTime,
    storeStatus,
    kitchenPause,
  } = useCart()

  if (variant === 'compact') {
    return (
      <div className={cx('inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white/90 p-1 shadow-sm backdrop-blur-md', className)}>
        <button
          type="button"
          onClick={() => setFulfilment('pickup')}
          className={cx(
            'flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-[11px] font-bold transition-all',
            fulfilment === 'pickup'
              ? 'bg-amber-400 text-slate-950 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-950'
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z" />
            <path d="M9 9V5a3 3 0 0 1 6 0v4" />
          </svg>
          <span>Pick Up</span>
        </button>

        <button
          type="button"
          onClick={() => setFulfilment('delivery')}
          className={cx(
            'flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-[11px] font-bold transition-all',
            fulfilment === 'delivery'
              ? 'bg-amber-400 text-slate-950 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-950'
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5.5" cy="17.5" r="2.5" />
            <circle cx="18.5" cy="17.5" r="2.5" />
            <path d="M15 6h-5a2 2 0 0 0-2 2v7h10V9a3 3 0 0 0-3-3Z" />
            <path d="M8 12h8" />
          </svg>
          <span>Delivery</span>
        </button>
      </div>
    )
  }

  return (
    <div className={cx('w-full max-w-3xl mx-auto space-y-2.5', className)}>
      {/* Primary Switcher Box */}
      <div className="rounded-2xl border border-amber-400/30 bg-ink/95 p-2 shadow-xl backdrop-blur-md">
        <div className="grid grid-cols-2 gap-2">
          {/* Option 1: Pick Up */}
          <button
            type="button"
            onClick={() => setFulfilment('pickup')}
            className={cx(
              'flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl py-2.5 px-3 sm:py-3 sm:px-4 text-center transition-all duration-300',
              fulfilment === 'pickup'
                ? 'bg-amber-400 text-slate-950 font-black shadow-glow scale-[1.01]'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z" />
              <path d="M9 9V5a3 3 0 0 1 6 0v4" />
            </svg>
            <div className="text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <span className="font-body text-[11px] sm:text-[13px] font-bold uppercase tracking-wider">
                  Store Pick Up
                </span>
                {fulfilment === 'pickup' && (
                  <span className="rounded-full bg-slate-950 px-1.5 py-0.2 text-[8px] font-bold uppercase text-amber-400">
                    Active
                  </span>
                )}
              </div>
              <p className={cx('text-[10px] leading-tight mt-0.5', fulfilment === 'pickup' ? 'text-slate-900 font-semibold' : 'text-white/50')}>
                Ready in ~15 mins &bull; Market Square
              </p>
            </div>
          </button>

          {/* Option 2: Home Delivery */}
          <button
            type="button"
            onClick={() => setFulfilment('delivery')}
            className={cx(
              'flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 rounded-xl py-2.5 px-3 sm:py-3 sm:px-4 text-center transition-all duration-300',
              fulfilment === 'delivery'
                ? 'bg-amber-400 text-slate-950 font-black shadow-glow scale-[1.01]'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5.5" cy="17.5" r="2.5" />
              <circle cx="18.5" cy="17.5" r="2.5" />
              <path d="M15 6h-5a2 2 0 0 0-2 2v7h10V9a3 3 0 0 0-3-3Z" />
              <path d="M8 12h8" />
              <path d="M3 17.5h.5" />
              <path d="M8 17.5h8" />
              <path d="M21 17.5h1" />
            </svg>
            <div className="text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <span className="font-body text-[11px] sm:text-[13px] font-bold uppercase tracking-wider">
                  Home Delivery
                </span>
                {fulfilment === 'delivery' && (
                  <span className="rounded-full bg-slate-950 px-1.5 py-0.2 text-[8px] font-bold uppercase text-amber-400">
                    Active
                  </span>
                )}
              </div>
              <p className={cx('text-[10px] leading-tight mt-0.5', fulfilment === 'delivery' ? 'text-slate-900 font-semibold' : 'text-white/50')}>
                25-35 mins &bull; Free over £{(freeDeliveryThreshold / 100).toFixed(0)}
              </p>
            </div>
          </button>
        </div>

        {/* Timing Sub-Bar: Order Now (ASAP) vs Schedule for Later */}
        {showTiming && (
          <div className="mt-2 pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 px-1 text-xs">
            <div className="inline-flex rounded-xl bg-white/10 p-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  if (storeStatus.isKitchenPaused || kitchenPause.isPaused) return
                  setTimingMode('asap')
                }}
                className={cx(
                  'flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg font-body text-[11px] font-bold transition-all',
                  timingMode === 'asap' && !storeStatus.isKitchenPaused && !kitchenPause.isPaused
                    ? 'bg-amber-400 text-ink font-black shadow-sm'
                    : (storeStatus.isKitchenPaused || kitchenPause.isPaused)
                    ? 'text-white/40 cursor-not-allowed'
                    : 'text-white/70 hover:text-white'
                )}
              >
                ⚡ Order Now (ASAP)
              </button>
              <button
                type="button"
                onClick={() => setTimingMode('scheduled')}
                className={cx(
                  'flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg font-body text-[11px] font-bold transition-all flex items-center justify-center gap-1.5',
                  timingMode === 'scheduled' || storeStatus.isKitchenPaused || kitchenPause.isPaused
                    ? 'bg-amber-400 text-ink font-black shadow-sm'
                    : 'text-white/70 hover:text-white'
                )}
              >
                <span>📅 Schedule Order</span>
              </button>
            </div>

            <div className="font-body text-[11px] font-semibold text-amber-300 flex items-center gap-1">
              <span>🕒 Target:</span>
              <strong className="text-white bg-white/10 px-2 py-0.5 rounded-md">{formattedScheduledTime}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Expanded Scheduling Picker Tray */}
      {showTiming && (timingMode === 'scheduled' || storeStatus.isKitchenPaused || kitchenPause.isPaused) && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3.5 backdrop-blur-md space-y-3 animate-fadeIn">
          {(storeStatus.isKitchenPaused || kitchenPause.isPaused) && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-950/60 p-2.5 text-xs text-rose-200">
              <span className="font-bold text-rose-300">⏸️ Kitchen Live Orders Paused: </span>
              <span>{storeStatus.pauseReason || 'Staff are catching up with orders.'} Pre-orders for later slots are open!</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs font-bold text-ink">
            <span className="flex items-center gap-1.5 font-body uppercase tracking-wider text-[11px] text-amber-950">
              <span>📅</span> Pick Date &amp; Delivery/Pick Up Time Slot
            </span>
            <span className="text-[10px] text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full font-bold">
              Advance Pre-Order
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Date Selector */}
            <div>
              <label className="block font-body text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Select Day
              </label>
              <select
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs font-bold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
              >
                {getScheduleDates().map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Selector */}
            <div>
              <label className="block font-body text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Select Time Slot (11am – 9:30pm)
              </label>
              <select
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-xs font-bold text-ink focus:border-amber-500 focus:outline-none shadow-xs"
              >
                {SCHEDULE_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
