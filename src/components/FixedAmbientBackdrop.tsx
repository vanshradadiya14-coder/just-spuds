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

export type BackdropVariant = 'storefront' | 'portal' | 'login' | 'cfd'

interface FixedAmbientBackdropProps {
  variant?: BackdropVariant
}

/**
 * Ultra-optimized creative ambient backdrop engine for Just Spuds.
 * Provides rich fluid auroras, 3D floating embers/sparks, and artistic craft textures.
 */
export default function FixedAmbientBackdrop({ variant = 'storefront' }: FixedAmbientBackdropProps) {
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

    // Color palettes tuned for each mode
    const storefrontPalette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Golden Amber
      { core: '253, 230, 138', glow: '217, 119, 6' },   // Warm Honey
      { core: '245, 158, 11', glow: '217, 119, 6' },    // Rich Saffron
      { core: '224, 122, 95', glow: '180, 83, 9' },     // Roasted Terracotta
      { core: '254, 243, 199', glow: '245, 158, 11' },   // Butter Cream
    ]

    const portalPalette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Electric Amber
      { core: '254, 240, 138', glow: '217, 119, 6' },   // Radiant Gold
      { core: '52, 211, 153', glow: '16, 185, 129' },   // Kitchen Emerald
      { core: '249, 115, 22', glow: '194, 65, 12' },    // Oven Flame
    ]

    const loginPalette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Warm Gold
      { core: '253, 230, 138', glow: '217, 119, 6' },   // Honey
      { core: '254, 243, 199', glow: '245, 158, 11' },   // Pure Butter Cream
    ]

    const isPortal = variant === 'portal'
    const isLogin = variant === 'login'
    const palette = isPortal ? portalPalette : isLogin ? loginPalette : storefrontPalette

    const particleCount = isPortal ? 44 : isLogin ? 36 : 48
    const particles: Particle[] = []

    for (let i = 0; i < particleCount; i++) {
      const col = palette[Math.floor(Math.random() * palette.length)]
      particles.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1200,
        z: Math.random() * 680 + 40,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -Math.random() * 0.45 - 0.18, // gentle upward heat drift
        vz: (Math.random() - 0.5) * 0.28,
        size: Math.random() * 3.4 + 1.5,
        baseAlpha: Math.random() * 0.5 + (isPortal ? 0.45 : 0.35),
        pulseSpeed: Math.random() * 0.035 + 0.015,
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
      targetCamY = normX * 0.14
      targetCamX = -normY * 0.10
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

      time += 0.02
      ctx.clearRect(0, 0, width, height)

      // Smooth camera interpolation
      camX += (targetCamX - camX) * 0.045
      camY += (targetCamY - camY) * 0.045

      const cosX = Math.cos(camX)
      const sinX = Math.sin(camX)
      const cosY = Math.cos(camY)
      const sinY = Math.sin(camY)

      const cx = width / 2
      const cy = height / 2

      // Draw Multi-Layer Fluid Aurora Waves
      if (isPortal) {
        // Portal Aurora: High-Tech Deep Obsidian with Radiant Corner Accents
        const g1X = cx + Math.sin(time * 0.3) * (width * 0.25)
        const g1Y = cy * 0.3 + Math.cos(time * 0.22) * 50
        const g1 = ctx.createRadialGradient(g1X, g1Y, 20, g1X, g1Y, width * 0.5)
        g1.addColorStop(0, 'rgba(245, 158, 11, 0.16)')
        g1.addColorStop(0.5, 'rgba(217, 119, 6, 0.07)')
        g1.addColorStop(1, 'rgba(9, 11, 14, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)

        const g2X = cx * 1.5 - Math.cos(time * 0.26) * (width * 0.2)
        const g2Y = cy * 1.5 + Math.sin(time * 0.28) * 60
        const g2 = ctx.createRadialGradient(g2X, g2Y, 15, g2X, g2Y, width * 0.45)
        g2.addColorStop(0, 'rgba(16, 185, 129, 0.12)')
        g2.addColorStop(0.5, 'rgba(5, 150, 105, 0.04)')
        g2.addColorStop(1, 'rgba(9, 11, 14, 0)')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, width, height)
      } else if (isLogin) {
        // Login Aura: Majestic Central Warmth behind login card
        const g1X = cx
        const g1Y = cy * 0.95
        const g1 = ctx.createRadialGradient(g1X, g1Y, 10, g1X, g1Y, Math.min(width, height) * 0.55)
        g1.addColorStop(0, 'rgba(245, 158, 11, 0.22)')
        g1.addColorStop(0.4, 'rgba(251, 191, 36, 0.12)')
        g1.addColorStop(0.8, 'rgba(224, 122, 95, 0.05)')
        g1.addColorStop(1, 'rgba(250, 246, 239, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)
      } else {
        // Storefront Aurora: Warm Saffron, Golden Butter & Hearth Coral
        const g1X = cx + Math.sin(time * 0.3) * (width * 0.22)
        const g1Y = cy * 0.65 + Math.cos(time * 0.22) * 65
        const g1 = ctx.createRadialGradient(g1X, g1Y, 20, g1X, g1Y, width * 0.52)
        g1.addColorStop(0, 'rgba(245, 158, 11, 0.18)')
        g1.addColorStop(0.45, 'rgba(251, 191, 36, 0.09)')
        g1.addColorStop(1, 'rgba(250, 246, 239, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)

        const g2X = cx * 0.5 - Math.cos(time * 0.28) * (width * 0.18)
        const g2Y = cy * 1.35 + Math.sin(time * 0.25) * 55
        const g2 = ctx.createRadialGradient(g2X, g2Y, 15, g2X, g2Y, width * 0.46)
        g2.addColorStop(0, 'rgba(224, 122, 95, 0.12)')
        g2.addColorStop(0.5, 'rgba(217, 119, 6, 0.05)')
        g2.addColorStop(1, 'rgba(250, 246, 239, 0)')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, width, height)
      }

      // Draw 3D Spatial Luminous Golden Embers
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        p.x += p.vx + Math.sin(time * 1.1 + p.pulseOffset) * 0.32
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
        const pSize = Math.max(1.0, p.size * scale)

        // Fluid Mouse Magnetic Interaction
        if (mouseX > 0 && mouseY > 0) {
          const dx = px - mouseX
          const dy = py - mouseY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxDist = 160
          if (dist < maxDist && dist > 0) {
            const force = (1 - dist / maxDist) * 18 * scale
            px += (dx / dist) * force
            py += (dy / dist) * force
          }
        }

        const depthFactor = Math.max(0.2, 1 - z2 / 850)
        const pulse = 0.85 + Math.sin(time * p.pulseSpeed * 60 + p.pulseOffset) * 0.22
        const alpha = Math.min(1, depthFactor * p.baseAlpha * pulse)

        if (px >= -30 && px <= width + 30 && py >= -30 && py <= height + 30) {
          // Radiant Glow Corona
          if (pSize > 1.2) {
            const glowRadius = pSize * 5.2
            const radGrad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius)
            radGrad.addColorStop(0, `rgba(${p.glowColor}, ${alpha * 0.6})`)
            radGrad.addColorStop(1, `rgba(${p.glowColor}, 0)`)
            ctx.fillStyle = radGrad
            ctx.beginPath()
            ctx.arc(px, py, glowRadius, 0, Math.PI * 2)
            ctx.fill()
          }

          // Crisp Luminous Core
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
  }, [variant, reduced])

  const isPortal = variant === 'portal'

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden contain-strict"
      aria-hidden="true"
    >
      {/* 1. Dynamic Canvas: Fluid Auroras & 3D Interactive Golden Embers */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-95 will-change-transform"
      />

      {/* 2. Soft Tactile Radial Edge Vignette & Corner Ambient Glow Accents */}
      <div
        className={`absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full blur-[110px] pointer-events-none transition-opacity ${
          isPortal
            ? 'bg-amber-500/15'
            : 'bg-amber-400/20'
        }`}
      />
      <div
        className={`absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full blur-[120px] pointer-events-none transition-opacity ${
          isPortal
            ? 'bg-emerald-500/10'
            : 'bg-amber-500/15'
        }`}
      />
    </div>
  )
}
