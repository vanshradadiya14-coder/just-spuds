import { useEffect, useState } from 'react'
import { getStoreSettings, subscribeMenu } from '../services/menuStore'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const SHORT: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }

/** "11:00" → "11am", "21:30" → "9:30pm" */
function shortTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return hhmm
  const h = Number(m[1])
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m[2] === '00' ? `${h12}${suffix}` : `${h12}:${m[2]}${suffix}`
}

export interface OpeningHours {
  /** Today, e.g. "11am – 10pm" or "Closed today". */
  today: string
  /** The week in one line, e.g. "Every day 11am – 10pm" or "Mon–Sat 11am – 10pm · Sun closed". */
  week: string
}

/** Opening hours as set in Admin › Store Ops (shared by every device). */
export function getOpeningHours(now: Date = new Date()): OpeningHours {
  const weekly = getStoreSettings().weeklyHours || {}
  const label = (day: string) => {
    const d = weekly[day]
    if (!d) return '11am – 10pm'
    return d.isClosed ? 'closed' : `${shortTime(d.openTime)} – ${shortTime(d.closeTime)}`
  }
  const todayName = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const todayLabel = label(todayName)

  // Group consecutive days with the same hours.
  const groups: { from: string; to: string; hours: string }[] = []
  for (const day of DAYS) {
    const hours = label(day)
    const last = groups[groups.length - 1]
    if (last && last.hours === hours) last.to = day
    else groups.push({ from: day, to: day, hours })
  }
  const week =
    groups.length === 1
      ? groups[0].hours === 'closed'
        ? 'Closed this week'
        : `Every day ${groups[0].hours}`
      : groups.map((g) => `${SHORT[g.from]}${g.from === g.to ? '' : `–${SHORT[g.to]}`} ${g.hours}`).join(' · ')

  return { today: todayLabel === 'closed' ? 'Closed today' : todayLabel, week }
}

export function useOpeningHours(): OpeningHours {
  const [hours, setHours] = useState(() => getOpeningHours())
  useEffect(() => subscribeMenu(() => setHours(getOpeningHours())), [])
  return hours
}
