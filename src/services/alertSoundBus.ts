/**
 * INCOMING ONLINE ORDER ALARM & ALERT BUS
 * ---------------------------------------
 * When a customer places a web order every staff screen (KDS, till, admin)
 * raises an alert and the alarm sounds *continuously* until someone accepts,
 * declines or silences the order — the same behaviour as a Deliveroo / Uber
 * Eats tablet or a Subway KDS.
 *
 * Sound source, in priority order:
 *   1. a custom file the manager uploaded on this device (stored as a data URL)
 *   2. the store's own file at /sounds/new-order.mp3 (drop one in public/sounds)
 *   3. the built-in synthesised siren (no file needed)
 * A file that fails to load or play falls through to the next option.
 *
 * Acknowledged orders are remembered in localStorage so a page reload or an
 * order update does not re-raise an alert that a person already silenced.
 * When several tabs are open on one machine only one of them plays the sound
 * (Web Locks), so the KDS + till on the same PC don't double up.
 */

export interface OnlineOrderAlert {
  orderId: string
  shortId: string
  customerName: string
  total: number
  itemsSummary: string
  timestamp: string
  fulfilment?: 'delivery' | 'pickup'
  isScheduled?: boolean
}

export type AlertSoundSource = 'default' | 'custom' | 'synth'

export interface AlertSoundConfig {
  source: AlertSoundSource
  /** 0–1 */
  volume: number
  /** Silence between repeats of a sound file (ms). */
  gapMs: number
  customName?: string
  customDataUrl?: string
}

export interface AlertSoundState {
  /** True while the alarm loop is running in this tab. */
  sounding: boolean
  /** The browser refused to play because nobody has interacted with the page yet. */
  blocked: boolean
  /** Another tab on this machine is playing the alarm for us. */
  deferredToOtherTab: boolean
  /** Which engine actually produced the last sound. */
  engine: 'file' | 'synth' | null
  enabled: boolean
}

export const DEFAULT_SOUND_URLS = ['/sounds/new-order.mp3', '/sounds/new-order.wav', '/sounds/new-order.ogg']
export const MAX_CUSTOM_SOUND_BYTES = 2 * 1024 * 1024

const CONFIG_KEY = 'just_spuds_alert_sound_v1'
const ACKED_KEY = 'just_spuds_alert_acked_v1'
const ACKED_LIMIT = 300
const LOCK_NAME = 'just_spuds_alert_audio'
const SYNTH_REPEAT_MS = 3200

const DEFAULT_CONFIG: AlertSoundConfig = { source: 'default', volume: 1, gapMs: 700 }

let activeAlerts: OnlineOrderAlert[] = []
let audioContext: AudioContext | null = null
let config: AlertSoundConfig = loadConfig()
let ackedIds: Set<string> = loadAcked()

const alertListeners = new Set<(alerts: OnlineOrderAlert[]) => void>()
const configListeners = new Set<(cfg: AlertSoundConfig) => void>()
const stateListeners = new Set<(state: AlertSoundState) => void>()

