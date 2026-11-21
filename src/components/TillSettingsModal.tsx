import { useEffect, useState } from 'react'
import {
  getTillSettings,
  subscribeTillSettings,
  updateTillSettings,
  type TillSettings,
} from '../services/tillStore'
import {
  connectSerialPrinter,
  connectUsbPrinter,
  disconnectDirectPrinter,
  getPrinterPrefs,
  getPrinterStatus,
  kickCashDrawer,
  setPrinterPrefs,
  subscribePrinterStatus,
  type PrinterDeviceStatus,
  type PrinterPrefs,
} from '../services/printerBridge'
import { printBlocks } from '../services/receiptPrinter'
import type { ReceiptBlock } from '../services/receiptDoc'
import AlertSoundSettingsModal from './staff/AlertSoundSettingsModal'

type Busy = 'usb' | 'serial' | 'drawer' | 'test' | null

const COLS_OPTIONS: { cols: PrinterPrefs['cols']; label: string }[] = [
  { cols: 48, label: '80 mm' },
  { cols: 42, label: '80 mm (42 col)' },
  { cols: 32, label: '58 mm' },
]
const BAUDS = [9600, 19200, 38400, 115200]

function testSlip(prefs: PrinterPrefs): ReceiptBlock[] {
  const ruler = '1234567890'.repeat(5).slice(0, prefs.cols)
  return [
    { t: 'title', text: 'PRINTER TEST' },
    { t: 'center', text: new Date().toLocaleString('en-GB') },
    { t: 'rule' },
    { t: 'text', text: ruler },
    { t: 'row', left: 'Left edge', right: 'right edge' },
    { t: 'row', left: '1 x Jacket potato', right: '4.45', bold: true },
    { t: 'row', left: '+ Cheese', right: '1.00', indent: 2 },
    { t: 'rule', heavy: true },
    { t: 'row', left: 'TOTAL', right: '£5.45', bold: true, big: true },
    { t: 'rule', heavy: true },
    { t: 'inverse', text: 'BOX / ALERT LINE' },
    { t: 'center', text: `Set to ${prefs.cols} characters per line. If the numbers above wrap or are cut off, pick a smaller paper setting.` },
  ]
}

