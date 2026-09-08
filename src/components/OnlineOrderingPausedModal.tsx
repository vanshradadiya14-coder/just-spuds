import { motion, AnimatePresence } from 'framer-motion'

interface OnlineOrderingPausedModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message?: string
}

export default function OnlineOrderingPausedModal({
  isOpen,
  onClose,
  title = 'Online Ordering Launching Soon!',
  message = 'Online delivery and store pick-up orders are temporarily unavailable while our kitchen prepares for online dispatch. Please visit us in Market Square, Aylesbury!',
}: OnlineOrderingPausedModalProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-amber-400/30 bg-white p-6 sm:p-8 shadow-2xl text-slate-950 z-10"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-950 transition"
            aria-label="Close modal"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>

          {/* Header Icon & Badges */}
          <div className="text-center">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-inner mb-3">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <div className="inline-block rounded-full bg-amber-500/15 border border-amber-500/30 px-3.5 py-1 text-amber-800 font-body text-[10px] font-black uppercase tracking-wider mb-2">
              Kitchen Launch Preparation
            </div>
            <h3 className="display text-2xl sm:text-3xl text-slate-950 leading-tight">
              {title}
            </h3>
            <p className="mt-2 font-body text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              {message}
            </p>
          </div>

          {/* In-Person Store Info Box */}
          <div className="mt-6 rounded-2xl border border-amber-200/60 bg-amber-50/50 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Visit Us In Store Today</span>
            </div>

            <div className="space-y-1 text-xs text-slate-700">
              <p className="font-bold text-slate-950 text-sm">
                Just Spuds Aylesbury
              </p>
              <p>Shop B, Brook House, Market Square, Aylesbury HP20 1SN</p>
              <p className="text-slate-500">Opposite Market Square clock tower</p>
            </div>

            <div className="pt-2 border-t border-amber-200/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>Everyday: 11:00 AM – 10:00 PM</span>
              </div>
              <a
                href="tel:01296423456"
                className="font-bold text-amber-800 hover:text-amber-900 transition flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>01296 423456</span>
              </a>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full bg-amber-400 py-3 px-5 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-sm hover:bg-amber-300 transition active:scale-98 text-center"
            >
              Browse Menu &amp; Customise
            </button>
            <a
              href="https://maps.google.com/?q=Market+Square+Aylesbury+HP20+1SN"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-slate-200 bg-white py-3 px-5 font-body text-xs font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-50 transition text-center"
            >
              Get Directions
            </a>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