let channel: BroadcastChannel | null = null
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel('just_spuds_alert_bus')
    channel.addEventListener('message', (event: MessageEvent) => {
      const data = event.data
      if (data?.type === 'SOUND_CONFIG') {
        config = loadConfig()
        configListeners.forEach((l) => l(config))
        if (alarmRunning) restartAlarm()
      } else if (data?.type === 'ALERT_ACKED' && typeof data.orderId === 'string') {
        ackedIds.add(data.orderId)
        removeAlert(data.orderId)
      }
    })
  }
} catch {
  // Fallback gracefully
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadConfig(): AlertSoundConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<AlertSoundConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      volume: clamp(Number(parsed.volume ?? 1), 0, 1),
      gapMs: clamp(Number(parsed.gapMs ?? DEFAULT_CONFIG.gapMs), 0, 10000),
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

function loadAcked(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(ACKED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persistAcked() {
  if (typeof window === 'undefined') return
  try {
    const list = [...ackedIds].slice(-ACKED_LIMIT)
    ackedIds = new Set(list)
    localStorage.setItem(ACKED_KEY, JSON.stringify(list))
  } catch {
    // quota — the in-memory set still protects this session
  }
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo)

export function getAlertSoundConfig(): AlertSoundConfig {
  return config
}

export function setAlertSoundConfig(patch: Partial<AlertSoundConfig>): AlertSoundConfig {
  config = { ...config, ...patch }
  if (config.source === 'custom' && !config.customDataUrl) config.source = 'default'
  config.volume = clamp(config.volume, 0, 1)
  config.gapMs = clamp(config.gapMs, 0, 10000)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    } catch (err) {
      console.warn('Alert sound could not be saved (storage full?)', err)
    }
  }
  // A settings change is a good moment to retry files that failed earlier.
  defaultFileUnavailable = false
  customFileBroken = false
  defaultUrlIndex = 0
  configListeners.forEach((l) => l(config))
  channel?.postMessage({ type: 'SOUND_CONFIG' })
  if (alarmRunning) restartAlarm()
  return config
}

export function subscribeAlertSoundConfig(listener: (cfg: AlertSoundConfig) => void): () => void {
  configListeners.add(listener)
  listener(config)
  return () => configListeners.delete(listener)
}

/** Reads an uploaded audio file into the config as a data URL. */
export function setCustomAlertSoundFile(file: File): Promise<AlertSoundConfig> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('audio/')) {
      reject(new Error('Please choose an audio file (MP3, WAV, OGG or M4A).'))
      return
    }
    if (file.size > MAX_CUSTOM_SOUND_BYTES) {
      reject(new Error('That file is too big — keep the alert sound under 2 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      resolve(setAlertSoundConfig({ source: 'custom', customName: file.name, customDataUrl: String(reader.result) }))
    }
    reader.readAsDataURL(file)
  })
}

export function clearCustomAlertSound(): AlertSoundConfig {
  return setAlertSoundConfig({ source: 'default', customName: undefined, customDataUrl: undefined })
}

// ---------------------------------------------------------------------------
// Web Audio (synth fallback + unlock)
// ---------------------------------------------------------------------------

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

// Browsers only allow sound after a user gesture. The first tap anywhere on the
// page unlocks Web Audio and retries an alarm the browser refused to start.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const unlockAudio = () => {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {})
    }
    if (state.blocked && alarmRunning) {
      state.blocked = false
      playCycle()
    }
  }
  window.addEventListener('click', unlockAudio)
  window.addEventListener('touchstart', unlockAudio)
  window.addEventListener('keydown', unlockAudio)
}

/**
 * Synthesizes a loud, crisp, urgent dual-tone food order notification bell
 */
