import { useEffect, useState } from 'react'

/**
 * Publishes an element's live height as a CSS custom property on <html>
 * (e.g. `--header-h`), so sticky bars and floating cards elsewhere can sit
 * exactly against it at every screen size. Returns a callback ref.
 *
 * While the element is briefly unmounted (a bar hidden behind a modal) the
 * last height is kept, so the page underneath does not jump.
 */
export function useCssVarHeight<T extends HTMLElement>(name: string) {
  const [el, setEl] = useState<T | null>(null)
  useEffect(() => {
    if (!el) return
    const set = () => document.documentElement.style.setProperty(name, `${Math.round(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, name])
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(name)
    },
    [name],
  )
  return setEl
}
