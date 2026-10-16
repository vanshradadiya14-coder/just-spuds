/**
 * HELD TICKETS (EPOS "Hold")
 * --------------------------
 * A ticket parked so the next customer can be served. These used to live only
 * in the till page's memory, so a refresh, a crash or the idle lock losing the
 * tab threw the customer's order away. They are now kept on this device (and
 * every till tab on it) until recalled or deleted. They are not sent to the
 * kitchen and take no money — an order that should cook now is "Sent" instead.
 */
import type { CartLine } from '../hooks/useCart'

export interface HeldTicket {
  id: string
  customer: string
  lines: CartLine[]
  type: 'takeaway' | 'eat_in' | 'phone'
  /** ISO time it was held. */
  heldAt: string
  heldBy: string
  buzzer?: string
  table?: string
  discountPercent?: number
  discountFixedPence?: number
}

const STORAGE_KEY = 'just_spuds_till_held_tickets_v1'
const listeners = new Set<(tickets: HeldTicket[]) => void>()

let channel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel('just_spuds_held_tickets')
    channel.onmessage = () => notify()
  } catch {
    channel = null
  }
}

function read(): HeldTicket[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as HeldTicket[]) : []
    return Array.isArray(parsed) ? parsed.filter((t) => t && Array.isArray(t.lines) && t.lines.length > 0) : []
  } catch {
    return []
  }
}

function write(tickets: HeldTicket[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  } catch {}
  channel?.postMessage({ type: 'HELD_UPDATED' })
  notify()
}

function notify() {
  const snapshot = read()
  listeners.forEach((l) => l(snapshot))
}

export function getHeldTickets(): HeldTicket[] {
  return read()
}

export function holdTicket(ticket: Omit<HeldTicket, 'id' | 'heldAt'>): HeldTicket {
  const held: HeldTicket = { ...ticket, id: `held-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, heldAt: new Date().toISOString() }
  write([held, ...read()])
  return held
}

/** Takes a ticket off hold (recall or delete). Returns it, or undefined if another tab already did. */
export function takeHeldTicket(id: string): HeldTicket | undefined {
  const all = read()
  const found = all.find((t) => t.id === id)
  if (!found) return undefined
  write(all.filter((t) => t.id !== id))
  return found
}

export function subscribeHeldTickets(fn: (tickets: HeldTicket[]) => void): () => void {
  listeners.add(fn)
  fn(read())
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) fn(read())
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
