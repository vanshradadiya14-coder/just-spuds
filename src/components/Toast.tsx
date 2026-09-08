import { AnimatePresence, motion } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import SmartImage from './SmartImage'

export default function Toast() {
  const { toasts, dismissToast } = useCart()

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 right-5 z-[150] flex flex-col gap-2.5 sm:bottom-6 sm:right-6"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 100 }}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 300) {
                dismissToast(t.id)
              }
            }}
            className="pointer-events-auto flex items-center gap-3.5 rounded-2xl border border-white/20 bg-ink/95 px-4 py-3 text-white shadow-2xl backdrop-blur-xl transition-colors hover:border-white/30"
          >
            {t.image ? (
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/10">
                <SmartImage src={t.image} alt="" className="h-full w-full" cover />
              </div>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-400">
                ✨
              </span>
            )}
            <div className="min-w-0 pr-2">
              <p className="font-body text-[12px] font-bold tracking-wide text-white">{t.title}</p>
              {t.subtitle && (
                <p className="truncate font-body text-[11px] text-white/70">{t.subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                dismissToast(t.id)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="group ml-auto flex h-8 w-8 min-h-[32px] min-w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white active:scale-90"
              aria-label="Dismiss notification"
            >
              <svg viewBox="0 0 16 16" className="pointer-events-none h-3.5 w-3.5 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor">
                <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
