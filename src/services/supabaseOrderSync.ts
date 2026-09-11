/**
 * SUPABASE REALTIME ORDER SYNC ADAPTER
 * -------------------------------------
 * Syncs orders bidirectionally with Supabase PostgreSQL.
 * Supports multi-store tenancy via VITE_STORE_ID (defaults to 'just_spuds').
 */
import { supabase, isSupabaseConfigured } from './supabase'
import type { Order, OrderSource } from './orderStore'

const STORE_ID = import.meta.env.VITE_STORE_ID || 'just_spuds'

export interface SupabaseOrderRow {
  id: string
  short_id: string
  store_id: string
  status: string
  fulfilment: string
  customer: any
  lines: any
  payment: any
  estimated_delivery_time?: string | null
  eta_minutes?: number | null
  is_scheduled?: boolean | null
  scheduled_for?: string | null
  kitchen_notes?: string | null
  driver?: any
  delivery_details?: any
  cancellation?: any
  review?: any
  timeline: any
  created_at: string
  updated_at: string
}

/**
 * The orders table has no `source` column; the channel is encoded in the
 * short id prefix instead (JS-T- till, JS-P- phone, JS-S- staff, JS-W- web).
 */
export function sourceFromShortId(shortId: string): OrderSource {
  if (shortId.startsWith('JS-T-')) return 'TILL'
  if (shortId.startsWith('JS-P-')) return 'PHONE'
  if (shortId.startsWith('JS-S-')) return 'STAFF'
  return 'WEBSITE'
}

export function orderToRow(order: Order): SupabaseOrderRow {
  return {
    id: order.id,
    short_id: order.shortId,
    store_id: STORE_ID,
    status: order.status,
    fulfilment: order.fulfilment,
    customer: order.customer,
    lines: order.lines,
    payment: order.payment,
    estimated_delivery_time: order.estimatedDeliveryTime,
    eta_minutes: order.etaMinutes,
    is_scheduled: order.isScheduled ?? false,
    scheduled_for: order.scheduledFor,
    kitchen_notes: order.kitchenNotes,
    driver: order.driver,
    delivery_details: order.deliveryDetails,
    cancellation: order.cancellation,
    review: order.review,
    timeline: order.timeline,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function rowToOrder(row: SupabaseOrderRow): Order {
  return {
    id: row.id,
    shortId: row.short_id,
    source: sourceFromShortId(row.short_id),
    createdAt: row.created_at,
    status: row.status as Order['status'],
    fulfilment: row.fulfilment as Order['fulfilment'],
    customer: row.customer,
    lines: row.lines || [],
    payment: row.payment,
    estimatedDeliveryTime: row.estimated_delivery_time || '',
    etaMinutes: row.eta_minutes ?? 25,
    isScheduled: row.is_scheduled ?? false,
    scheduledFor: row.scheduled_for ?? undefined,
    kitchenNotes: row.kitchen_notes ?? undefined,
    driver: row.driver,
    deliveryDetails: row.delivery_details,
    cancellation: row.cancellation,
    review: row.review,
    timeline: row.timeline || [],
  }
}

/**
 * Fetch all orders for this store from Supabase.
 */
export async function fetchSupabaseOrders(): Promise<Order[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.warn('Supabase fetch orders error:', error.message)
      return null
    }

    if (!data) return []
    return (data as SupabaseOrderRow[]).map(rowToOrder)
  } catch (err) {
    console.warn('Could not fetch orders from Supabase:', err)
    return null
  }
}

/**
 * Push an individual order (create or update) to Supabase.
 */
export async function syncOrderToSupabase(order: Order): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  try {
    const row = orderToRow(order)
    const { error } = await supabase
      .from('orders')
      .upsert(row, { onConflict: 'id' })

    if (error) {
      console.warn('Supabase upsert order error:', error.message)
    }
  } catch (err) {
    console.warn('Failed to push order to Supabase:', err)
  }
}

/**
 * Initialize real-time WebSocket listener for orders.
 * Whenever an order is inserted or updated in Supabase, callback is fired.
 */
export function initSupabaseOrderSubscription(
  onOrderUpserted: (order: Order) => void,
  onOrderDeleted?: (orderId: string) => void
): (() => void) | null {
  if (!isSupabaseConfigured || !supabase) return null
  const client = supabase

  const channel = client
    .channel(`orders_realtime_${STORE_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `store_id=eq.${STORE_ID}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const order = rowToOrder(payload.new as SupabaseOrderRow)
          onOrderUpserted(order)
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          onOrderDeleted?.(payload.old.id)
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Connected to Supabase real-time
      }
    })

  return () => {
    client.removeChannel(channel)
  }
}
