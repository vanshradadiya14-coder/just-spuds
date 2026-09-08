import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

interface Canvas3DProps {
  tone?: 'dark' | 'light'
  intensity?: number
}

interface Particle3D {
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

export default function Canvas3D({ tone = 'dark', intensity = 1 }: Canvas3DProps) {
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

    const isDark = tone === 'dark'

    // Smooth camera & mouse tracking
    let mouseX = -9999
    let mouseY = -9999
    let targetCamX = 0
    let targetCamY = 0
    let camX = 0
    let camY = 0

    // Particle Palette: Warm Golden Amber, Honey, and Radiant Cream
    const darkColors = [
      { core: '251, 191, 36', glow: '245, 158, 11' },   // Golden Amber
      { core: '253, 230, 138', glow: '217, 119, 6' },   // Warm Honey
      { core: '254, 243, 199', glow: '245, 158, 11' },   // Luminous Cream
      { core: '224, 122, 95', glow: '217, 119, 6' },    // Warm Terracotta Ember
    ]

    const lightColors = [
      { core: '217, 119, 6', glow: '245, 158, 11' },    // Deep Amber
      { core: '245, 158, 11', glow: '251, 191, 36' },   // Golden Honey
      { core: '180, 83, 9', glow: '245, 158, 11' },     // Roasted Caramel
    ]

    const palette = isDark ? darkColors : lightColors
    const particleCount = isDark ? 46 : 28
    const particles: Particle3D[] = []

    for (let i = 0; i < particleCount; i++) {
      const col = palette[Math.floor(Math.random() * palette.length)]
      particles.push({
        x: (Math.random() - 0.5) * 1500,
        y: (Math.random() - 0.5) * 1100,
        z: Math.random() * 650 + 40,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -Math.random() * 0.5 - 0.2, // gentle warm upward drift
        vz: (Math.random() - 0.5) * 0.28,
        size: Math.random() * 3.4 + 1.6,
        baseAlpha: Math.random() * 0.5 + 0.35,
        pulseSpeed: Math.random() * 0.035 + 0.015,
        pulseOffset: Math.random() * Math.PI * 2,
        color: col.core,
        glowColor: col.glow,
      })
    }

    let cachedRect = { left: 0, top: 0 }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      cachedRect = { left: rect.left, top: rect.top }
      width = rect.width
      height = rect.height
      canvas.width = width
      canvas.height = height
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isVisible) return
      mouseX = e.clientX - cachedRect.left
      mouseY = e.clientY - cachedRect.top
      const normX = (mouseX / (width || 1)) * 2 - 1
      const normY = (mouseY / (height || 1)) * 2 - 1
      targetCamY = normX * 0.16
      targetCamX = -normY * 0.12
    }

    const handleMouseLeave = () => {
      mouseX = -9999
      mouseY = -9999
      targetCamX = 0
      targetCamY = 0
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting
          if (isVisible && !animId) {
            animId = requestAnimationFrame(render)
          }
        })
      },
      { threshold: 0.05 }
    )
    observer.observe(canvas)

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    resize()

    const fov = 460
    let time = 0

    const render = () => {
      if (!isVisible) {
        animId = 0
        return
      }

      time += 0.022
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

      // Draw Atmospheric Fluid Aurora Waves
      if (isDark) {
        // Wave 1: Warm Golden Amber
        const g1X = cx + Math.sin(time * 0.35) * (width * 0.22)
        const g1Y = cy * 0.75 + Math.cos(time * 0.25) * 70
        const g1 = ctx.createRadialGradient(g1X, g1Y, 20, g1X, g1Y, width * 0.5)
        g1.addColorStop(0, `rgba(245, 158, 11, ${0.12 * intensity})`)
        g1.addColorStop(0.5, `rgba(217, 119, 6, ${0.06 * intensity})`)
        g1.addColorStop(1, 'rgba(14, 16, 21, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)

        // Wave 2: Hearth Copper Honey
        const g2X = cx * 1.3 - Math.cos(time * 0.3) * (width * 0.18)
        const g2Y = cy * 1.2 + Math.sin(time * 0.28) * 50
        const g2 = ctx.createRadialGradient(g2X, g2Y, 15, g2X, g2Y, width * 0.42)
        g2.addColorStop(0, `rgba(251, 191, 36, ${0.08 * intensity})`)
        g2.addColorStop(0.6, `rgba(180, 83, 9, ${0.03 * intensity})`)
        g2.addColorStop(1, 'rgba(14, 16, 21, 0)')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, width, height)
      } else {
        const g1X = cx + Math.sin(time * 0.3) * (width * 0.2)
        const g1Y = cy * 0.8 + Math.cos(time * 0.25) * 60
        const g1 = ctx.createRadialGradient(g1X, g1Y, 20, g1X, g1Y, width * 0.45)
        g1.addColorStop(0, `rgba(254, 243, 199, ${0.45 * intensity})`)
        g1.addColorStop(0.5, `rgba(245, 158, 11, ${0.06 * intensity})`)
        g1.addColorStop(1, 'rgba(246, 247, 250, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, width, height)
      }

      // Draw 3D Spatial Golden Embers
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        p.x += p.vx + Math.sin(time * 1.2 + p.pulseOffset) * 0.35
        p.y += p.vy
        p.z += p.vz

        // Wrap 3D bounds
        if (p.y < -550) p.y = 550
        if (p.x < -750) p.x = 750
        if (p.x > 750) p.x = -750
        if (p.z < 35) p.z = 740
        if (p.z > 740) p.z = 35

        // 3D Perspective Rotation
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
          const maxDist = 150
          if (dist < maxDist && dist > 0) {
            const force = (1 - dist / maxDist) * 18 * scale
            px += (dx / dist) * force
            py += (dy / dist) * force
          }
        }

        const depthFactor = Math.max(0.18, 1 - z2 / 800)
        const pulse = 0.82 + Math.sin(time * p.pulseSpeed * 60 + p.pulseOffset) * 0.22
        const alpha = Math.min(1, depthFactor * p.baseAlpha * pulse * intensity)

        if (px >= -30 && px <= width + 30 && py >= -30 && py <= height + 30) {
          // Radiant Glow Aura for larger embers
          if (pSize > 1.3) {
            const glowRadius = pSize * 5.2
            const radGrad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius)
            radGrad.addColorStop(0, `rgba(${p.glowColor}, ${alpha * 0.55})`)
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
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [tone, intensity, reduced])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: tone === 'dark' ? 0.95 : 0.75 }}
    />
  )
}
