import { cx } from '../utils/format'

/**
 * Reloads the screen — picks up a new version, a stuck display or a menu change
 * straight away. The till keeps its open ticket and held tickets across a
 * reload; only a payment in progress would be lost, so that asks first.
 */
export function refreshScreen() {
  const paying = document.querySelector('[data-update-blocker="payment"], [aria-label="Card payment"], [aria-label="Other payment"]')
  if (paying && !window.confirm('A payment is in progress. Refresh anyway? Anything not yet paid stays on the ticket.')) return
  window.location.reload()
}

export default function RefreshButton({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={refreshScreen}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-2.5 py-1.5 font-body text-xs font-bold text-white transition hover:bg-white/15 active:scale-95',
        className,
      )}
      title="Refresh the screen (F5)"
      aria-label="Refresh"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </svg>
      {showLabel && <span className="hidden lg:inline">Refresh</span>}
    </button>
  )
}
