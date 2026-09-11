import { useEffect, useState } from 'react'
import {
  getTillSettings,
  subscribeTillSettings,
  updateTillSettings,
  type TillSettings,
} from '../services/tillStore'
import {
  connectWebUSBPrinter,
  getPrinterStatus,
  kickCashDrawer,
  subscribePrinterStatus,
  type PrinterDeviceStatus,
} from '../services/printerBridge'

interface TillSettingsModalProps {
  onClose: () => void
  /** Who is changing the settings — goes on the audit log. */
  actor: string
}

type ToggleKey = Exclude<keyof TillSettings, 'defaultFloatPence'>

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'autoPrintTillReceipt', label: 'Receipt after every till sale', hint: 'Opens the thermal receipt as soon as a sale is tendered.' },
  { key: 'autoPrintOnline', label: 'Receipt when an online order arrives', hint: 'Pops the kitchen ticket for a new web order without touching the queue.' },
  { key: 'kickDrawerOnCash', label: 'Open drawer on cash sales', hint: 'Sends the drawer-kick pulse through the printer on every cash tender.' },
  { key: 'soundAlerts', label: 'Online order siren', hint: 'Repeating chime until a new web order is accepted or muted.' },
  { key: 'touchSounds', label: 'Button tap sounds', hint: 'Short click on every till button.' },
  { key: 'blindShiftClose', label: 'Blind cash count at close', hint: 'Hides the expected cash figure until the drawer has been counted.' },
]

export default function TillSettingsModal({ onClose, actor }: TillSettingsModalProps) {
  const [settings, setSettings] = useState<TillSettings>(() => getTillSettings())
  const [printer, setPrinter] = useState<PrinterDeviceStatus>(() => getPrinterStatus())
  const [floatInput, setFloatInput] = useState(() => (getTillSettings().defaultFloatPence / 100).toFixed(2))
  const [busy, setBusy] = useState<'usb' | 'drawer' | null>(null)

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

  const handleConnectUSB = async () => {
    setBusy('usb')
    try {
      await connectWebUSBPrinter()
    } finally {
      setBusy(null)
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">⚙️ Till Settings</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close settings">
            ✕
          </button>
        </div>

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

        <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">🖨️ Receipt printer</span>
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${printer.connected ? 'text-emerald-400' : 'text-white/50'}`}>
              <span className={`h-2 w-2 rounded-full ${printer.connected ? 'bg-emerald-400' : 'bg-white/30'}`} />
              {printer.connected ? 'Connected' : 'Browser print'}
            </span>
          </div>
          <p className="text-[10px] text-white/50">
            {printer.name}
            {printer.lastStatusText ? ` — ${printer.lastStatusText}` : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConnectUSB}
              disabled={busy !== null}
              className="flex-1 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-300 hover:bg-sky-400 hover:text-ink transition disabled:opacity-50"
            >
              {busy === 'usb' ? 'Connecting…' : 'Connect USB printer'}
            </button>
            <button
              type="button"
              onClick={handleTestDrawer}
              disabled={busy !== null}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold text-white hover:bg-white/20 transition disabled:opacity-50"
            >
              {busy === 'drawer' ? 'Kicking…' : 'Test drawer kick'}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-white/40 text-center">Changes apply to every till tab immediately and are written to the audit log.</p>
      </div>
    </div>
  )
}
