import { useEffect, useState } from 'react'

/**
 * True while any dialog is on screen or a drawer/menu has locked page scroll.
 * Floating bars (tab bar, order rail, order-status card) use it to step aside
 * so they never sit on top of a pop-up's buttons.
 */
export function useModalOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = () =>
      setOpen(document.body.style.overflow === 'hidden' || Boolean(document.querySelector('[role="dialog"]')))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return open
}