export function playUrgentOrderSirenSound(volume = config.volume) {
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

      gain.gain.setValueAtTime(0.35 * volume, now + time)
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

// ---------------------------------------------------------------------------
// Alarm engine
// ---------------------------------------------------------------------------

const state: AlertSoundState = { sounding: false, blocked: false, deferredToOtherTab: false, engine: null, enabled: true }

let alarmRunning = false
let audioEl: HTMLAudioElement | null = null
let audioElUrl: string | null = null
let cycleTimer: ReturnType<typeof setTimeout> | null = null
let lockRetryTimer: ReturnType<typeof setTimeout> | null = null
let releaseLock: (() => void) | null = null
let holdingLock = false
let defaultFileUnavailable = false
let customFileBroken = false
let defaultUrlIndex = 0
let cycleToken = 0

function emitState() {
  const snapshot = { ...state }
  stateListeners.forEach((l) => l(snapshot))
}

export function getAlertSoundState(): AlertSoundState {
  return { ...state }
}

export function subscribeAlertSoundState(listener: (s: AlertSoundState) => void): () => void {
  stateListeners.add(listener)
  listener({ ...state })
  return () => stateListeners.delete(listener)
}

/** Mirrors TillSettings.soundAlerts; tillStore keeps it in sync. */
export function setAlertSoundsEnabled(enabled: boolean) {
  state.enabled = enabled
  if (!enabled) stopAlarm()
  else if (activeAlerts.length > 0) startAlarm()
  emitState()
}

export function isAlertSoundEnabled(): boolean {
  return state.enabled
}

function resolveSoundUrl(): string | null {
  if (config.source === 'synth') return null
  if (config.source === 'custom' && config.customDataUrl && !customFileBroken) return config.customDataUrl
  if (defaultFileUnavailable) return null
  return DEFAULT_SOUND_URLS[defaultUrlIndex] ?? null
}

function getAudioElement(url: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (audioEl && audioElUrl === url) return audioEl
  if (audioEl) {
    audioEl.pause()
    audioEl.onended = null
    audioEl.onerror = null
  }
  audioEl = new Audio(url)
  audioEl.preload = 'auto'
  audioElUrl = url
  return audioEl
}

function clearCycleTimer() {
  if (cycleTimer) {
    clearTimeout(cycleTimer)
    cycleTimer = null
  }
}

/** Plays one repetition of the configured sound, then schedules the next while the alarm is running. */
function playCycle() {
  if (!alarmRunning) return
  clearCycleTimer()
  const token = ++cycleToken
  const url = resolveSoundUrl()

  if (url) {
    const el = getAudioElement(url)
    if (el) {
      el.volume = config.volume
      el.loop = false
      el.currentTime = 0
      el.onended = () => {
        if (!alarmRunning || token !== cycleToken) return
        cycleTimer = setTimeout(playCycle, config.gapMs)
      }
      el.onerror = () => {
        if (token !== cycleToken) return
        fileFailed(url)
      }
      const attempt = el.play()
      if (attempt && typeof attempt.then === 'function') {
        attempt
          .then(() => {
            if (token !== cycleToken) return
            state.sounding = true
            state.blocked = false
            state.engine = 'file'
            emitState()
          })
          .catch((err: unknown) => {
            if (token !== cycleToken) return
            const name = (err as { name?: string })?.name
            if (name === 'NotAllowedError') {
              // Autoplay policy — wait for the next tap, the unlock handler retries.
              state.blocked = true
              state.sounding = false
              emitState()
            } else {
              fileFailed(url)
            }
          })
      } else {
        state.sounding = true
        state.engine = 'file'
        emitState()
      }
      return
    }
  }

  // Synth siren: fire now and repeat.
  playUrgentOrderSirenSound()
  state.sounding = true
  state.engine = 'synth'
  emitState()
  cycleTimer = setTimeout(playCycle, SYNTH_REPEAT_MS)
}

function fileFailed(url: string) {
  if (config.source === 'custom' && url === config.customDataUrl) {
    console.warn('Custom alert sound could not be played — falling back to the store sound / built-in siren.')
    customFileBroken = true
  } else if (defaultUrlIndex < DEFAULT_SOUND_URLS.length - 1) {
    defaultUrlIndex += 1
  } else {
    defaultFileUnavailable = true
  }
  if (alarmRunning) playCycle()
}

function acquirePlaybackLock(): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  if (!locks || typeof locks.request !== 'function') return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          settled = true
          resolve(false)
          return Promise.resolve()
        }
        holdingLock = true
        settled = true
        resolve(true)
        return new Promise<void>((release) => {
          releaseLock = release
        })
      })
      .catch(() => {
        if (!settled) resolve(true) // lock API misbehaving — just play
      })
  })
}

function dropPlaybackLock() {
  if (releaseLock) {
    releaseLock()
    releaseLock = null
  }
  holdingLock = false
}

