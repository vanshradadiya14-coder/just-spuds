import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    // Check if already running as standalone app
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    setIsStandalone(isStandaloneMode)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (isStandalone) {
    return null // Already running inside installed desktop app
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } else {
      setShowModal(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={className || "inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition shadow-sm"}
        title="Install as dedicated Desktop Software / Till App"
      >
        <span aria-hidden>📲</span>
        <span>Install App</span>
      </button>

      {/* Instructions Modal if browser doesn't support auto-prompt */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-amber-400/40 bg-slate-900 p-6 text-white shadow-2xl font-body">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white"
            >
              ✕
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl text-ink font-black">
                🥔
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Install Just Spuds Till</h3>
                <p className="text-xs text-amber-400 font-semibold">Standalone Software Mode</p>
              </div>
            </div>

            <p className="mb-4 text-xs text-slate-300 leading-relaxed">
              To install this till as a standalone software program without any browser tabs or search bar:
            </p>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="font-bold text-amber-400 text-sm">1.</span>
                <div>
                  <p className="font-bold text-white">Chrome Address Bar Icon</p>
                  <p className="text-slate-400">
                    Look at the far right of your address bar (next to the star ⭐). Click the <span className="font-mono bg-white/10 px-1 py-0.5 rounded text-amber-300">💻 (Install)</span> monitor icon.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-white/10 pt-2.5">
                <span className="font-bold text-amber-400 text-sm">2.</span>
                <div>
                  <p className="font-bold text-white">Chrome Menu (⋮)</p>
                  <p className="text-slate-400">
                    Click the 3 vertical dots in the top-right corner of Chrome → <span className="text-white font-semibold">Save and share</span> → <span className="text-amber-300 font-semibold">Install Just Spuds...</span>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-white/10 pt-2.5">
                <span className="font-bold text-amber-400 text-sm">3.</span>
                <div>
                  <p className="font-bold text-white">Windows Desktop Shortcut</p>
                  <p className="text-slate-400">
                    You can also double-click the <span className="text-amber-300 font-semibold">Just Spuds POS Till</span> shortcut directly on your Windows Desktop!
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="mt-5 w-full rounded-2xl bg-amber-400 py-2.5 text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300 transition"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  )
}
