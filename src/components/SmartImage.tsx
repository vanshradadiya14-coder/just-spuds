import { useEffect, useRef, useState } from 'react'
import { resolve } from '../data/images'
import { cx } from '../utils/format'

interface Props {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  fallbackLabel?: string
  eager?: boolean
  cover?: boolean
}

/**
 * Resolves a path to the best available source, then walks down to the
 * fallback if that fails. Immediately renders cached images with zero flicker.
 */
export default function SmartImage({
  src, alt, className, imgClassName, fallbackLabel, eager = false, cover = false,
}: Props) {
  const resolved = resolve(src)
  const [current, setCurrent] = useState(resolved.src)
  const [triedFallback, setTriedFallback] = useState(false)
  const [status, setStatus] = useState<'loaded' | 'error'>('loaded')
  const [visible, setVisible] = useState(eager)
  const holder = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const r = resolve(src)
    setCurrent(r.src)
    setTriedFallback(false)
    setStatus('loaded')
  }, [src])

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      setStatus('loaded')
    }
  }, [current])

  useEffect(() => {
    if (eager || visible) return
    const el = holder.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(
      (e) => { if (e.some((x) => x.isIntersecting)) { setVisible(true); io.disconnect() } },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [eager, visible])

  const onError = () => {
    if (!triedFallback && resolved.fallback) {
      setTriedFallback(true)
      setCurrent(resolved.fallback)
      return
    }
    setStatus('error')
  }

  const dead = !current || status === 'error'

  return (
    <div ref={holder} className={cx('relative overflow-hidden', className)}>
      {!dead && visible && (
        <img
          ref={imgRef}
          key={current}
          src={current}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={onError}
          className={cx(
            'grade h-full w-full transition-opacity duration-500 ease-cine',
            cover ? 'object-cover' : 'object-contain',
            status === 'loaded' ? 'opacity-100' : 'opacity-90',
            imgClassName,
          )}
        />
      )}

      {dead && (
        <div aria-hidden className="absolute inset-0 grid place-items-center bg-line/20">
          <div className="flex flex-col items-center gap-3 px-4">
            <span className="text-3xl">🥔</span>
            {fallbackLabel && (
              <span className="text-center font-body text-[10px] uppercase tracking-wider text-steel">
                {fallbackLabel}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

