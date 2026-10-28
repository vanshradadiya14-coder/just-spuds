import { useState } from 'react'
import { Link } from 'react-router-dom'
import { changeMyPin, isManagerOrAdmin, logout, type AuthUser } from '../services/authStore'
import { playPOSTouchTone } from '../services/printerBridge'
import FixedAmbientBackdrop from './FixedAmbientBackdrop'

/**
 * After signing in with a temporary PIN (set by a manager, or printed by the
 * set-up script) nobody gets further until they choose their own. The server
 * checks the rules; this screen only explains them.
 */
export default function ChangePinScreen({ user }: { user: AuthUser }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const manager = isManagerOrAdmin(user.role)
  const minDigits = manager ? 6 : 4

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (pin.length < minDigits) {
      setError(manager ? 'Supervisors and managers need a PIN of 6 to 8 digits.' : 'PINs are 4 to 8 digits.')
      return
    }
    if (pin !== confirm) {
      setError('The two PINs do not match.')
      return
    }
    setBusy(true)
    const res = await changeMyPin(pin)
    setBusy(false)
    if (!res.ok) {
      playPOSTouchTone('numpad')
      setError(res.message)
      setPin('')
      setConfirm('')
      return
    }
    playPOSTouchTone('action')
  }

  const field = 'w-full rounded-xl border border-amber-400/40 bg-black/60 px-3 py-2.5 text-center font-mono text-xl tracking-[0.35em] text-white focus:border-amber-400 focus:outline-none'

  return (
    <div className="relative min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-body overflow-hidden">
      <FixedAmbientBackdrop variant="portal" />
      <form onSubmit={submit} className="relative z-10 w-full max-w-sm rounded-3xl border border-amber-500/40 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-lg">🔑</div>
          <h1 className="text-xl font-black text-white uppercase tracking-wide">Choose your own PIN</h1>
          <p className="mt-1 text-xs text-slate-400">
            Hi {user.name.split(' (')[0]} — you signed in with a temporary PIN. Pick a new one only you know.
          </p>
        </div>
        <ul className="rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-slate-300 space-y-0.5 list-disc pl-6">
          <li>{manager ? '6 to 8 digits (you can approve refunds and voids).' : '4 to 8 digits.'}</li>
          <li>Not repeated or in sequence (no 1111, 1234, 121212).</li>
          <li>Never tell anyone your PIN — managers can set a new one if you forget it.</li>
        </ul>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="New PIN"
          aria-label="New PIN"
          className={field}
        />
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
          placeholder="Repeat new PIN"
          aria-label="Repeat new PIN"
          className={field}
        />
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
          {busy ? 'Saving…' : 'Save my PIN →'}
        </button>
        <p className="text-center text-xs">
          <Link to="/" onClick={() => logout()} className="font-bold text-rose-300 hover:text-rose-200">
            Sign out
          </Link>
        </p>
      </form>
    </div>
  )
}
