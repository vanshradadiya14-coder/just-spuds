/**
 * SYSTEM DATA RESET & CLEAN START UTILITY
 * -----------------------------------------
 * Wipes sales orders, active & past till shifts, draft cart tickets, held tickets,
 * cash drawer movement logs, and timecard punches across all storage and devices.
 * Retains authorized store staff roster (Owner, Manager, Staff, Admin) and menu stock items.
 */
import { startFresh } from './cloudSync'
import { logAuditEvent } from './auditStore'

export interface ResetOptions {
  actor: string
  wipeRemoteEpoch?: boolean
}

export async function resetAllStoreData({ actor, wipeRemoteEpoch = true }: ResetOptions): Promise<{ ok: boolean; message: string }> {
  try {
    // 1. Wipe remote epoch across all synchronized terminals if cloud sync is active
    if (wipeRemoteEpoch) {
      try {
        await startFresh(actor)
      } catch (err) {
        console.warn('[resetStoreData] Cloud epoch sync warning:', err)
      }
    }

    // 2. Clear all local sales, orders, till shifts, tickets, and active carts
    const keysToRemove = [
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
      'just_spuds_cfd_ticket_state_v1',
    ]

    if (typeof window !== 'undefined') {
      keysToRemove.forEach((key) => {
        try {
          localStorage.removeItem(key)
        } catch {
          // ignore storage delete errors
        }
      })

      // Broadcast update on all storage channels to instantly update open tabs
      const channels = [
        'just_spuds_orders_bus',
        'just_spuds_till_shift_bus',
        'just_spuds_held_tickets',
        'just_spuds_timeclock_bus',
        'just_spuds_cfd_bus',
        'just_spuds_cart_bus',
      ]
      channels.forEach((name) => {
        try {
          const bc = new BroadcastChannel(name)
          bc.postMessage({ type: 'DATA_RESET' })
          bc.close()
        } catch {
          // BroadcastChannel may not be supported in some environments
        }
      })
    }

    logAuditEvent(actor, 'system.reset_data', 'Full POS & Admin Sales Data Wipe', 'All orders, shifts, held tickets, and carts cleared to fresh clean state.')

    return {
      ok: true,
      message: 'All POS and Admin order data, shifts, and tickets have been completely reset to a clean start.',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Reset failed: ${msg}` }
  }
}

