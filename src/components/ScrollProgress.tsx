import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** Hairline under the header showing how far down the page you are. */
export default function ScrollProgress() {
  const barRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    let frame = 0
    const el = barRef.current
    if (!el) return

    const measure = () => {
      frame = 0
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      const p = max > 0 ? Math.min(1, Math.max(0, h.scrollTop / max)) : 0
      el.style.transform = `scaleX(${p})`
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [pathname])

  return (
    <div className="progress-rail top-[60px] text-white/45">
      <i ref={barRef} className="will-change-transform" style={{ transform: 'scaleX(0)' }} />
    </div>
  )
}

