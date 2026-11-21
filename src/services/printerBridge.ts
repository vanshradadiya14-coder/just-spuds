/**
 * THERMAL PRINTER & CASH DRAWER HARDWARE BRIDGE
 * ----------------------------------------------
 * Supports:
 * 1. ESC/POS raw hardware codes (Cash Drawer Kick, Paper Cut, Barcode, Text formatting).
 * 2. WebUSB / WebSerial direct connectivity to 80mm & 58mm thermal printers (Epson, Star, Munbyn, Xprinter).
 * 3. Browser silent print formatting fallback with 80mm roll media queries.
 * 4. Web Audio cash register till "Cha-Ching" sound synthesizer for immediate physical feedback.
 */

// ESC/POS Standard Hex Commands
export const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]), // ESC @ - Initialize printer
  DRAWER_KICK_PIN2: new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]), // ESC p 0 25 250 (Connector pin 2)
  DRAWER_KICK_PIN5: new Uint8Array([0x1b, 0x70, 0x01, 0x19, 0xfa]), // ESC p 1 25 250 (Connector pin 5)
  PAPER_CUT_FULL: new Uint8Array([0x1d, 0x56, 0x41, 0x00]), // GS V A 0 - Full paper cut
  PAPER_CUT_PARTIAL: new Uint8Array([0x1d, 0x56, 0x42, 0x00]), // GS V B 0 - Partial cut
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),
  TEXT_BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),
  TEXT_BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),
  TEXT_DOUBLE_SIZE: new Uint8Array([0x1d, 0x21, 0x11]), // Double height & width
  TEXT_NORMAL_SIZE: new Uint8Array([0x1d, 0x21, 0x00]),
  FEED_LINES_3: new Uint8Array([0x1b, 0x64, 0x03]),
}

export type PrinterConnectionType = 'browser' | 'webusb' | 'webserial' | 'network'

export interface PrinterDeviceStatus {
  connected: boolean
  name: string
  type: PrinterConnectionType
  lastStatusText: string
}

let activeUSBDevice: any = null
let activeSerialPort: any = null

let printerStatus: PrinterDeviceStatus = {
  connected: false,
  name: 'Windows printer',
  type: 'browser',
  lastStatusText: 'Prints through the browser',
}

const statusListeners = new Set<(status: PrinterDeviceStatus) => void>()

export function getPrinterStatus(): PrinterDeviceStatus {
  return { ...printerStatus }
}

export function subscribePrinterStatus(listener: (status: PrinterDeviceStatus) => void): () => void {
  statusListeners.add(listener)
  listener(printerStatus)
  return () => statusListeners.delete(listener)
}

function notifyStatus() {
  statusListeners.forEach((l) => l({ ...printerStatus }))
}

/**
 * One AudioContext for every till sound. Creating a new context per tap (as
 * this used to) leaks them and browsers cap how many can exist at once, so
 * after a few dozen taps the sounds silently stopped.
 */
let sharedAudioContext: AudioContext | null = null
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedAudioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    sharedAudioContext = new AudioCtx()
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {})
  }
  return sharedAudioContext
}

/** Mirrors TillSettings.touchSounds; tillStore keeps it in sync. */
let touchSoundsEnabled = true
export function setTouchSoundsEnabled(enabled: boolean) {
  touchSoundsEnabled = enabled
}

/**
 * Web Audio Synthesizer: Authentic Cash Register Till Ding / "Cha-Ching"
 * Provides instant audio feedback when cash drawer opens or money is tendered
 */
export function playCashRegisterChime() {
  const ctx = getSharedAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime

    // 1. Crisp bell ding (Metallic high overtone)
    const bell = ctx.createOscillator()
    const bellGain = ctx.createGain()
    bell.type = 'sine'
    bell.frequency.setValueAtTime(2093, now) // C7 crystal bell
    bellGain.gain.setValueAtTime(0.4, now)
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    bell.connect(bellGain)
    bellGain.connect(ctx.destination)
    bell.start(now)
    bell.stop(now + 0.6)

    // 2. Secondary harmonic resonance
    const bell2 = ctx.createOscillator()
    const bell2Gain = ctx.createGain()
    bell2.type = 'triangle'
    bell2.frequency.setValueAtTime(3135.96, now) // G7
    bell2Gain.gain.setValueAtTime(0.2, now)
    bell2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
    bell2.connect(bell2Gain)
    bell2Gain.connect(ctx.destination)
    bell2.start(now)
    bell2.stop(now + 0.45)

    // 3. Subtle mechanical spring click
    const click = ctx.createOscillator()
    const clickGain = ctx.createGain()
    click.type = 'square'
    click.frequency.setValueAtTime(140, now)
    clickGain.gain.setValueAtTime(0.15, now)
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    click.connect(clickGain)
    clickGain.connect(ctx.destination)
    click.start(now)
    click.stop(now + 0.08)
  } catch (err) {
    console.warn('Unable to play cash register chime:', err)
  }
}

