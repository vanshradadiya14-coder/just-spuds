import { useCallback, useEffect, useState } from 'react'

/**
 * Full screen for the staff screens (till, kitchen, admin).
 *
 * - Works with the prefixed API iPad Safari still uses.
 * - Follows Esc / the browser's own exit, so the button never shows the wrong state.
 * - Remembers it: after a reload the browser drops full screen, and the first
 *   tap on the screen puts it back (browsers only allow it from a tap).
 *   Leaving full screen on purpose turns that off.
 */

const PREF_KEY = 'just_spuds_staff_fullscreen_v1'

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

const doc = () => (typeof document === 'undefined' ? null : (document as FsDocument))

export function isFullscreenSupported(): boolean {
  const d = doc()
  if (!d) return false
  return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled)
}

function currentlyFullscreen(): boolean {
  const d = doc()
  return Boolean(d && (d.fullscreenElement || d.webkitFullscreenElement))
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

function writePref(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1')
    else localStorage.removeItem(PREF_KEY)
  } catch {}
}

async function enter() {
  const el = document.documentElement as FsElement
  try {
    if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
  } catch {
    // Refused (no tap, or the browser does not allow it here) — nothing to do.
  }
}

async function exit() {
  const d = doc()
  if (!d) return
  try {
    if (d.exitFullscreen) await d.exitFullscreen()
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen()
  } catch {}
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(currentlyFullscreen)
  const supported = isFullscreenSupported()

  useEffect(() => {
    if (!supported) return
    let unloading = false
    const onUnload = () => {
      unloading = true
    }
    const onChange = () => {
      const on = currentlyFullscreen()
      setIsFullscreen(on)
      // A reload also leaves full screen; only a deliberate exit forgets the choice.
      if (!unloading) writePref(on)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)

    // Back to full screen on the first tap after a reload, if it was on.
    const restore = () => {
      if (readPref() && !currentlyFullscreen()) void enter()
    }
    if (readPref() && !currentlyFullscreen()) window.addEventListener('pointerdown', restore, { once: true, capture: true })

    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('pointerdown', restore, { capture: true })
    }
  }, [supported])

  const toggle = useCallback(() => {
    if (currentlyFullscreen()) {
      writePref(false)
      void exit()
    } else {
      writePref(true)
      void enter()
    }
  }, [])

  return { supported, isFullscreen, toggle }
}
