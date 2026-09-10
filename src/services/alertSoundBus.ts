/**
 * INCOMING ONLINE ORDER AUDIO SIREN & ALERT BUS
 * --------------------------------------------
 * Plays an urgent, repeating dual-tone chime (like Deliveroo / Uber Eats)
 * when a new online order arrives, until front-of-house staff acknowledges or accepts it.
 */

export interface OnlineOrderAlert {
  orderId: string
  shortId: string
  customerName: string
  total: number
  itemsSummary: string
  timestamp: string
}

let activeAlerts: OnlineOrderAlert[] = []
let sirenIntervalId: any = null
let audioContext: AudioContext | null = null

const alertListeners = new Set<(alerts: OnlineOrderAlert[]) => void>()

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      audioContext = new AudioCtx()
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  return audioContext
}

// Automatically unlock Web Audio API on first user interaction anywhere on the page
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        window.removeEventListener('click', unlockAudio)
        window.removeEventListener('touchstart', unlockAudio)
        window.removeEventListener('keydown', unlockAudio)
      })
    }
  }
  window.addEventListener('click', unlockAudio)
  window.addEventListener('touchstart', unlockAudio)
  window.addEventListener('keydown', unlockAudio)
}

/**
 * Synthesizes a loud, crisp, urgent dual-tone food order notification bell
 */
export function playUrgentOrderSirenSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime

    // Two-tone repeating chime sequence (High -> Mid -> High)
    const tones = [
      { freq: 987.77, time: 0.0, dur: 0.18 }, // B5
      { freq: 1318.51, time: 0.18, dur: 0.22 }, // E6
      { freq: 987.77, time: 0.45, dur: 0.18 }, // B5
      { freq: 1318.51, time: 0.63, dur: 0.35 }, // E6 sustained
    ]

    tones.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + time)

      gain.gain.setValueAtTime(0.35, now + time)
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + time)
      osc.stop(now + time + dur)
    })
  } catch (e) {
    console.warn('Could not play order siren sound:', e)
  }
}

function startSirenLoop() {
  if (sirenIntervalId) return
  playUrgentOrderSirenSound()
  sirenIntervalId = setInterval(() => {
    if (activeAlerts.length > 0) {
      playUrgentOrderSirenSound()
    } else {
      stopSirenLoop()
    }
  }, 3200)
}

function stopSirenLoop() {
  if (sirenIntervalId) {
    clearInterval(sirenIntervalId)
    sirenIntervalId = null
  }
}

export function notifyNewOnlineOrder(alert: OnlineOrderAlert) {
  // Avoid duplicate notifications for the same order
  if (activeAlerts.some((a) => a.orderId === alert.orderId)) return

  activeAlerts = [alert, ...activeAlerts]
  startSirenLoop()
  alertListeners.forEach((l) => l([...activeAlerts]))
}

export function dismissOrderAlert(orderId: string) {
  activeAlerts = activeAlerts.filter((a) => a.orderId !== orderId)
  if (activeAlerts.length === 0) {
    stopSirenLoop()
  }
  alertListeners.forEach((l) => l([...activeAlerts]))
}

export function dismissAllOrderAlerts() {
  activeAlerts = []
  stopSirenLoop()
  alertListeners.forEach((l) => l([]))
}

export function getActiveOrderAlerts(): OnlineOrderAlert[] {
  return [...activeAlerts]
}

export function subscribeOrderAlerts(listener: (alerts: OnlineOrderAlert[]) => void): () => void {
  alertListeners.add(listener)
  listener([...activeAlerts])
  return () => alertListeners.delete(listener)
}
