import { useEffect, useState } from 'react'

/**
 * Staff screens (till, kitchen, admin) stay open all day, so a new version of
 * the site never reached them until someone thought to refresh — a new menu
 * item or fix "didn't show up". This checks every few minutes (and when the
 * screen is brought back) whether a newer build is live and offers a one-tap
 * reload. The till keeps its open ticket and held tickets across a reload.
 */
const CHECK_EVERY_MS = 3 * 60 * 1000

const bundleOf = (text: string) => text.match(/\/assets\/(index-[\w-]+\.js)/)?.[1]

function runningBundle(): string | undefined {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return s ? bundleOf(s.src) : undefined
}

export default function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const running = runningBundle()
    if (!running) return // dev server: nothing to compare
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      try {
        const res = await fetch(`/?__v=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = bundleOf(await res.text())
        if (latest && latest !== running) setReady(true)
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

  if (!ready) return null
  return (
    <div role="status" className="fixed left-1/2 top-2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-300/60 bg-emerald-600 px-4 py-2 text-white shadow-2xl">
      <span className="text-xs font-bold">New version of the till is ready</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50"
      >
        Update now
      </button>
    </div>
  )
}