/** Receipt printer: how this till prints, paper size, test print, silent-printing setup. */
function PrinterSetup({
  printer,
  busy,
  setBusy,
  onTestDrawer,
}: {
  printer: PrinterDeviceStatus
  busy: Busy
  setBusy: (b: Busy) => void
  onTestDrawer: () => void
}) {
  const [prefs, setPrefs] = useState<PrinterPrefs>(() => getPrinterPrefs())
  const [message, setMessage] = useState<string | null>(null)
  const [showSilent, setShowSilent] = useState(false)
  const [copied, setCopied] = useState(false)

  // Prefs change in printerBridge (connect / disconnect) — keep the switches in step.
  useEffect(() => setPrefs(getPrinterPrefs()), [printer])

  const update = (patch: Partial<PrinterPrefs>) => setPrefs(setPrinterPrefs(patch))

  const run = async (kind: Busy, fn: () => Promise<{ message: string }>) => {
    setBusy(kind)
    setMessage(null)
    try {
      setMessage((await fn()).message)
    } finally {
      setBusy(null)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pos.justspuds.uk'
  const edgeCmd = `"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app=${origin}`

  const modeBtn = (mode: PrinterPrefs['mode'], label: string, hint: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`rounded-lg border px-2 py-2 text-left transition disabled:opacity-50 ${
        prefs.mode === mode ? 'border-amber-400 bg-amber-400/15' : 'border-white/15 bg-black/40 hover:bg-white/10'
      }`}
    >
      <span className="block text-[11px] font-black text-white">{label}</span>
      <span className="block text-[9px] leading-tight text-white/50">{hint}</span>
    </button>
  )

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-white">🖨️ Receipt printer</span>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${prefs.mode === 'browser' || printer.connected ? 'text-emerald-400' : 'text-rose-300'}`}>
          <span className={`h-2 w-2 rounded-full ${prefs.mode === 'browser' || printer.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          {prefs.mode === 'browser' ? 'Windows printer' : printer.connected ? 'Connected' : 'Not connected'}
        </span>
      </div>
      {prefs.mode !== 'browser' && <p className="text-[10px] text-white/50">{printer.name} — {printer.lastStatusText}</p>}

      <div className="grid grid-cols-3 gap-1.5">
        {modeBtn('browser', 'Windows printer', 'Recommended. Silent with the shortcut below.', () => void disconnectDirectPrinter())}
        {modeBtn('usb', 'USB direct', 'Straight to the printer. Chrome / Edge.', () => void run('usb', connectUsbPrinter))}
        {modeBtn('serial', 'Serial / BT', 'COM port or Bluetooth printer.', () => void run('serial', () => connectSerialPrinter(prefs.baud)))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-white/60">Paper</span>
        {COLS_OPTIONS.map((o) => (
          <button
            key={o.cols}
            type="button"
            onClick={() => update({ cols: o.cols })}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold ${prefs.cols === o.cols ? 'bg-amber-400 text-ink' : 'border border-white/15 bg-black/40 text-white/70 hover:bg-white/10'}`}
          >
            {o.label}
          </button>
        ))}
        {prefs.mode !== 'browser' && <span className="ml-auto text-[10px] font-bold text-white/60">Copies</span>}
        {prefs.mode !== 'browser' && ([1, 2] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => update({ copies: n })}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold ${prefs.copies === n ? 'bg-amber-400 text-ink' : 'border border-white/15 bg-black/40 text-white/70 hover:bg-white/10'}`}
          >
            {n}
          </button>
        ))}
      </div>

      {prefs.mode === 'serial' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-white/60">Speed</span>
          {BAUDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => update({ baud: b })}
              className={`rounded-lg px-2 py-1 text-[10px] font-bold ${prefs.baud === b ? 'bg-amber-400 text-ink' : 'border border-white/15 bg-black/40 text-white/70 hover:bg-white/10'}`}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void run('test', () => printBlocks(testSlip(prefs), { title: 'Test print' }))}
          disabled={busy !== null}
          className="flex-1 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-300 hover:bg-sky-400 hover:text-ink transition disabled:opacity-50"
        >
          {busy === 'test' ? 'Printing…' : 'Test print'}
        </button>
        <button
          type="button"
          onClick={onTestDrawer}
          disabled={busy !== null}
          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold text-white hover:bg-white/20 transition disabled:opacity-50"
        >
          {busy === 'drawer' ? 'Opening…' : 'Test drawer'}
        </button>
      </div>
      {message && <p className="text-[10px] font-bold text-amber-200">{message}</p>}

      {prefs.mode === 'browser' && (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/5 p-2.5">
          <button type="button" onClick={() => setShowSilent((v) => !v)} className="flex w-full items-center justify-between text-left">
            <span className="text-[11px] font-black text-emerald-200">Stop the "choose printer" box (one-time setup)</span>
            <span className="text-white/50">{showSilent ? '▲' : '▼'}</span>
          </button>
          {showSilent && (
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[10px] leading-snug text-white/70">
              <li>
                Windows <b>Settings › Bluetooth &amp; devices › Printers</b>: turn off &quot;Let Windows manage my default printer&quot;, open the
                receipt printer and choose <b>Set as default</b>.
              </li>
              <li>
                In the printer&apos;s <b>Printing preferences</b> pick the 80 mm (or 58 mm) receipt paper and turn on &quot;open cash drawer&quot; if
                it has one.
              </li>
              <li>
                Right-click the desktop › <b>New › Shortcut</b>, paste this, name it &quot;Just Spuds Till&quot;:
                <div className="mt-1 flex items-start gap-1">
                  <code className="min-w-0 flex-1 break-all rounded bg-black/60 p-1.5 font-mono text-[9px] text-amber-200">{edgeCmd}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(edgeCmd).then(() => setCopied(true))
                    }}
                    className="shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] font-bold text-white hover:bg-white/20"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </li>
              <li>Close every Edge window, then open the till from that shortcut. Receipts now print straight to the default printer with no box.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

interface TillSettingsModalProps {
  onClose: () => void
  /** Who is changing the settings — goes on the audit log. */
  actor: string
}

type ToggleKey = Exclude<keyof TillSettings, 'defaultFloatPence' | 'autoLockMinutes' | 'tillName'>

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'autoPrintTillReceipt', label: 'Print receipt after every sale', hint: 'Prints as soon as the sale is paid — no preview. "Order" prints the kitchen ticket.' },
  { key: 'autoPrintOnline', label: 'Print ticket when an online order arrives', hint: 'Prints the kitchen ticket for each new web order.' },
  { key: 'kickDrawerOnCash', label: 'Open drawer on cash sales', hint: 'USB / serial printers: opens the drawer on cash. Windows printer: set "open drawer" in its printing preferences.' },
  { key: 'soundAlerts', label: 'Online order siren', hint: 'Repeating chime until a new web order is accepted or muted.' },
  { key: 'touchSounds', label: 'Button tap sounds', hint: 'Short click on every till button.' },
  { key: 'blindShiftClose', label: 'Blind cash count at close', hint: 'Hides the expected cash figure until the drawer has been counted.' },
  { key: 'tipPrompt', label: 'Ask for a tip on card payments', hint: 'Shows None / 50p / £1 / £2 before the card reader is armed.' },
  { key: 'lockAfterSale', label: 'Lock after every sale', hint: 'Each cashier enters their PIN for their own sale — clean per-person takings.' },
]

const LOCK_OPTIONS = [0, 1, 2, 5, 10, 15]

export default function TillSettingsModal({ onClose, actor }: TillSettingsModalProps) {
  const [settings, setSettings] = useState<TillSettings>(() => getTillSettings())
  const [printer, setPrinter] = useState<PrinterDeviceStatus>(() => getPrinterStatus())
  const [floatInput, setFloatInput] = useState(() => (getTillSettings().defaultFloatPence / 100).toFixed(2))
  const [tillNameInput, setTillNameInput] = useState(() => getTillSettings().tillName)
  const [busy, setBusy] = useState<Busy>(null)
  const [isSoundOpen, setIsSoundOpen] = useState(false)

  useEffect(() => {
    const unsubSettings = subscribeTillSettings(setSettings)
    const unsubPrinter = subscribePrinterStatus(setPrinter)
    return () => {
      unsubSettings()
      unsubPrinter()
    }
  }, [])

  const toggle = (key: ToggleKey) => updateTillSettings({ [key]: !settings[key] }, actor)

  const commitFloat = () => {
    const parsed = Math.round((parseFloat(floatInput) || 0) * 100)
    const clamped = Math.max(0, Math.min(parsed, 100000))
    setFloatInput((clamped / 100).toFixed(2))
    if (clamped !== settings.defaultFloatPence) updateTillSettings({ defaultFloatPence: clamped }, actor)
  }

  const commitTillName = () => {
    const clean = tillNameInput.replace(/\s+/g, ' ').trim().slice(0, 24) || 'Till 1'
    setTillNameInput(clean)
    if (clean !== settings.tillName) updateTillSettings({ tillName: clean }, actor)
  }

  const handleTestDrawer = async () => {
    setBusy('drawer')
    try {
      await kickCashDrawer()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center [align-items:safe_center] justify-center overflow-y-auto p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">⚙️ Till Settings</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close settings">
            ✕
          </button>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="min-w-0">
            <span className="block text-xs font-bold text-white">Till name</span>
            <span className="block text-[10px] text-white/50 mt-0.5">Shown on the till, receipts and the end-of-day report.</span>
          </span>
          <input
            type="text"
            maxLength={24}
            value={tillNameInput}
            onChange={(e) => setTillNameInput(e.target.value)}
            onBlur={commitTillName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-28 shrink-0 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-right text-sm text-white focus:border-amber-400 focus:outline-none"
          />
        </label>

        <ul className="space-y-1.5">
          {TOGGLES.map(({ key, label, hint }) => {
            const on = settings[key]
            return (
              <li key={key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggle(key)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 transition"
                >
                  <span>
                    <span className="block text-xs font-bold text-white">{label}</span>
                    <span className="block text-[10px] text-white/50 mt-0.5">{hint}</span>
                  </span>
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-amber-400' : 'bg-white/20'}`}
                    aria-hidden="true"
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={() => setIsSoundOpen(true)}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-left hover:bg-amber-500/20 transition"
        >
          <span>
            <span className="block text-xs font-bold text-white">🔔 New order alert sound…</span>
            <span className="block text-[10px] text-white/50 mt-0.5">Choose or upload the sound, set the volume, test it.</span>
          </span>
          <span className="text-white/60">→</span>
        </button>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <span className="block text-xs font-bold text-white">Lock the till when idle</span>
          <span className="block text-[10px] text-white/50">Returns to the PIN screen; the shift and any open ticket are kept for the next person.</span>
          <div className="flex flex-wrap gap-1.5">
            {LOCK_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateTillSettings({ autoLockMinutes: m }, actor)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  settings.autoLockMinutes === m ? 'bg-amber-400 text-ink' : 'border border-white/15 bg-black/40 text-white/70 hover:bg-white/10'
                }`}
              >
                {m === 0 ? 'Never' : `${m} min`}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <span>
            <span className="block text-xs font-bold text-white">Default opening float</span>
            <span className="block text-[10px] text-white/50 mt-0.5">Pre-filled when a new shift is opened.</span>
          </span>
          <span className="flex items-center gap-1 font-mono text-sm">
            <span className="text-white/60">£</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={5}
              value={floatInput}
              onChange={(e) => setFloatInput(e.target.value)}
              onBlur={commitFloat}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-24 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-right text-white focus:border-amber-400 focus:outline-none"
            />
          </span>
        </label>

        <PrinterSetup printer={printer} busy={busy} setBusy={setBusy} onTestDrawer={handleTestDrawer} />

        <p className="text-[10px] text-white/40 text-center">Changes apply to every till tab immediately and are written to the audit log.</p>
      </div>
      {isSoundOpen && <AlertSoundSettingsModal onClose={() => setIsSoundOpen(false)} actor={actor} />}
    </div>
  )
}
