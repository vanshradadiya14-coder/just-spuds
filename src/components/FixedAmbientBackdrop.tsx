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
 * Ultra-refined ambient backdrop engine for Just Spuds.
 * Features organic culinary warmth, silky fluid auroras, and floating 3D golden embers.
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

    // Curated Culinary Light Palettes
    const storefrontPalette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Golden Amber
      { core: '254, 240, 138', glow: '217, 119, 6' },   // Honey Butter
      { core: '245, 158, 11', glow: '217, 119, 6' },    // Saffron Warmth
      { core: '234, 88, 12', glow: '194, 65, 12' },     // Roasted Hearth Ember
      { core: '254, 243, 199', glow: '245, 158, 11' },  // Clotted Cream
    ]

    const portalPalette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Amber Glow
      { core: '52, 211, 153', glow: '16, 185, 129' },   // Kitchen Emerald
      { core: '245, 158, 11', glow: '217, 119, 6' },    // Radiant Honey
    ]

    const loginPalette = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Warm Gold
      { core: '254, 243, 199', glow: '245, 158, 11' },  // Pure Cream
    ]

    const isPortal = variant === 'portal'
    const isLogin = variant === 'login'
    const palette = isPortal ? portalPalette : isLogin ? loginPalette : storefrontPalette

    const particleCount = isPortal ? 26 : isLogin ? 20 : 28
    const particles: Particle[] = []

    for (let i = 0; i < particleCount; i++) {
      const col = palette[Math.floor(Math.random() * palette.length)]
      particles.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1200,
        z: Math.random() * 640 + 50,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -Math.random() * 0.38 - 0.14, // gentle upward heat drift
        vz: (Math.random() - 0.5) * 0.20,
        size: Math.random() * 2.8 + 1.2,
        baseAlpha: Math.random() * 0.40 + 0.25,
        pulseSpeed: Math.random() * 0.025 + 0.012,
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
      targetCamY = normX * 0.10
      targetCamX = -normY * 0.08
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

      time += 0.016
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

      // Draw Silky Multi-Stop Ambient Light Pools
      if (isPortal) {
        // Portal: Deep Obsidian with warm amber top glow
        const g1X = cx + Math.sin(time * 0.25) * (width * 0.2)
        const g1Y = cy * 0.25 + Math.cos(time * 0.2) * 40
        const g1 = ctx.createRadialGradient(g1X, g1Y, 15, g1X, g1Y, width * 0.45)
        g1.addColorStop(0, 'rgba(245, 158, 11, 0.12)')
        g1.addColorStop(0.5, 'rgba(217, 119, 6, 0.04)')
        g1.addColorStop(1, 'rgba(10, 13, 17, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)
      } else if (isLogin) {
        // Login: Soft central amber glow behind login card
        const g1X = cx
        const g1Y = cy * 0.95
        const g1 = ctx.createRadialGradient(g1X, g1Y, 10, g1X, g1Y, Math.min(width, height) * 0.50)
        g1.addColorStop(0, 'rgba(245, 158, 11, 0.15)')
        g1.addColorStop(0.5, 'rgba(251, 191, 36, 0.07)')
        g1.addColorStop(1, 'rgba(253, 251, 247, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)
      } else {
        // Storefront: Soft warm hearth breathing glow (Appetizing & Gentle)
        const g1X = cx + Math.sin(time * 0.22) * (width * 0.18)
        const g1Y = cy * 0.55 + Math.cos(time * 0.18) * 50
        const g1 = ctx.createRadialGradient(g1X, g1Y, 20, g1X, g1Y, width * 0.48)
        g1.addColorStop(0, 'rgba(245, 158, 11, 0.12)')
        g1.addColorStop(0.45, 'rgba(251, 191, 36, 0.05)')
        g1.addColorStop(1, 'rgba(253, 251, 247, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)

        const g2X = cx * 0.6 - Math.cos(time * 0.24) * (width * 0.15)
        const g2Y = cy * 1.35 + Math.sin(time * 0.20) * 45
        const g2 = ctx.createRadialGradient(g2X, g2Y, 15, g2X, g2Y, width * 0.42)
        g2.addColorStop(0, 'rgba(234, 88, 12, 0.08)')
        g2.addColorStop(0.5, 'rgba(217, 119, 6, 0.03)')
        g2.addColorStop(1, 'rgba(253, 251, 247, 0)')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, width, height)
      }

      // Draw 3D Spatial Golden Embers
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        p.x += p.vx + Math.sin(time * 0.8 + p.pulseOffset) * 0.25
        p.y += p.vy
        p.z += p.vz

        // Wrap boundaries in 3D space
        if (p.y < -600) p.y = 600
        if (p.x < -800) p.x = 800
        if (p.x > 800) p.x = -800
        if (p.z < 35) p.z = 720
        if (p.z > 720) p.z = 35

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

        // Mouse Proximity Repulsion
        if (mouseX > 0 && mouseY > 0) {
          const dx = px - mouseX
          const dy = py - mouseY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxDist = 140
          if (dist < maxDist && dist > 0) {
            const force = (1 - dist / maxDist) * 14 * scale
            px += (dx / dist) * force
            py += (dy / dist) * force
          }
        }

        const depthFactor = Math.max(0.18, 1 - z2 / 850)
        const pulse = 0.85 + Math.sin(time * p.pulseSpeed * 60 + p.pulseOffset) * 0.20
        const alpha = Math.min(1, depthFactor * p.baseAlpha * pulse)

        if (px >= -30 && px <= width + 30 && py >= -30 && py <= height + 30) {
          // Radiant Glow Corona
          if (pSize > 1.1) {
            const glowRadius = pSize * 4.5
            const radGrad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius)
            radGrad.addColorStop(0, `rgba(${p.glowColor}, ${alpha * 0.45})`)
            radGrad.addColorStop(1, `rgba(${p.glowColor}, 0)`)
            ctx.fillStyle = radGrad
            ctx.beginPath()
            ctx.arc(px, py, glowRadius, 0, Math.PI * 2)
            ctx.fill()
          }

          // Luminous Ember Core
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
      {/* 1. Fluid Ambient Lighting & Floating Embers */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-90 will-change-transform"
      />

      {/* 2. Soft Edge Vignette & Corner Ambient Glow Accents (Zero Cyan/Blue!) */}
      <div
        className={`absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full blur-[120px] pointer-events-none transition-opacity ${
          isPortal
            ? 'bg-amber-500/10'
            : 'bg-amber-400/12'
        }`}
      />
      <div
        className={`absolute -bottom-32 -right-32 h-[460px] w-[460px] rounded-full blur-[130px] pointer-events-none transition-opacity ${
          isPortal
            ? 'bg-amber-600/08'
            : 'bg-amber-500/10'
        }`}
      />
    </div>
  )
}

