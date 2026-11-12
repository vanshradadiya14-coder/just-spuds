/**
 * START TRADING FRESH
 * -------------------
 * Wipes orders, till shifts, the open ticket, held tickets and timecards on
 * every device, so launch day opens with clean books. Menu, prices, stock and
 * staff accounts are kept.
 *
 * The reset is published to the server first as a new epoch
 * (`cloudSync.startFresh`): every device drops everything from before it as it
 * syncs. If the server can't be reached nothing is wiped here either —
 * otherwise this device would clear itself and sync the old data straight
 * back from the server.
 */
import { startFresh } from './cloudSync'
import { logAuditEvent } from './auditStore'
import { reloadTillFromStorage } from './tillStore'

export interface ResetOptions {
  actor: string
  /** Publish the epoch to the server (default). Only false with no cloud sync at all. */
  wipeRemoteEpoch?: boolean
}

/** Device-local copies the epoch does not clear by itself. */
const LOCAL_KEYS = [
  'just_spuds_orders_v1',
  'just_spuds_till_active_shift_v1',
  'just_spuds_till_past_shifts_v1',
  'just_spuds_till_active_ticket_v1',
  'just_spuds_till_last_order_v1',
  'just_spuds_till_held_tickets_v1',
  'just_spuds_till_remote_shifts_v1',
  'just_spuds_cart_v2',
  'just_spuds_address_v2',
  'just_spuds_fulfilment_v2',
  'just_spuds_active_order_id',
  'just_spuds_customer_placed_order_ids_v1',
  'just_spuds_timeclock_v1',
  'just_spuds_kitchen_pause_v1',
  'just_spuds_guest_customer',
]

export async function resetAllStoreData({ actor, wipeRemoteEpoch = true }: ResetOptions): Promise<{ ok: boolean; message: string }> {
  if (wipeRemoteEpoch) {
    const epoch = await startFresh(actor)
    if (!epoch.ok) return { ok: false, message: `Nothing was reset. ${epoch.message}` }
  }

  if (typeof window !== 'undefined') {
    LOCAL_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore storage delete errors
      }
    })
    // The till keeps its shift in memory; make it re-read the (now empty) storage.
    reloadTillFromStorage()
  }

  logAuditEvent(actor, 'system.reset_data', 'Start trading fresh', 'Orders, shifts, held tickets, carts and timecards cleared on every device.')

  return {
    ok: true,
    message: 'Fresh start published. Orders, shifts, held tickets and timecards are cleared on every device as it syncs. Reload each till to see it.',
  }
}
