import { useEffect, useRef } from 'react'
import SmartImage from './SmartImage'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * The hero object: one product shot treated as a physical thing standing on a
 * lit stage, rather than as wallpaper behind the copy.
 *
 * Scroll pushes it back and lifts it away; the pointer tilts it a couple of
 * degrees. Both are written straight to `style.transform` inside a single rAF
 * loop -- routing this through React state would re-render the whole hero on
 * every frame.
 *
 * The JS transform sits on the outer element and the idle float is a CSS
 * animation on the inner one, so the two never fight over the same property.
 */
export default function ProductStage({
  src,
  alt,
  className = '',
  tone = 'dark',
}: {
  src: string
  alt: string
  className?: string
  /** Which surface the object stands on -- decides the light pool and shadow. */
  tone?: 'dark' | 'light'
  parallax?: boolean
}) {
  const obj = useRef<HTMLDivElement>(null)
  const halo = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const el = obj.current
    if (!el) return

    const onMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      const x = ((e.clientX / w) * 2 - 1) * 12
      const y = ((e.clientY / h) * 2 - 1) * 8
      const rot = ((e.clientX / w) * 2 - 1) * 2
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
    }
  }, [reduced])

  return (
    <div className={`relative ${className}`}>
      {/* Light pool the object appears to stand in. */}
      <div
        ref={halo}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[112%] w-[112%] -translate-x-1/2 -translate-y-1/2 will-change-transform"
        style={{
          background:
            tone === 'dark'
              ? 'radial-gradient(circle at 50% 46%, rgba(255,255,255,.20), rgba(255,255,255,.06) 38%, transparent 68%)'
              : 'radial-gradient(circle at 50% 46%, rgba(255,255,255,.9), rgba(10,10,11,.05) 52%, transparent 72%)',
          filter: 'blur(18px)',
        }}
      />

      <div ref={obj} className="relative will-change-transform">
        <div className={reduced ? '' : 'float-idle'}>
          <SmartImage
            src={src}
            alt={alt}
            className="aspect-square w-full"
            imgClassName={
              tone === 'dark'
                ? 'drop-shadow-[0_50px_70px_rgba(0,0,0,.65)]'
                : 'drop-shadow-[0_36px_54px_rgba(10,10,11,.28)]'
            }
            eager
          />
        </div>
      </div>

      {/* Contact shadow, so the bowl reads as resting on something. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[3%] left-1/2 h-[7%] w-[56%] -translate-x-1/2 rounded-[50%]"
        style={{
          background:
            tone === 'dark'
              ? 'radial-gradient(ellipse, rgba(0,0,0,.6), transparent 72%)'
              : 'radial-gradient(ellipse, rgba(10,10,11,.22), transparent 72%)',
        }}
      />
    </div>
  )
}
