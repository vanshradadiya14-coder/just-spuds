import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a thermal slip straight under <body>, hidden on screen, so printing
 * it does not depend on the pop-up it was opened from. Content inside a fixed,
 * scrolling pop-up prints only the first page — a full end-of-day report runs
 * to a metre of paper, so it must flow from the top of the page instead.
 */
export default function PrintSlip({ id, children }: { id: string; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'print-slip-root'
    el.id = `print-slip-${id}`
    document.body.appendChild(el)
    setHost(el)
    return () => {
      el.remove()
    }
  }, [id])

  return host ? createPortal(children, host) : null
}

/** Prints only the slip rendered by <PrintSlip id={id}>. */
export function printSlip(id: string) {
  const target = document.getElementById(`print-slip-${id}`)
  if (!target) {
    window.print()
    return
  }
  document.body.classList.add('printing-slip')
  target.classList.add('print-active')
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    document.body.classList.remove('printing-slip')
    target.classList.remove('print-active')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // Browsers that print asynchronously still fire afterprint; this is only a safety net.
  window.setTimeout(cleanup, 60_000)
}
