import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'

/**
 * A dropdown that opens under its button but always stays on screen: it is
 * positioned in viewport coordinates and clamped to the edges, so it can't be
 * cut off by a wrapped header or a clipped page container on any screen size.
 */
export default function MenuPopover({
  anchorRef,
  onClose,
  label,
  width = 272,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  label: string
  width?: number
  children: ReactNode
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect()
      if (!r) return
      const vw = document.documentElement.clientWidth
      const w = Math.min(width, vw - 24)
      const top = r.bottom + 8
      setBox({
        top,
        left: Math.max(12, Math.min(r.right - w, vw - w - 12)),
        width: w,
        maxHeight: Math.max(160, window.innerHeight - top - 12),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, { capture: true })
    }
  }, [anchorRef, width])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="menu"
        aria-label={label}
        style={box ?? { visibility: 'hidden', top: 0, left: 0 }}
        className="fixed z-50 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-slate-900 p-2 shadow-2xl"
      >
        {children}
      </div>
    </>
  )
}