/**
 * Tactical POS touch acoustic feedback (Toast & Square standard)
 * Delivers satisfying micro-audio response on screen button taps
 */
export function playPOSTouchTone(type: 'tap' | 'numpad' | 'comp' | 'action' = 'tap') {
  if (!touchSoundsEnabled) return
  const ctx = getSharedAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime

    if (type === 'tap') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1400, now)
      gain.gain.setValueAtTime(0.04, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.025)
    } else if (type === 'numpad') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(880, now)
      gain.gain.setValueAtTime(0.05, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.03)
    } else if (type === 'comp') {
      // Pleasant dual chime
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now + idx * 0.05)
        gain.gain.setValueAtTime(0.08, now + idx * 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.25)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + idx * 0.05)
        osc.stop(now + idx * 0.05 + 0.25)
      })
    } else if (type === 'action') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.06)
      gain.gain.setValueAtTime(0.06, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.06)
    }
  } catch {}
}

/**
 * Direct Cash Drawer Kick
 * Sends electrical pulse down the RJ11 cable connected to the thermal printer
 */
export async function kickCashDrawer(): Promise<{ success: boolean; message: string }> {
  playCashRegisterChime()

  if (isDirectPrinterReady()) {
    try {
      await writeToPrinter(ESC_POS.DRAWER_KICK_PIN2)
      return { success: true, message: 'Cash drawer opened.' }
    } catch (e) {
      console.warn('Drawer kick failed:', e)
    }
  }
  // Windows-printer route: most drivers have "open drawer before printing" in
  // their own settings — the drawer opens with the receipt.
  return { success: true, message: 'Drawer opens with the receipt (printer driver setting).' }
}

/* ----------------------------------------------- direct printer (no dialog) -- */

/**
 * How this device prints. Saved per device (each till has its own printer),
 * never synced.
 *   browser — the Windows / Android printer through the browser's print
 *             (silent when the till is started with --kiosk-printing)
 *   usb     — straight to a USB receipt printer (WebUSB)
 *   serial  — straight to a serial / Bluetooth / virtual-COM receipt printer (Web Serial)
 */
export type PrintMode = 'browser' | 'usb' | 'serial'

export interface PrinterPrefs {
  mode: PrintMode
  /** Characters per line: 48 on most 80 mm printers, 42 on some, 32 on 58 mm. */
  cols: 48 | 42 | 32
  baud: number
  copies: 1 | 2
}

const PREFS_KEY = 'just_spuds_printer_v1'
const DEFAULT_PREFS: PrinterPrefs = { mode: 'browser', cols: 48, baud: 9600, copies: 1 }

export function getPrinterPrefs(): PrinterPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function setPrinterPrefs(patch: Partial<PrinterPrefs>): PrinterPrefs {
  const next = { ...getPrinterPrefs(), ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // private mode: lasts for this visit
  }
  notifyStatus()
  return next
}

/** Paper width in mm for the browser route, from the characters-per-line choice. */
export const paperWidthMm = (cols: number) => (cols <= 32 ? 48 : 72)

let usbOutEndpoint = 1

export function isDirectPrinterReady(): boolean {
  return Boolean((activeUSBDevice && activeUSBDevice.opened) || (activeSerialPort && activeSerialPort.writable))
}

function setStatus(next: Partial<PrinterDeviceStatus>) {
  printerStatus = { ...printerStatus, ...next }
  notifyStatus()
}

/** Opens a USB printer: finds its printer interface and the bulk OUT endpoint instead of assuming interface 0 / endpoint 1. */
async function openUsb(device: any): Promise<void> {
  if (!device.opened) await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)
  const interfaces: any[] = device.configuration?.interfaces || []
  const pick =
    interfaces.find((i) => i.alternate?.interfaceClass === 7) || // 7 = printer class
    interfaces.find((i) => (i.alternate?.endpoints || []).some((e: any) => e.direction === 'out' && e.type === 'bulk'))
  if (!pick) throw new Error('This USB device has no printer output.')
  const out = (pick.alternate.endpoints || []).find((e: any) => e.direction === 'out' && e.type === 'bulk')
  if (!out) throw new Error('This USB device has no printer output.')
  try {
    await device.claimInterface(pick.interfaceNumber)
  } catch (err) {
    console.warn('USB claim failed:', err)
    throw new Error(
      'Windows is using this printer with its own driver, so the browser cannot reach it. Use "Windows printer" with silent printing instead (recommended), or swap the driver to WinUSB with Zadig.',
    )
  }
  usbOutEndpoint = out.endpointNumber
  activeUSBDevice = device
  activeSerialPort = null
  setStatus({ connected: true, type: 'webusb', name: device.productName || 'USB receipt printer', lastStatusText: 'Ready — prints with no dialog' })
}

