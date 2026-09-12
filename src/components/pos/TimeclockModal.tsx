import { useEffect, useState } from 'react'
import { findUserByPin, type AuthUser } from '../../services/authStore'
import {
  clockIn,
  clockOut,
  endBreak,
  formatDuration,
  getActiveTimeclockEntry,
  isOnBreak,
  startBreak,
  subscribeTimeclock,
  workedMs,
  type TimeclockEntry,
} from '../../services/timeclockStore'

interface TimeclockModalProps {
  onClose: () => void
  /** When a user is already signed in to the till, skip the PIN step. */
  user?: AuthUser | null
}

/**
 * Punch clock. From the PIN gate it identifies staff by PIN without opening the
 * register (a kitchen porter can clock in on the till without a cashier session);
 * from inside the till it acts on the signed-in cashier.
 */
export default function TimeclockModal({ onClose, user }: TimeclockModalProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [who, setWho] = useState<AuthUser | null>(user ?? null)
  const [entry, setEntry] = useState<TimeclockEntry | undefined>(() => (user ? getActiveTimeclockEntry(user.id) : undefined))
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!who) return
    return subscribeTimeclock(() => setEntry(getActiveTimeclockEntry(who.id)))
  }, [who])

  const identify = (e: React.FormEvent) => {
    e.preventDefault()
    const found = findUserByPin(pin)
    if (!found) {
      setError('PIN not recognised.')
      return
    }
    setWho(found)
    setEntry(getActiveTimeclockEntry(found.id))
    setError(null)
  }

  const onBreak = isOnBreak(entry)
  void tick

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">⏱️ Time Clock</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close time clock">
            ✕
          </button>
        </div>

        {!who ? (
          <form onSubmit={identify} className="space-y-3">
            <p className="text-xs text-white/60">Enter your staff PIN to clock in or out. This does not open the till.</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full rounded-2xl border border-white/20 bg-black/60 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white focus:border-amber-400 focus:outline-none"
            />
            {error && <p className="text-xs font-bold text-rose-300">{error}</p>}
            <button type="submit" className="w-full rounded-xl bg-amber-400 py-3 text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300">
              Continue →
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
              <p className="text-sm font-bold text-white">{who.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{who.role.replace(/_/g, ' ')}</p>
              {entry ? (
                <p className="mt-2 text-xs text-emerald-300">
                  On the clock since {new Date(entry.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull;{' '}
                  <span className="font-mono font-bold">{formatDuration(workedMs(entry))}</span> worked
                  {onBreak && <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">ON BREAK</span>}
                </p>
              ) : (
                <p className="mt-2 text-xs text-white/50">Not clocked in.</p>
              )}
            </div>

            {!entry ? (
              <button
                type="button"
                onClick={() => {
                  clockIn(who)
                  setEntry(getActiveTimeclockEntry(who.id))
                }}
                className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-black uppercase tracking-wider text-ink hover:bg-emerald-400"
              >
                Clock in
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => (onBreak ? endBreak(who.id) : startBreak(who.id))}
                  className="rounded-xl border border-amber-400/40 bg-amber-500/10 py-3 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-amber-400 hover:text-ink"
                >
                  {onBreak ? 'End break' : 'Start break'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clockOut(who.id)
                    setEntry(undefined)
                  }}
                  className="rounded-xl bg-rose-500 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-400"
                >
                  Clock out
                </button>
              </div>
            )}

            {!user && (
              <button type="button" onClick={() => { setWho(null); setPin('') }} className="w-full text-[11px] text-white/50 hover:text-white">
                ← Different person
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
