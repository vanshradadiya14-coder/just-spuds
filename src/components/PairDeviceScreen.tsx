import { useState } from 'react'
import { markStaffDevice, syncNow } from '../services/cloudSync'
import { pairThisDevice } from '../services/staffAuth'
import { enrollThisDevice, getLocalDeviceId, getLocalDeviceName, isTerminalEnrolled, setLocalDeviceName, type StationRole } from '../services/terminalLockStore'
import { playPOSTouchTone } from '../services/printerBridge'

type DeviceUse = StationRole | 'personal'

const USES: { value: DeviceUse; label: string }[] = [
  { value: 'master_till', label: '🧾 Main counter till (cash drawer)' },
  { value: 'secondary_till', label: '🖥️ Second till / order screen' },
  { value: 'kds_display', label: '👨‍🍳 Kitchen screen' },
  { value: 'personal', label: '📱 Manager or driver phone / laptop' },
]

/**
 * Shown instead of the PIN pad on a device the shop hasn't paired yet. A
 * manager makes a one-time code in Admin › Staff Accounts (the very
 * first one comes from the Supabase SQL editor); typing it here gives this
 * device its own secret token, and only then can PINs be tried on it.
 */
export default function PairDeviceScreen({ portal, onDone }: { portal: 'pos' | 'admin' | 'driver'; onDone: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => getLocalDeviceName())
  const [use, setUse] = useState<DeviceUse>(() => (portal === 'pos' && !isTerminalEnrolled() ? 'master_till' : 'personal'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (clean.length !== 8) {
      setError('The pairing code has 8 letters and numbers, like K7QM-2XPA.')
      return
    }
    setBusy(true)
    try {
      const deviceName = name.trim() || getLocalDeviceName()
      const res = await pairThisDevice(clean, getLocalDeviceId(), deviceName)
      if (!res.ok) {
        playPOSTouchTone('numpad')
        setError(res.message)
        return
      }
      playPOSTouchTone('action')
      setLocalDeviceName(deviceName)
      // A paired device is a shop device: it fetches the private documents
      // (the till list among them) before it adds itself to that list.
      markStaffDevice()
      await syncNow().catch(() => false)
      if (use !== 'personal' && !isTerminalEnrolled()) {
        const enrolled = await enrollThisDevice(`${res.device.pairedBy || 'Manager'} (pairing code)`, deviceName, use)
        // Paired either way; a manager can finish enrolling it from the till screen.
        if (!enrolled.ok) console.warn('[pairing]', enrolled.message)
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-slate-900/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-3.5 font-body text-slate-100">
      <div className="text-center">
        <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-lg ring-2 ring-amber-400/50">🔗</div>
        <h1 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">Pair this device</h1>
        <p className="mt-1 text-[11px] text-slate-400 leading-snug">
          Staff PINs only work on devices the shop has paired. Ask a manager for a pairing code — they make one in
          <strong className="text-slate-200"> Admin › Staff Accounts</strong>.
        </p>
      </div>

      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">Pairing code</span>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 9))
            setError(null)
          }}
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          aria-label="Pairing code"
          className="w-full rounded-xl border border-amber-400/40 bg-black/60 px-3 py-2.5 text-center font-mono text-xl tracking-[0.3em] text-white placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Name for this device</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          placeholder="e.g. Front counter till"
          className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
        />
      </label>

      {portal === 'pos' && (
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">What is it?</span>
          <select
            value={use}
            onChange={(e) => setUse(e.target.value as DeviceUse)}
            className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
          >
            {USES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-2.5 text-center text-xs font-bold text-rose-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-amber-400 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:bg-amber-300 transition disabled:opacity-60"
      >
        {busy ? 'Pairing…' : 'Pair device →'}
      </button>
      <p className="text-center text-[10px] text-slate-500">Each code works once and runs out after 15 minutes.</p>
    </form>
  )
}
