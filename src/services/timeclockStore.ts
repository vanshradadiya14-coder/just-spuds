/**
 * STAFF TIME CLOCK
 * ----------------
 * Clock in / break / clock out from the till, the way Square Shifts and the
 * Toast timeclock work: a PIN punches you in without opening the register.
 * Timecards are kept in localStorage and mirrored across tabs.
 */
import { logAuditEvent } from './auditStore'
import type { AuthUser } from './authStore'

export interface TimeclockBreak {
  start: string
  end?: string
}

export interface TimeclockEntry {
  id: string
  staffId: string
  staffName: string
  role: AuthUser['role']
  clockIn: string
  clockOut?: string
  breaks: TimeclockBreak[]
}

const STORAGE_KEY = 'just_spuds_timeclock_v1'
const CHANNEL = 'just_spuds_timeclock_bus'

let entries: TimeclockEntry[] = []
const listeners = new Set<(entries: TimeclockEntry[]) => void>()

let channel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = () => {
    load()
    notify()
  }
}

function load() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    entries = raw ? JSON.parse(raw) : []
  } catch {
    entries = []
  }
}

function persist() {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 2000)))
  channel?.postMessage({ type: 'TIMECLOCK_UPDATED' })
  notify()
}

function notify() {
  const snapshot = entries.map((e) => ({ ...e, breaks: [...e.breaks] }))
  listeners.forEach((l) => l(snapshot))
}

load()

export function subscribeTimeclock(listener: (entries: TimeclockEntry[]) => void): () => void {
  listeners.add(listener)
  listener(entries.map((e) => ({ ...e, breaks: [...e.breaks] })))
  return () => listeners.delete(listener)
}

export function getTimeclockEntries(): TimeclockEntry[] {
  return entries.map((e) => ({ ...e, breaks: [...e.breaks] }))
}

/** The open (not clocked out) entry for a member of staff, if any. */
export function getActiveTimeclockEntry(staffId: string): TimeclockEntry | undefined {
  const e = entries.find((x) => x.staffId === staffId && !x.clockOut)
  return e ? { ...e, breaks: [...e.breaks] } : undefined
}

export function isOnBreak(entry: TimeclockEntry | undefined): boolean {
  return !!entry && entry.breaks.some((b) => !b.end)
}

export function clockIn(user: AuthUser): TimeclockEntry {
  const existing = entries.find((x) => x.staffId === user.id && !x.clockOut)
  if (existing) return { ...existing }
  const entry: TimeclockEntry = {
    id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    staffId: user.id,
    staffName: user.name,
    role: user.role,
    clockIn: new Date().toISOString(),
    breaks: [],
  }
  entries = [entry, ...entries]
  persist()
  logAuditEvent(user.name, 'timeclock.clock_in', user.name, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  return { ...entry }
}

export function clockOut(staffId: string, actor?: string): TimeclockEntry | undefined {
  const idx = entries.findIndex((x) => x.staffId === staffId && !x.clockOut)
  if (idx < 0) return undefined
  const now = new Date().toISOString()
  const entry = entries[idx]
  const breaks = entry.breaks.map((b) => (b.end ? b : { ...b, end: now }))
  const updated = { ...entry, clockOut: now, breaks }
  entries = entries.map((e, i) => (i === idx ? updated : e))
  persist()
  logAuditEvent(actor || entry.staffName, 'timeclock.clock_out', entry.staffName, `${formatDuration(workedMs(updated))} worked`)
  return { ...updated }
}

export function startBreak(staffId: string): TimeclockEntry | undefined {
  const idx = entries.findIndex((x) => x.staffId === staffId && !x.clockOut)
  if (idx < 0 || entries[idx].breaks.some((b) => !b.end)) return undefined
  const updated = { ...entries[idx], breaks: [...entries[idx].breaks, { start: new Date().toISOString() }] }
  entries = entries.map((e, i) => (i === idx ? updated : e))
  persist()
  logAuditEvent(updated.staffName, 'timeclock.break_start', updated.staffName)
  return { ...updated }
}

export function endBreak(staffId: string): TimeclockEntry | undefined {
  const idx = entries.findIndex((x) => x.staffId === staffId && !x.clockOut)
  if (idx < 0) return undefined
  const now = new Date().toISOString()
  const updated = { ...entries[idx], breaks: entries[idx].breaks.map((b) => (b.end ? b : { ...b, end: now })) }
  entries = entries.map((e, i) => (i === idx ? updated : e))
  persist()
  logAuditEvent(updated.staffName, 'timeclock.break_end', updated.staffName)
  return { ...updated }
}

/** Milliseconds on the clock, excluding breaks. Open entries count up to now. */
export function workedMs(entry: TimeclockEntry, now = Date.now()): number {
  const end = entry.clockOut ? new Date(entry.clockOut).getTime() : now
  const gross = Math.max(0, end - new Date(entry.clockIn).getTime())
  const breakMs = entry.breaks.reduce((sum, b) => {
    const bEnd = b.end ? new Date(b.end).getTime() : now
    return sum + Math.max(0, bEnd - new Date(b.start).getTime())
  }, 0)
  return Math.max(0, gross - breakMs)
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

/** Entries that started on or after `since`, newest first. */
export function getTimecardsSince(since: Date): TimeclockEntry[] {
  const t = since.getTime()
  return getTimeclockEntries().filter((e) => new Date(e.clockIn).getTime() >= t)
}
