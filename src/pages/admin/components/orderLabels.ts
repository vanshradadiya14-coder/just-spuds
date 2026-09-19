import { type Order } from '../../../services/orderStore'

/** What "advance" will do to this order, so the button says it instead of "Next". */
export function nextStepLabel(o: Order): string | null {
  switch (o.status) {
    case 'placed':
      return '✓ Accept'
    case 'accepted':
      return '🔥 Start baking'
    case 'baking':
      return o.fulfilment === 'delivery' ? '🛵 Out for delivery' : '🛍️ Ready to collect'
    case 'out_for_delivery':
      return '🎉 Delivered'
    case 'ready_for_pickup':
      return '🎉 Collected'
    default:
      return null
  }
}

export const SOURCE_BADGE: Record<Order['source'], { label: string; tone: string }> = {
  WEBSITE: { label: '🌐 Web', tone: 'bg-sky-500/20 text-sky-200 border-sky-500/40' },
  TILL: { label: '🖥️ Till', tone: 'bg-purple-500/20 text-purple-200 border-purple-500/40' },
  PHONE: { label: '📞 Phone', tone: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
  STAFF: { label: '👤 Counter', tone: 'bg-slate-500/20 text-slate-200 border-slate-500/40' },
}

export function sourceBadge(o: Order) {
  return SOURCE_BADGE[o.source] || SOURCE_BADGE.WEBSITE
}

export const STATUS_TONE: Record<string, string> = {
  placed: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  accepted: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  baking: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  quality_check: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  ready_for_pickup: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  ready_for_delivery: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  driver_assigned: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  driver_arrived_at_store: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  order_collected: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  out_for_delivery: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  delivered: 'bg-emerald-500/30 text-emerald-200 border-emerald-500/40',
  collected: 'bg-emerald-500/30 text-emerald-200 border-emerald-500/40',
  failed_delivery: 'bg-red-500/20 text-red-300 border-red-500/40',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
}

export const statusTone = (status: string) => STATUS_TONE[status] || 'bg-white/10 text-white/70 border-white/20'