/** Asks for a USB printer (once — the browser remembers the choice). */
export async function connectUsbPrinter(): Promise<{ ok: boolean; message: string }> {
  const usb = typeof navigator !== 'undefined' ? (navigator as any).usb : undefined
  if (!usb) return { ok: false, message: 'This browser cannot talk to USB printers. Use Chrome or Edge, or the Windows printer.' }
  try {
    const device = await usb.requestDevice({ filters: [] })
    await openUsb(device)
    setPrinterPrefs({ mode: 'usb' })
    return { ok: true, message: `Connected to ${printerStatus.name}.` }
  } catch (err: any) {
    const message = err?.name === 'NotFoundError' ? 'No printer chosen.' : err?.message || 'Could not connect to the printer.'
    setStatus({ connected: false, lastStatusText: message })
    return { ok: false, message }
  }
}

/** Kept for older callers. */
export async function connectWebUSBPrinter(): Promise<boolean> {
  return (await connectUsbPrinter()).ok
}

/** Asks for a serial / Bluetooth / virtual-COM printer. */
export async function connectSerialPrinter(baud = getPrinterPrefs().baud): Promise<{ ok: boolean; message: string }> {
  const serial = typeof navigator !== 'undefined' ? (navigator as any).serial : undefined
  if (!serial) return { ok: false, message: 'This browser cannot talk to serial printers. Use Chrome or Edge.' }
  try {
    const port = await serial.requestPort()
    await openSerial(port, baud)
    setPrinterPrefs({ mode: 'serial', baud })
    return { ok: true, message: 'Connected to the serial printer.' }
  } catch (err: any) {
    const message = err?.name === 'NotFoundError' ? 'No port chosen.' : err?.message || 'Could not open the port.'
    setStatus({ connected: false, lastStatusText: message })
    return { ok: false, message }
  }
}

async function openSerial(port: any, baud: number) {
  if (!port.writable) await port.open({ baudRate: baud })
  activeSerialPort = port
  activeUSBDevice = null
  setStatus({ connected: true, type: 'webserial', name: 'Serial receipt printer', lastStatusText: `Ready at ${baud} baud — prints with no dialog` })
}

/** Back to the Windows printer. */
export async function disconnectDirectPrinter(): Promise<void> {
  try {
    if (activeUSBDevice?.opened) await activeUSBDevice.close()
    if (activeSerialPort?.writable) await activeSerialPort.close()
  } catch {
    // already gone
  }
  activeUSBDevice = null
  activeSerialPort = null
  setPrinterPrefs({ mode: 'browser' })
  setStatus({ connected: false, type: 'browser', name: 'Windows printer', lastStatusText: 'Prints through the browser' })
}

let restoring: Promise<void> | null = null

/**
 * Reconnects the printer this device used last, without asking — the browser
 * remembers the permission. Called when a till screen opens.
 */
export function restoreDirectPrinter(): Promise<void> {
  if (restoring) return restoring
  restoring = (async () => {
    const prefs = getPrinterPrefs()
    try {
      if (prefs.mode === 'usb' && (navigator as any).usb) {
        const usb = (navigator as any).usb
        const [device] = await usb.getDevices()
        if (device) await openUsb(device)
        else setStatus({ connected: false, type: 'webusb', name: 'USB receipt printer', lastStatusText: 'Not found — is it switched on and plugged in?' })
        // Printer switched off and on again, or the cable re-plugged: pick it back up.
        usb.addEventListener?.('connect', (e: any) => void openUsb(e.device).catch(() => {}))
        usb.addEventListener?.('disconnect', (e: any) => {
          if (e.device === activeUSBDevice) {
            activeUSBDevice = null
            setStatus({ connected: false, lastStatusText: 'Printer disconnected' })
          }
        })
      } else if (prefs.mode === 'serial' && (navigator as any).serial) {
        const [port] = await (navigator as any).serial.getPorts()
        if (port) await openSerial(port, prefs.baud)
        else setStatus({ connected: false, type: 'webserial', name: 'Serial receipt printer', lastStatusText: 'Not found — reconnect it in Till settings' })
      } else {
        setStatus({ connected: false, type: 'browser', name: 'Windows printer', lastStatusText: 'Prints through the browser' })
      }
    } catch (err: any) {
      setStatus({ connected: false, lastStatusText: err?.message || 'Printer not available' })
    }
  })().finally(() => {
    restoring = null
  })
  return restoring
}

/** Sends raw bytes to the connected receipt printer. */
export async function writeToPrinter(data: Uint8Array): Promise<void> {
  if (activeUSBDevice && activeUSBDevice.opened) {
    // Small chunks: some printers drop part of a large single transfer.
    for (let i = 0; i < data.length; i += 4096) {
      await activeUSBDevice.transferOut(usbOutEndpoint, data.slice(i, i + 4096))
    }
    return
  }
  if (activeSerialPort && activeSerialPort.writable) {
    const writer = activeSerialPort.writable.getWriter()
    try {
      await writer.write(data)
    } finally {
      writer.releaseLock()
    }
    return
  }
  throw new Error('No receipt printer connected.')
}

