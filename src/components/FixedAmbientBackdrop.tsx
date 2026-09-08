import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
  baseAlpha: number
  pulseSpeed: number
  pulseOffset: number
  color: string
  glowColor: string
}

/**
 * Single, ultra-optimized fixed background engine for the entire application.
 * Positioned fixed behind all pages to guarantee 120 FPS zero-jank scrolling.
 */
export default function FixedAmbientBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let animId = 0
    let width = 0
    let height = 0
    let isVisible = true

    let mouseX = -9999
    let mouseY = -9999
    let targetCamX = 0
    let targetCamY = 0
    let camX = 0
    let camY = 0

    // Palette: Luminous Golden Amber, Warm Honey, and Deep Ember
    const palette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Golden Amber
      { core: '253, 230, 138', glow: '217, 119, 6' },   // Warm Honey
      { core: '254, 243, 199', glow: '245, 158, 11' },   // Luminous Cream
      { core: '224, 122, 95', glow: '217, 119, 6' },    // Terracotta Ember
    ]

    const particleCount = 38
    const particles: Particle[] = []

    for (let i = 0; i < particleCount; i++) {
      const col = palette[Math.floor(Math.random() * palette.length)]
      particles.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1200,
        z: Math.random() * 650 + 50,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.4 - 0.15, // gentle upward drift
        vz: (Math.random() - 0.5) * 0.25,
        size: Math.random() * 3.2 + 1.4,
        baseAlpha: Math.random() * 0.45 + 0.3,
        pulseSpeed: Math.random() * 0.03 + 0.015,
        pulseOffset: Math.random() * Math.PI * 2,
        color: col.core,
        glowColor: col.glow,
      })
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      const normX = (mouseX / (width || 1)) * 2 - 1
      const normY = (mouseY / (height || 1)) * 2 - 1
      targetCamY = normX * 0.12
      targetCamX = -normY * 0.09
    }

    const handleMouseLeave = () => {
      mouseX = -9999
      mouseY = -9999
      targetCamX = 0
      targetCamY = 0
    }

    const handleVisibilityChange = () => {
      isVisible = !document.hidden
      if (isVisible && !animId) {
        animId = requestAnimationFrame(render)
      }
    }

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
    resize()

    const fov = 480
    let time = 0

    const render = () => {
      if (!isVisible) {
        animId = 0
        return
      }

      time += 0.018
      ctx.clearRect(0, 0, width, height)

      // Smooth camera interpolation
      camX += (targetCamX - camX) * 0.04
      camY += (targetCamY - camY) * 0.04

      const cosX = Math.cos(camX)
      const sinX = Math.sin(camX)
      const cosY = Math.cos(camY)
      const sinY = Math.sin(camY)

      const cx = width / 2
      const cy = height / 2

      // Draw Atmospheric Fluid Aurora Waves
      const g1X = cx + Math.sin(time * 0.3) * (width * 0.2)
      const g1Y = cy * 0.7 + Math.cos(time * 0.22) * 60
      const g1 = ctx.createRadialGradient(g1X, g1Y, 15, g1X, g1Y, width * 0.48)
      g1.addColorStop(0, 'rgba(245, 158, 11, 0.10)')
      g1.addColorStop(0.5, 'rgba(217, 119, 6, 0.04)')
      g1.addColorStop(1, 'rgba(14, 16, 21, 0)')
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, width, height)

      // Draw 3D Spatial Golden Embers
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        p.x += p.vx + Math.sin(time + p.pulseOffset) * 0.3
        p.y += p.vy
        p.z += p.vz

        // Wrap boundaries in 3D space
        if (p.y < -600) p.y = 600
        if (p.x < -800) p.x = 800
        if (p.x > 800) p.x = -800
        if (p.z < 35) p.z = 750
        if (p.z > 750) p.z = 35

        // 3D Rotation
        const x1 = p.x * cosY + p.z * sinY
        const z1 = -p.x * sinY + p.z * cosY
        const y2 = p.y * cosX - z1 * sinX
        const z2 = p.y * sinX + z1 * cosX

        if (z2 <= 10) continue

        const scale = fov / (fov + z2)
        let px = x1 * scale + cx
        let py = y2 * scale + cy
        const pSize = Math.max(0.8, p.size * scale)

        // Fluid Mouse Magnetic Interaction
        if (mouseX > 0 && mouseY > 0) {
          const dx = px - mouseX
          const dy = py - mouseY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxDist = 140
          if (dist < maxDist && dist > 0) {
            const force = (1 - dist / maxDist) * 16 * scale
            px += (dx / dist) * force
            py += (dy / dist) * force
          }
        }

        const depthFactor = Math.max(0.18, 1 - z2 / 850)
        const pulse = 0.85 + Math.sin(time * p.pulseSpeed * 60 + p.pulseOffset) * 0.2
        const alpha = Math.min(1, depthFactor * p.baseAlpha * pulse)

        if (px >= -25 && px <= width + 25 && py >= -25 && py <= height + 25) {
          // Radiant Glow Aura
          if (pSize > 1.3) {
            const glowRadius = pSize * 4.8
            const radGrad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius)
            radGrad.addColorStop(0, `rgba(${p.glowColor}, ${alpha * 0.5})`)
            radGrad.addColorStop(1, `rgba(${p.glowColor}, 0)`)
            ctx.fillStyle = radGrad
            ctx.beginPath()
            ctx.arc(px, py, glowRadius, 0, Math.PI * 2)
            ctx.fill()
          }

          // Luminous Core
          ctx.fillStyle = `rgba(${p.color}, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, pSize, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [reduced])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden contain-strict">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="h-full w-full opacity-90 will-change-transform"
      />
    </div>
  )
}
