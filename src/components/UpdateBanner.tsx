import { useEffect, useState } from 'react'

/**
 * AUTOMATIC SOFTWARE UPDATE for the all-day staff screens (till, kitchen, admin).
 *
 * Every few minutes (and when the screen comes back to the front) it asks the
 * server which build is live. When a newer one is out it installs it by itself
 * — reloads the page — as soon as the screen is free:
 *   - nobody has touched it for IDLE_MS, and
 *   - nothing is in progress: no pop-up open (item options, card payment,
 *     cash count, refund…), not on the payment or "sale complete / change due"
 *     screens (marked data-update-blocker), not typing in a box.
 * The open ticket and held tickets live in storage, so they come back after
 * the reload. Until it can update, a bar says so, with "Update now".
 */
const CHECK_EVERY_MS = 3 * 60 * 1000
const IDLE_MS = 45 * 1000
const AUTO_KEY = 'just_spuds_auto_update_v1'
const DONE_KEY = 'just_spuds_auto_updated_v1'

const bundleOf = (text: string) => text.match(/\/assets\/(index-[\w-]+\.js)/)?.[1]

function runningBundle(): string | undefined {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return s ? bundleOf(s.src) : undefined
}

/** Something on screen must not be interrupted. */
function isBusy(): boolean {
  if (document.querySelector('[aria-modal="true"], [data-update-blocker]')) return true
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && String(el.value || '').trim() !== '') return true
  return false
}

const readSession = (k: string) => {
  try {
    return sessionStorage.getItem(k)
  } catch {
    return null
  }
}
const writeSession = (k: string, v: string | null) => {
  try {
    if (v === null) sessionStorage.removeItem(k)
    else sessionStorage.setItem(k, v)
  } catch {
    // private mode
  }
}

export default function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [justUpdated, setJustUpdated] = useState(false)

  // "✓ Updated" for a few seconds after an automatic update.
  useEffect(() => {
    if (readSession(DONE_KEY)) {
      writeSession(DONE_KEY, null)
      setJustUpdated(true)
      const t = window.setTimeout(() => setJustUpdated(false), 6000)
      return () => window.clearTimeout(t)
    }
  }, [])

  // Look for a newer build.
  useEffect(() => {
    const running = runningBundle()
    if (!running) return // dev server: nothing to compare
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      try {
        const res = await fetch(`/?__v=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const next = bundleOf(await res.text())
        if (next && next !== running) setLatest(next)
      } catch {
        // offline: try again next time
      }
    }
    const timer = window.setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    void check()
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // Install it when the screen is free.
  useEffect(() => {
    if (!latest) return
    // Never loop: one automatic attempt per new build in this tab.
    if (readSession(AUTO_KEY) === latest) return
    let lastActivity = Date.now()
    const touch = () => {
      lastActivity = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity < IDLE_MS || isBusy()) return
      writeSession(AUTO_KEY, latest)
      writeSession(DONE_KEY, '1')
      window.location.reload()
    }, 5000)
    return () => {
      window.clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, touch))
    }
  }, [latest])

  if (justUpdated) {
    return (
      <div role="status" className="pointer-events-none fixed left-1/2 top-2 z-[200] -translate-x-1/2 rounded-full border border-emerald-300/60 bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xl">
        ✓ Updated to the latest version
      </div>
    )
  }
  if (!latest) return null
  return (
    <div role="status" className="fixed left-1/2 top-2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-300/60 bg-emerald-600 px-4 py-2 text-white shadow-2xl">
      <span className="text-xs font-bold">New version ready — installs itself when the screen is free</span>
      <button
        type="button"
        onClick={() => {
          writeSession(DONE_KEY, '1')
          window.location.reload()
        }}
        className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50"
      >
        Update now
      </button>
    </div>
  )
}
