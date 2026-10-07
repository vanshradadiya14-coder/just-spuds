/**
 * Pre-order ("schedule for later") slots, built from the shop's configured
 * opening hours for each day (Admin › Store Ops), so a customer can only pick
 * a time the kitchen will actually be open for:
 *  - never a slot that has already passed (plus a short kitchen lead time),
 *  - never a closed day,
 *  - never after last orders (same cut-offs as ASAP orders).
 * Checkout re-validates the chosen slot with the same rules.
 */
import { getConfiguredHours } from '../services/menuStore'

export type ScheduleMode = 'pickup' | 'delivery'

const DAYS_AHEAD = 7
const SLOT_STEP_HOURS = 0.5
/** Earliest bookable slot today is at least this far away. */
const LEAD_MINUTES: Record<ScheduleMode, number> = { pickup: 20, delivery: 40 }
/** First slot after opening: deliveries need time on the road. */
const FIRST_SLOT_AFTER_OPEN_HOURS: Record<ScheduleMode, number> = { pickup: 0, delivery: 0.5 }
/** Last slot before closing — matches the ASAP last-orders cut-offs. */
const LAST_SLOT_BEFORE_CLOSE_HOURS: Record<ScheduleMode, number> = { pickup: 0.25, delivery: 0.5 }

function dayFromToday(now: Date, offset: number): Date {
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

function absoluteLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function dayLabel(now: Date, offset: number): string {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return absoluteLabel(dayFromToday(now, offset))
}

function offsetForLabel(label: string, now: Date): number | null {
  for (let i = 0; i < DAYS_AHEAD; i++) {
    if (dayLabel(now, i) === label || absoluteLabel(dayFromToday(now, i)) === label) return i
  }
  return null
}

/** 21.5 → "9:30 PM" */
export function formatSlot(decimalHours: number): string {
  const total = Math.round(decimalHours * 60)
  const h24 = Math.floor(total / 60) % 24
  const m = total % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`
}

function slotsForOffset(offset: number, mode: ScheduleMode, now: Date): string[] {
  const day = dayFromToday(now, offset)
  const hours = getConfiguredHours(day)
  if (hours.isClosed) return []
  const first = hours.openHour + FIRST_SLOT_AFTER_OPEN_HOURS[mode]
  const last = hours.closeHour - LAST_SLOT_BEFORE_CLOSE_HOURS[mode]
  const earliest = offset === 0 ? now.getHours() + now.getMinutes() / 60 + LEAD_MINUTES[mode] / 60 : -Infinity
  const out: string[] = []
  for (let t = Math.ceil(first / SLOT_STEP_HOURS) * SLOT_STEP_HOURS; t <= last + 1e-9; t += SLOT_STEP_HOURS) {
    if (t >= earliest) out.push(formatSlot(t))
  }
  return out
}

/** Days (next week) that still have at least one bookable slot: "Today", "Tomorrow", "Thu 9 Oct"… */
export function getScheduleDates(mode: ScheduleMode = 'pickup', now: Date = new Date()): string[] {
  const days: string[] = []
  for (let i = 0; i < DAYS_AHEAD; i++) if (slotsForOffset(i, mode, now).length) days.push(dayLabel(now, i))
  return days
}

/** Bookable times on the given day. */
export function getScheduleTimes(dateLabel: string, mode: ScheduleMode = 'pickup', now: Date = new Date()): string[] {
  const offset = offsetForLabel(dateLabel, now)
  return offset === null ? [] : slotsForOffset(offset, mode, now)
}

/** Why a scheduled slot can't be booked, or null if it can. */
export function validateScheduledSlot(
  dateLabel: string | undefined,
  timeLabel: string | undefined,
  mode: ScheduleMode,
  now: Date = new Date(),
): string | null {
  const offset = dateLabel ? offsetForLabel(dateLabel, now) : null
  if (offset === null) return 'Please choose a pre-order day within the next week.'
  const slots = slotsForOffset(offset, mode, now)
  if (!slots.length) {
    return offset === 0
      ? 'There are no more pre-order slots today. Please choose another day.'
      : `We're closed on ${dayLabel(now, offset)}. Please choose another day.`
  }
  if (!timeLabel || !slots.includes(timeLabel)) {
    return `Please choose a ${mode === 'delivery' ? 'delivery' : 'pick-up'} time between ${slots[0]} and ${slots[slots.length - 1]} on ${dayLabel(now, offset)}.`
  }
  return null
}

/**
 * "Tomorrow" means a different day once midnight passes, so orders store the
 * calendar date ("Thu 9 Oct") that the kitchen and customer will both read later.
 */
export function absoluteScheduleDate(dateLabel: string, now: Date = new Date()): string {
  const offset = offsetForLabel(dateLabel, now)
  return offset === null ? dateLabel : absoluteLabel(dayFromToday(now, offset))
}
