/**
 * Order ⇄ Supabase row mapping.
 *
 * The transport (fetch, upsert, realtime, offline retry) lives in
 * services/cloudSync.ts and services/sync/supabaseBackend.ts.
 * Supports multi-store tenancy via VITE_STORE_ID (defaults to 'just_spuds').
 */
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

/**
 * Order fields with no column of their own. They ride inside the free-form
 * `delivery_details` JSON under `_x`; before this they were silently dropped
 * whenever an order went through Supabase (void reasons, manager overrides and
 * scheduled slots vanished on every other device).
 */
interface PackedExtras {
  isTest?: boolean
  adminNotes?: Order['adminNotes']
  manualOverrides?: Order['manualOverrides']
  scheduleDate?: string
  scheduleTime?: string
}

export function orderToRow(order: Order): SupabaseOrderRow {
  const extras: PackedExtras = {}
  if (order.isTest) extras.isTest = true
  if (order.adminNotes?.length) extras.adminNotes = order.adminNotes
  if (order.manualOverrides?.length) extras.manualOverrides = order.manualOverrides
  if (order.scheduleDate) extras.scheduleDate = order.scheduleDate
  if (order.scheduleTime) extras.scheduleTime = order.scheduleTime
  const details = Object.keys(extras).length > 0 ? { ...(order.deliveryDetails || {}), _x: extras } : order.deliveryDetails
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
    delivery_details: details,
    cancellation: order.cancellation,
    review: order.review,
    timeline: order.timeline,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: order.updatedAt || new Date().toISOString(),
  }
}

export function rowToOrder(row: SupabaseOrderRow): Order {
  const details = row.delivery_details && typeof row.delivery_details === 'object' ? row.delivery_details : undefined
  const extras: PackedExtras = (details?._x as PackedExtras) || {}
  let deliveryDetails = details
  if (details && '_x' in details) {
    const { _x: _packed, ...rest } = details
    deliveryDetails = Object.keys(rest).length > 0 ? rest : undefined
  }
  return {
    id: row.id,
    shortId: row.short_id,
    source: sourceFromShortId(row.short_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    deliveryDetails,
    cancellation: row.cancellation,
    review: row.review,
    timeline: row.timeline || [],
    ...(extras.isTest ? { isTest: true } : {}),
    ...(extras.adminNotes ? { adminNotes: extras.adminNotes } : {}),
    ...(extras.manualOverrides ? { manualOverrides: extras.manualOverrides } : {}),
    ...(extras.scheduleDate ? { scheduleDate: extras.scheduleDate } : {}),
    ...(extras.scheduleTime ? { scheduleTime: extras.scheduleTime } : {}),
  }
}
