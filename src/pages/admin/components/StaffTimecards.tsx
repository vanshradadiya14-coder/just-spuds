import { useEffect, useMemo, useState } from 'react'
import { clockOut, formatDuration, getTimecardsSince, subscribeTimeclock, workedMs, type TimeclockEntry } from '../../../services/timeclockStore'

type Range = 'today' | 'week' | 'month'

function rangeStart(range: Range): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  if (range === 'month') d.setDate(1)
  return d
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })

/**
 * Timecards punched on the till. Totals per person for payroll, plus a way to
 * close a shift someone forgot to clock out of.
 */
export default function StaffTimecards({ actor }: { actor: string }) {
  const [range, setRange] = useState<Range>('week')
  const [entries, setEntries] = useState<TimeclockEntry[]>(() => getTimecardsSince(rangeStart('week')))
  const [, setTick] = useState(0)

  useEffect(() => subscribeTimeclock(() => setEntries(getTimecardsSince(rangeStart(range)))), [range])
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const perPerson = useMemo(() => {
    const m = new Map<string, { name: string; role: string; ms: number; shifts: number; open: boolean }>()
    for (const e of entries) {
      const cur = m.get(e.staffId) || { name: e.staffName, role: e.role, ms: 0, shifts: 0, open: false }
      cur.ms += workedMs(e)
      cur.shifts += 1
      cur.open = cur.open || !e.clockOut
      m.set(e.staffId, cur)
    }
    return [...m.values()].sort((a, b) => b.ms - a.ms)
  }, [entries])

  const totalMs = perPerson.reduce((sum, p) => sum + p.ms, 0)

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="display text-xl text-white font-bold">⏱️ Timecards</h2>
          <p className="font-body text-xs text-white/60">
            Clocked on the till &bull; {formatDuration(totalMs)} across {entries.length} {entries.length === 1 ? 'shift' : 'shifts'}
          </p>
        </div>
        <div className="flex rounded-xl bg-white/5 p-1 border border-white/10 text-xs">
          {(['today', 'week', 'month'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-lg font-bold capitalize transition ${range === r ? 'bg-amber-400 text-ink' : 'text-white/60 hover:text-white'}`}
            >
              {r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'Today'}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center font-body text-xs text-white/40">
          Nobody has clocked in for this period. Staff punch in from the till PIN screen (⏱️ Clock in / out).
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <ul className="lg:col-span-2 space-y-2">
            {perPerson.map((p) => (
              <li key={p.name} className="rounded-2xl border border-white/10 bg-black/30 p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {p.name}
                    {p.open && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-300">ON CLOCK</span>}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">{p.role.replace(/_/g, ' ')} &bull; {p.shifts} {p.shifts === 1 ? 'shift' : 'shifts'}</p>
                </div>
                <span className="font-mono text-lg font-black text-amber-300 shrink-0">{formatDuration(p.ms)}</span>
              </li>
            ))}
          </ul>

          <div className="lg:col-span-3 overflow-x-auto">
            <table className="w-full text-left font-body text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/50">
                  <th className="py-2 pr-3">Day</th>
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">In</th>
                  <th className="py-2 pr-3">Out</th>
                  <th className="py-2 pr-3 text-right">Breaks</th>
                  <th className="py-2 text-right">Worked</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const breakMs = e.breaks.reduce((s, b) => s + (new Date(b.end || Date.now()).getTime() - new Date(b.start).getTime()), 0)
                  return (
                    <tr key={e.id} className="border-b border-white/5 text-white/85">
                      <td className="py-2 pr-3 whitespace-nowrap">{day(e.clockIn)}</td>
                      <td className="py-2 pr-3">{e.staffName}</td>
                      <td className="py-2 pr-3 font-mono">{time(e.clockIn)}</td>
                      <td className="py-2 pr-3 font-mono">
                        {e.clockOut ? (
                          time(e.clockOut)
                        ) : (
                          <button
                            type="button"
                            onClick={() => clockOut(e.staffId, actor)}
                            className="rounded-md border border-rose-500/40 bg-rose-950/40 px-2 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-900/60"
                            title="Close a shift that was never clocked out"
                          >
                            Clock out now
                          </button>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-white/50">{breakMs > 0 ? formatDuration(breakMs) : '—'}</td>
                      <td className="py-2 text-right font-mono font-bold">{formatDuration(workedMs(e))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
