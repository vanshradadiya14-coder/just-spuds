import { useEffect, useRef, useState } from 'react'
import { useModalOpen } from '../hooks/useModalOpen'

const CONSENT_KEY = 'just_spuds_analytics_consent_v1'
type Consent = 'granted' | 'denied'

function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

/** Footer "Cookie settings": forget the choice and ask again. */
export function resetCookieChoice() {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    // ignore
  }
  window.location.reload()
}

function startAnalytics() {
  void import('../services/firebase').then((m) => m.startAnalytics()).catch(() => {})
}

/**
 * Analytics cookies are optional, so UK PECR needs the visitor's OK before
 * Google Analytics runs. Essential storage (basket, orders) needs no consent.
 * Browsers sending Global Privacy Control are treated as "no thanks".
 */
export default function CookieConsent() {
  const [consent, setConsent] = useState<Consent | null>(() => {
    const saved = readConsent()
    if (saved) return saved
    const gpc = typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    return gpc ? 'denied' : null
  })
  const modalOpen = useModalOpen()

  useEffect(() => {
    if (consent === 'granted') startAnalytics()
  }, [consent])

  const choose = (value: Consent) => {
    try {
      localStorage.setItem(CONSENT_KEY, value)
    } catch {
      // private mode: the choice lasts for this visit only
    }
    setConsent(value)
  }

  if (consent || modalOpen) return null
  return <ConsentBar onChoose={choose} />
}

function ConsentBar({ onChoose }: { onChoose: (value: Consent) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // Floating cards stacked at the bottom (order status) sit above this bar.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--consent-h', `${Math.round(el.getBoundingClientRect().height) + 8}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--consent-h')
    }
  }, [])

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Cookie choice"
      className="fixed inset-x-3 bottom-[calc(max(var(--dock-h,0px),var(--orderbar-h,0px))+10px)] z-50 rounded-2xl border border-amber-400/40 bg-[#161310]/95 p-3 text-white shadow-2xl backdrop-blur-xl animate-rise sm:inset-x-auto sm:left-6 sm:max-w-md"
    >
      <p className="font-body text-[12px] leading-snug text-white/85">
        🍪 Can we use analytics cookies to see which pages help customers order? No ads, and we never sell your data.
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onChoose('denied')}
          className="rounded-full border border-white/20 px-4 py-2 font-body text-[11px] font-bold text-white/80 hover:bg-white/10"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => onChoose('granted')}
          className="rounded-full bg-amber-400 px-4 py-2 font-body text-[11px] font-black uppercase tracking-wider text-ink hover:bg-amber-300"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
