/**
 * SECURE INSTALL & PWA PROMPT CONTROLLER
 * --------------------------------------
 * Globally intercepts the browser's `beforeinstallprompt` event to suppress
 * automatic omnibox install prompts for unauthenticated visitors.
 *
 * Standalone software installation can only be triggered intentionally
 * by an authorized store manager / staff member from inside the authenticated app.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<(canInstall: boolean) => void>()

function notifyListeners() {
  const canInstall = !!deferredPrompt
  listeners.forEach((fn) => fn(canInstall))
}

// Immediately bind global listener when module loads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome / Edge from automatically showing the install button in the omnibox
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notifyListeners()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notifyListeners()
  })
}

/** Check if currently running inside installed standalone desktop / mobile window */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  )
}

/** Check whether the browser can currently prompt for installation */
export function canInstallApp(): boolean {
  return !isRunningStandalone() && !!deferredPrompt
}

/** Subscribe to changes in install availability */
export function subscribeInstallPrompt(callback: (canInstall: boolean) => void): () => void {
  listeners.add(callback)
  callback(canInstallApp())
  return () => {
    listeners.delete(callback)
  }
}

/**
 * Trigger the installation dialog.
 * Should ONLY be called following an explicit user gesture from an authorized user.
 */
export async function triggerInstallPrompt(): Promise<{ outcome: 'accepted' | 'dismissed' } | null> {
  if (!deferredPrompt) {
    return null
  }
  try {
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      deferredPrompt = null
      notifyListeners()
    }
    return choice
  } catch (err) {
    console.error('Error launching install prompt:', err)
    return null
  }
}