function startAlarm() {
  if (alarmRunning || !state.enabled || activeAlerts.length === 0) return
  alarmRunning = true
  state.deferredToOtherTab = false
  acquirePlaybackLock().then((granted) => {
    if (!alarmRunning) {
      dropPlaybackLock()
      return
    }
    if (granted) {
      playCycle()
    } else {
      // Someone else on this machine is sounding it; keep checking in case that tab closes.
      state.deferredToOtherTab = true
      emitState()
      lockRetryTimer = setTimeout(() => {
        lockRetryTimer = null
        if (!alarmRunning) return
        alarmRunning = false
        startAlarm()
      }, 2500)
    }
  })
}

function stopAlarm() {
  alarmRunning = false
  cycleToken += 1
  clearCycleTimer()
  if (lockRetryTimer) {
    clearTimeout(lockRetryTimer)
    lockRetryTimer = null
  }
  if (audioEl) {
    audioEl.onended = null
    audioEl.pause()
    try {
      audioEl.currentTime = 0
    } catch {
      // not seekable yet
    }
  }
  dropPlaybackLock()
  state.sounding = false
  state.blocked = false
  state.deferredToOtherTab = false
  emitState()
}

function restartAlarm() {
  const wasHolding = holdingLock
  stopAlarm()
  if (activeAlerts.length > 0 && state.enabled) {
    if (wasHolding) {
      alarmRunning = true
      acquirePlaybackLock().then((granted) => {
        if (!alarmRunning) return
        if (granted) playCycle()
        else {
          alarmRunning = false
          startAlarm()
        }
      })
    } else {
      startAlarm()
    }
  }
}

/** One repetition of the configured sound — for the settings screen "Test" button. */
export function previewAlertSound(): void {
  const url = resolveSoundUrl()
  if (url && typeof Audio !== 'undefined') {
    const el = new Audio(url)
    el.volume = config.volume
    el.onerror = () => playUrgentOrderSirenSound()
    const attempt = el.play()
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => playUrgentOrderSirenSound())
    return
  }
  playUrgentOrderSirenSound()
}

// ---------------------------------------------------------------------------
// Alert queue
// ---------------------------------------------------------------------------

function emitAlerts() {
  const snapshot = [...activeAlerts]
  alertListeners.forEach((l) => l(snapshot))
}

function removeAlert(orderId: string) {
  if (!activeAlerts.some((a) => a.orderId === orderId)) return
  activeAlerts = activeAlerts.filter((a) => a.orderId !== orderId)
  if (activeAlerts.length === 0) stopAlarm()
  emitAlerts()
}

export function getActiveAlerts(): OnlineOrderAlert[] {
  return [...activeAlerts]
}

export function isOrderAlertAcknowledged(orderId: string): boolean {
  return ackedIds.has(orderId)
}

export function notifyNewOnlineOrder(alert: OnlineOrderAlert) {
  // Avoid duplicate notifications for the same order, and don't re-raise one
  // that a person has already dealt with.
  if (ackedIds.has(alert.orderId)) return
  if (activeAlerts.some((a) => a.orderId === alert.orderId)) return

  activeAlerts = [alert, ...activeAlerts]
  startAlarm()
  emitAlerts()
}

/**
 * Silences an alert for good: accepted, declined or deliberately muted.
 * Every tab on this machine drops it too.
 */
export function dismissOrderAlert(orderId: string) {
  ackedIds.add(orderId)
  persistAcked()
  channel?.postMessage({ type: 'ALERT_ACKED', orderId })
  if (activeAlerts.some((a) => a.orderId === orderId)) {
    removeAlert(orderId)
  } else {
    emitAlerts()
  }
}

export function dismissAllOrderAlerts() {
  activeAlerts.map((a) => a.orderId).forEach(dismissOrderAlert)
}

export function subscribeOrderAlerts(listener: (alerts: OnlineOrderAlert[]) => void): () => void {
  alertListeners.add(listener)
  listener([...activeAlerts])
  return () => alertListeners.delete(listener)
}

/** Test hook — wipes the acknowledged list so an order can alert again. */
export function __resetAlertAcknowledgements() {
  ackedIds = new Set()
  persistAcked()
}
