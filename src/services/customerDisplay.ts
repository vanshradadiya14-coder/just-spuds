/**
 * CUSTOMER DISPLAY ON THE TILL'S SECOND SCREEN
 *
 * The customer display (/cfd) gets the basket from the till through the same
 * browser (cfdBus: BroadcastChannel + localStorage), so the till opens it as a
 * window of its own and places it on the other monitor.
 *
 * Browsers only allow that:
 *   - after a tap on the till (the PIN sign-on tap counts), and
 *   - on another monitor once the site may "manage windows on all your
 *     displays" (Chrome / Edge ask once; the answer is remembered).
 * Without that permission the window still opens, at the right of the till
 * screen, which is where the second monitor usually is.
 */

const PREF_KEY = 'just_spuds_cfd_auto_v1'
const WINDOW_NAME = 'JustSpudsCFD'

let displayWindow: Window | null = null

export function isCustomerDisplayAuto(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function setCustomerDisplayAuto(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1')
    else localStorage.removeItem(PREF_KEY)
  } catch {
    // private mode
  }
}

export function isCustomerDisplayOpen(): boolean {
  return Boolean(displayWindow && !displayWindow.closed)
}

interface ScreenBox {
  left: number
  top: number
  width: number
  height: number
  label?: string
}

/** The other monitor, if the browser will tell us (Window Management API). */
async function otherScreen(): Promise<ScreenBox | null> {
  const w = window as unknown as { getScreenDetails?: () => Promise<{ screens: any[]; currentScreen: any }> }
  if (typeof w.getScreenDetails !== 'function') return null
  try {
    const details = await w.getScreenDetails()
    const others = details.screens.filter((s) => s !== details.currentScreen)
    const pick = others.find((s) => !s.isPrimary) || others[0]
    if (!pick) return null
    return { left: pick.availLeft, top: pick.availTop, width: pick.availWidth, height: pick.availHeight, label: pick.label }
  } catch {
    return null // permission refused
  }
}

/** Whether the browser already lets this site place windows on other screens. */
export async function screenPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (typeof (window as any).getScreenDetails !== 'function') return 'unsupported'
  try {
    const status = await navigator.permissions.query({ name: 'window-management' as PermissionName })
    return status.state as 'granted' | 'prompt' | 'denied'
  } catch {
    return 'prompt'
  }
}

/** The second screen, remembered once known (asking needs no tap once allowed). */
let knownBox: ScreenBox | null = null

/** Looks the second screen up ahead of time when the browser already allows it. */
export async function prepareCustomerDisplay(): Promise<void> {
  if ((await screenPermission()) === 'granted') knownBox = (await otherScreen()) || knownBox
}

const moveTo = (w: Window, box: ScreenBox) => {
  try {
    w.moveTo(box.left, box.top)
    w.resizeTo(box.width, box.height)
  } catch {
    // ignore
  }
}

/**
 * Opens (or brings back) the customer display on the second screen. Call it
 * from a tap: the window is opened straight away (before anything is awaited,
 * or the browser treats it as an unwanted pop-up), then moved to the second
 * screen — asking "manage windows on all your displays" the first time.
 */
export async function openCustomerDisplay(): Promise<{ ok: boolean; message: string }> {
  if (isCustomerDisplayOpen()) {
    displayWindow!.focus()
    return { ok: true, message: 'Customer display is open.' }
  }
  const box: ScreenBox = knownBox || {
    // Until the browser says where the second screen is: just right of this one.
    left: ((window.screen as any).availLeft || 0) + window.screen.availWidth,
    top: 0,
    width: 1280,
    height: 800,
  }
  const features = `popup=yes,left=${box.left},top=${box.top},width=${box.width},height=${box.height}`
  // An empty URL returns the display window if it is still open from before a
  // till reload (no flicker); otherwise it is a fresh blank window we point at /cfd.
  const w = window.open('', WINDOW_NAME, features)
  if (!w) return { ok: false, message: 'The browser blocked the customer display. Allow pop-ups for this site, then tap again.' }
  displayWindow = w
  let alreadyShowing = false
  try {
    alreadyShowing = /\/(cfd|customer-display)(\/|$|\?)/.test(w.location.pathname)
  } catch {
    // not readable: treat as new
  }
  if (!alreadyShowing) w.location.href = '/cfd'
  moveTo(w, box)
  if (!knownBox) {
    // Now find the real second screen (the browser may ask the first time).
    const found = await otherScreen()
    if (found) {
      knownBox = found
      moveTo(w, found)
    }
  }
  const where = knownBox?.label ? ` on ${knownBox.label}` : knownBox ? ' on the second screen' : ''
  return { ok: true, message: alreadyShowing ? 'Customer display is open.' : `Customer display opened${where}.` }
}

let armed = false

/**
 * "Open it when the till opens": the first tap on the till (usually the PIN)
 * opens the customer display. Re-arms if the display gets closed.
 */
export function armCustomerDisplayAutoOpen(onResult?: (r: { ok: boolean; message: string }) => void): () => void {
  if (armed || typeof window === 'undefined') return () => {}
  armed = true
  void prepareCustomerDisplay()
  let busy = false
  const handler = () => {
    if (busy || !isCustomerDisplayAuto() || isCustomerDisplayOpen()) return
    busy = true
    // Called inside the tap itself, so the browser allows the window.
    void openCustomerDisplay()
      .then((r) => onResult?.(r))
      .finally(() => {
        busy = false
      })
  }
  window.addEventListener('pointerdown', handler, true)
  window.addEventListener('keydown', handler, true)
  return () => {
    armed = false
    window.removeEventListener('pointerdown', handler, true)
    window.removeEventListener('keydown', handler, true)
  }
}
