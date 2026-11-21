import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getPrinterPrefs, paperWidthMm } from '../services/printerBridge'

/**
 * Renders a thermal slip straight under <body>, hidden on screen, so printing
 * it does not depend on the pop-up it was opened from. Content inside a fixed,
 * scrolling pop-up prints only the first page — a full end-of-day report runs
 * to a metre of paper, so it must flow from the top of the page instead.
 *
 * `widthMm` is the printable width (72 mm on an 80 mm roll, 48 mm on 58 mm);
 * it defaults to this till's printer setting.
 */
export default function PrintSlip({ id, children, widthMm }: { id: string; children: ReactNode; widthMm?: number }) {
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

  useEffect(() => {
    host?.style.setProperty('--slip-w', `${widthMm ?? paperWidthMm(getPrinterPrefs().cols)}mm`)
  }, [host, widthMm])

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
