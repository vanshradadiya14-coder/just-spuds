import { useEffect, useRef, useState } from 'react'
import { FRAG, VERT } from './backdrop.glsl'

interface Options {
  dark: boolean
  intensity: number
  enabled: boolean
}

/**
 * Mounts a WebGL2 fullscreen shader into a canvas.
 *
 * Everything here is defensive: if the context, shader compile or link fails we
 * return supported=false and the caller shows the CSS backdrop instead. The
 * loop only runs while the canvas is actually on screen.
 */
export function useBackdropGL({ dark, intensity, enabled }: Options) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [supported, setSupported] = useState(true)
  const mouse = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 })

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', premultipliedAlpha: false,
    })
    if (!gl) { setSupported(false); return }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        if (import.meta.env.DEV) console.warn('backdrop shader:', gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
      }
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) { setSupported(false); return }

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (import.meta.env.DEV) console.warn('backdrop link:', gl.getProgramInfoLog(prog))
      setSupported(false)
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uMouse = gl.getUniformLocation(prog, 'uMouse')
    const uDark = gl.getUniformLocation(prog, 'uDark')
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    // Render well below device resolution — it's a soft blurred field, so the
    // loss is invisible and the saving is large.
    const SCALE = 0.42
    let width = 0, height = 0
    let canvasRect = { left: 0, top: 0, width: 1, height: 1 }

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvasRect = { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) }
      const w = Math.max(1, Math.floor(r.width * SCALE))
      const h = Math.max(1, Math.floor(r.height * SCALE))
      if (w === width && h === height) return
      width = w; height = h
      canvas.width = w; canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
    }

    const onMove = (e: MouseEvent) => {
      mouse.current.tx = (e.clientX - canvasRect.left) / canvasRect.width
      mouse.current.ty = 1 - (e.clientY - canvasRect.top) / canvasRect.height
    }

    let raf = 0
    let running = false
    const start = performance.now()

    const frame = () => {
      if (!running) return
      raf = requestAnimationFrame(frame)
      const m = mouse.current
      m.x += (m.tx - m.x) * 0.045
      m.y += (m.ty - m.y) * 0.045
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.uniform2f(uMouse, m.x, m.y)
      gl.uniform1f(uDark, dark ? 1 : 0)
      gl.uniform1f(uIntensity, intensity)
      // Must clear: we blend onto a transparent canvas, so without this each
      // frame composites over the last and the field smears.
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    resize()

    const play = () => { if (!running) { running = true; raf = requestAnimationFrame(frame) } }
    const stop = () => { if (running) { running = false; cancelAnimationFrame(raf) } }

    // Only burn GPU while the section is visible.
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((e) => { e.some((x) => x.isIntersecting) ? play() : stop() }, { rootMargin: '120px' })
      : null
    io ? io.observe(canvas) : play()

    const onVisibility = () => (document.hidden ? stop() : play())
    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)

    const onLost = (e: Event) => { e.preventDefault(); stop(); setSupported(false) }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      stop()
      io?.disconnect()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [dark, intensity, enabled])

  return { canvasRef, supported }
}
