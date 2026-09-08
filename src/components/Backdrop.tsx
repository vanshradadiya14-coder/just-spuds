import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useIsCoarse } from '../hooks/useMediaQuery'
import { useBackdropGL } from '../gl/useBackdropGL'
import Canvas3D from './Canvas3D'

/**
 * Section atmosphere, in four layers:
 *
 *  1. interactive 3D spatial particle & ember constellation engine (Canvas3D);
 *  2. a breathing ambient mesh — five blurred luminance pools on mismatched cycles;
 *  3. a cursor spotlight for warm tactile illumination;
 *  4. a hairline measure grid for structural proportion.
 */
export default function Backdrop({
  tone = 'dark', grid = true, spotlight = true, gl = false, intensity = 1, particles3D = false,
}: {
  tone?: 'dark' | 'light'
  grid?: boolean
  spotlight?: boolean
  /** Render the raymarched light field. */
  gl?: boolean
  intensity?: number
  particles3D?: boolean
}) {
  const reduced = useReducedMotion()
  const coarse = useIsCoarse()
  const host = useRef<HTMLDivElement>(null)

  const glEnabled = gl && !reduced && !coarse
  const { canvasRef, supported } = useBackdropGL({
    dark: tone === 'dark',
    intensity,
    enabled: glEnabled,
  })
  const showGL = glEnabled && supported

  useEffect(() => {
    if (!spotlight || reduced || coarse) return
    const el = host.current
    if (!el) return
    const section = el.parentElement
    if (!section) return

    let frame = 0
    let x = 50, y = 50
    let tx = 50, ty = 50
    let secRect = { left: 0, top: 0, width: 1, height: 1 }

    const updateSecRect = () => {
      const r = section.getBoundingClientRect()
      secRect = { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) }
    }

    const onMove = (e: MouseEvent) => {
      tx = ((e.clientX - secRect.left) / secRect.width) * 100
      ty = ((e.clientY - secRect.top) / secRect.height) * 100
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const tick = () => {
      frame = 0
      x += (tx - x) * 0.09
      y += (ty - y) * 0.09
      el.style.setProperty('--mx', `${x}%`)
      el.style.setProperty('--my', `${y}%`)
      if (Math.abs(tx - x) > 0.2 || Math.abs(ty - y) > 0.2) frame = requestAnimationFrame(tick)
    }

    updateSecRect()
    section.addEventListener('mouseenter', updateSecRect, { passive: true })
    section.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('resize', updateSecRect, { passive: true })
    return () => {
      section.removeEventListener('mouseenter', updateSecRect)
      section.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', updateSecRect)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [spotlight, reduced, coarse])

  const dark = tone === 'dark'

  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {showGL && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ filter: 'blur(0.4px)' }}
        />
      )}

      {/* 3D Interactive Spatial Particle Engine (Paused automatically when offscreen) */}
      {particles3D && !reduced && (
        <Canvas3D tone={tone} intensity={intensity} />
      )}

      {/* Hardware accelerated CSS mesh: soft ambient lighting */}
      {!reduced && (
        <div className={`mesh ${dark ? 'mesh-dark' : 'mesh-light'}`} />
      )}

      {spotlight && !coarse && !reduced && (
        <div className={`spotlight ${dark ? 'spotlight-dark' : 'spotlight-light'}`} />
      )}

      {grid && <div className={`measure-grid ${dark ? 'text-white' : 'text-ink'}`} />}
    </div>
  )
}

/**
 * A very large word behind a section. Drifts slightly against the scroll so it
 * sits on a different plane to the content.
 */
export function GhostType({
  children, className, tone = 'dark',
}: { children: string; className?: string; tone?: 'dark' | 'light'; parallax?: boolean }) {
  return (
    <span
      aria-hidden
      className={`ghost-type select-none pointer-events-none transform-gpu ${tone === 'dark' ? 'text-white/[0.045]' : 'text-ink/[0.055]'} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

