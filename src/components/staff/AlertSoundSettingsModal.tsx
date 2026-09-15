import { useEffect, useRef, useState } from 'react'
import {
  clearCustomAlertSound,
  DEFAULT_SOUND_URLS,
  getAlertSoundConfig,
  previewAlertSound,
  setAlertSoundConfig,
  setCustomAlertSoundFile,
  subscribeAlertSoundConfig,
  type AlertSoundConfig,
  type AlertSoundSource,
} from '../../services/alertSoundBus'
import { getTillSettings, subscribeTillSettings, updateTillSettings } from '../../services/tillStore'
import { cx } from '../../utils/format'

interface AlertSoundSettingsModalProps {
  onClose: () => void
  /** Who is changing the settings — goes on the audit log. */
  actor: string
}

const SOURCES: { key: AlertSoundSource; label: string; hint: string }[] = [
  { key: 'default', label: 'Store sound file', hint: 'Plays /sounds/new-order.mp3 from the website. Falls back to the siren if the file is missing.' },
  { key: 'custom', label: 'Custom upload (this device)', hint: 'Pick any MP3 / WAV / OGG under 2 MB. Saved in this browser only.' },
  { key: 'synth', label: 'Built-in siren', hint: 'The two-tone chime — no file needed.' },
]

/**
 * Lets a manager choose which sound rings for new online orders, how loud,
 * and try it. Shared by the KDS and the till settings screen.
 */
export default function AlertSoundSettingsModal({ onClose, actor }: AlertSoundSettingsModalProps) {
  const [config, setConfig] = useState<AlertSoundConfig>(() => getAlertSoundConfig())
  const [enabled, setEnabled] = useState(() => getTillSettings().soundAlerts)
  const [error, setError] = useState<string | null>(null)
  const [storeFile, setStoreFile] = useState<'checking' | 'found' | 'missing'>('checking')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubConfig = subscribeAlertSoundConfig(setConfig)
    const unsubTill = subscribeTillSettings((s) => setEnabled(s.soundAlerts))
    return () => {
      unsubConfig()
      unsubTill()
    }
  }, [])

  // Is there really a file at /sounds/new-order.*? The SPA fallback answers
  // 200 with HTML for anything, so trust the content type, not the status.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const url of DEFAULT_SOUND_URLS) {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
          const type = res.headers.get('content-type') || ''
          if (res.ok && type.startsWith('audio/')) {
            if (!cancelled) setStoreFile('found')
            return
          }
        } catch {
          // try the next one
        }
      }
      if (!cancelled) setStoreFile('missing')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      await setCustomAlertSoundFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that file.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">🔔 New order alert sound</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close sound settings">
            ✕
          </button>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => updateTillSettings({ soundAlerts: !enabled }, actor)}
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 transition"
        >
          <span>
            <span className="block text-xs font-bold text-white">Sound the alarm for new online orders</span>
            <span className="block text-[10px] text-white/50 mt-0.5">Repeats until the order is accepted, declined or silenced. Applies to KDS, till and admin.</span>
          </span>
          <span className={cx('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', enabled ? 'bg-amber-400' : 'bg-white/20')} aria-hidden="true">
            <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5')} />
          </span>
        </button>

        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/50">Which sound</p>
          {SOURCES.map(({ key, label, hint }) => {
            const selected = config.source === key
            const disabled = key === 'custom' && !config.customDataUrl
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (disabled) fileInput.current?.click()
                  else setAlertSoundConfig({ source: key })
                }}
                className={cx(
                  'w-full rounded-xl border p-3 text-left transition',
                  selected ? 'border-amber-400 bg-amber-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">
                    {label}
                    {key === 'default' && storeFile === 'missing' && <span className="ml-2 text-[10px] font-bold text-amber-300">(no file yet — siren will play)</span>}
                    {key === 'default' && storeFile === 'found' && <span className="ml-2 text-[10px] font-bold text-emerald-300">✓ file found</span>}
                    {key === 'custom' && config.customName && <span className="ml-2 text-[10px] font-normal text-white/60">{config.customName}</span>}
                  </span>
                  <span className={cx('h-3 w-3 rounded-full border-2', selected ? 'border-amber-400 bg-amber-400' : 'border-white/30')} />
                </span>
                <span className="block text-[10px] text-white/50 mt-0.5">{hint}</span>
              </button>
            )
          })}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex-1 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-300 hover:bg-sky-400 hover:text-ink transition"
            >
              📂 {config.customDataUrl ? 'Replace custom sound' : 'Upload a sound file'}
            </button>
            {config.customDataUrl && (
              <button
                type="button"
                onClick={() => clearCustomAlertSound()}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold text-white/70 hover:bg-white/20"
              >
                Remove
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              className="hidden"
              aria-label="Upload alert sound"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
          {error && <p className="rounded-lg border border-red-500/40 bg-red-950/40 p-2 text-[11px] text-red-200">{error}</p>}
        </div>

        <label className="block rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="flex items-center justify-between text-xs font-bold text-white">
            <span>🔊 Volume</span>
            <span className="font-mono text-white/60">{Math.round(config.volume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(config.volume * 100)}
            onChange={(e) => setAlertSoundConfig({ volume: Number(e.target.value) / 100 })}
            className="mt-2 w-full accent-amber-400"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => previewAlertSound()}
            className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300"
          >
            ▶ Test sound
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20">
            Done
          </button>
        </div>

        <p className="text-[10px] text-white/40 text-center">
          To change the store sound for every device, replace <code className="text-white/60">public/sounds/new-order.mp3</code> on the website.
        </p>
      </div>
    </div>
  )
}
