import { useFullscreen } from '../hooks/useFullscreen'
import { cx } from '../utils/format'

/** Full screen on / off for the till, kitchen and admin headers. Hidden where the browser cannot do it (iPhone). */
export default function FullscreenButton({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { supported, isFullscreen, toggle } = useFullscreen()
  if (!supported) return null
  const label = isFullscreen ? 'Exit full screen' : 'Full screen'
  return (
    <button
      type="button"
      onClick={toggle}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-body text-xs font-bold transition',
        isFullscreen ? 'border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25' : 'border-white/20 bg-white/5 text-white hover:bg-white/15',
        className,
      )}
      title={`${label} (F11)`}
      aria-label={label}
      aria-pressed={isFullscreen}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {isFullscreen ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
      {showLabel && <span className="hidden lg:inline">{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>}
    </button>
  )
}
