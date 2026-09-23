/**
 * Supabase implementation of the sync backend.
 *
 * Uses tables that already exist in the project (supabase/schema.sql), so no
 * migration is needed to go live:
 *   - `delivery_settings` is the shop's key/value store: `store_id` holds the
 *     key (`just_spuds::doc::menu.products`, `just_spuds::rec::audit::<id>` …)
 *     and `settings` the JSON value. The table name predates this use.
 *   - `menu_stock` holds one stock count per product.
 *   - `orders` holds orders.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { orderToRow, rowToOrder, type SupabaseOrderRow } from '../supabaseOrderSync'
import type { KvRow, OrderQuery, RemoteBackend, StockRow, SubscribeHandlers } from './backend'

export const STORE_ID: string = import.meta.env.VITE_STORE_ID || 'just_spuds'

const KV_TABLE = 'delivery_settings'
const STOCK_TABLE = 'menu_stock'

function warn(where: string, err: unknown) {
  const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : String(err)
  console.warn(`[sync] ${where}: ${msg}`)
}

export function createSupabaseBackend(): RemoteBackend | null {
  const client = supabase
  if (!client) return null

  return {
    async listKv(prefix, opts) {
      try {
        let q = client.from(KV_TABLE).select('store_id,settings,updated_at').like('store_id', `${prefix}%`)
        if (opts?.since) q = q.gte('updated_at', opts.since)
        q = q.order('updated_at', { ascending: false })
        if (opts?.limit) q = q.limit(opts.limit)
        const { data, error } = await q
        if (error) {
          warn('listKv', error)
          return null
        }
        return (data || []).map((r) => ({ key: r.store_id as string, value: r.settings, updatedAt: r.updated_at as string }))
      } catch (err) {
        warn('listKv', err)
        return null
      }
    },

    async putKv(rows) {
      if (rows.length === 0) return true
      try {
        const { error } = await client
          .from(KV_TABLE)
          .upsert(rows.map((r) => ({ store_id: r.key, settings: r.value, updated_at: r.updatedAt })), { onConflict: 'store_id' })
        if (error) {
          warn('putKv', error)
          return false
        }
        return true
      } catch (err) {
        warn('putKv', err)
        return false
      }
    },

    async listStock() {
      try {
        const { data, error } = await client.from(STOCK_TABLE).select('id,remaining_count,updated_at').eq('store_id', STORE_ID)
        if (error) {
          warn('listStock', error)
          return null
        }
        return (data || [])
          .filter((r) => typeof r.remaining_count === 'number')
          .map((r) => ({ id: r.id as string, qty: r.remaining_count as number, updatedAt: r.updated_at as string }))
      } catch (err) {
        warn('listStock', err)
        return null
      }
    },

    async putStock(rows) {
      if (rows.length === 0) return true
      try {
        const now = new Date().toISOString()
        const { error } = await client.from(STOCK_TABLE).upsert(
          rows.map((r) => ({
            id: r.id,
            store_id: STORE_ID,
            remaining_count: r.qty,
            is_sold_out: r.qty <= 0,
            is_available: true,
            updated_at: r.updatedAt || now,
          })),
          { onConflict: 'id,store_id' },
        )
        if (error) {
          warn('putStock', error)
          return false
        }
        return true
      } catch (err) {
        warn('putStock', err)
        return false
      }
    },

    async fetchOrders(query: OrderQuery) {
      try {
        if (query.ids && query.ids.length === 0) return []
        let q = client.from('orders').select('*').eq('store_id', STORE_ID)
        if (query.ids) q = q.in('id', query.ids)
        if (query.since) q = q.gte('created_at', query.since)
        q = q.order('created_at', { ascending: false }).limit(query.limit || 500)
        const { data, error } = await q
        if (error) {
          warn('fetchOrders', error)
          return null
        }
        return ((data || []) as SupabaseOrderRow[]).map(rowToOrder)
      } catch (err) {
        warn('fetchOrders', err)
        return null
      }
    },

    async upsertOrders(orders) {
      if (orders.length === 0) return true
      try {
        const { error } = await client.from('orders').upsert(orders.map(orderToRow), { onConflict: 'id' })
        if (error) {
          warn('upsertOrders', error)
          return false
        }
        return true
      } catch (err) {
        warn('upsertOrders', err)
        return false
      }
    },

    subscribe(handlers: SubscribeHandlers, orderScope) {
      const channels: RealtimeChannel[] = []
      const tag = `${STORE_ID}-${Math.random().toString(36).slice(2, 8)}`

      if (handlers.kv || handlers.stock) {
        let ch = client.channel(`sync-${tag}`)
        if (handlers.kv) {
          // Realtime filters have no LIKE, so key prefixes are checked by the caller.
          ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: KV_TABLE }, (payload) => {
            const row = payload.new as { store_id?: string; settings?: unknown; updated_at?: string } | null
            if (row?.store_id) handlers.kv!({ key: row.store_id, value: row.settings, updatedAt: row.updated_at || '' })
          })
        }
        if (handlers.stock) {
          ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: STOCK_TABLE, filter: `store_id=eq.${STORE_ID}` }, (payload) => {
            const row = payload.new as { id?: string; remaining_count?: number; updated_at?: string } | null
            if (row?.id && typeof row.remaining_count === 'number') handlers.stock!({ id: row.id, qty: row.remaining_count, updatedAt: row.updated_at })
          })
        }
        channels.push(ch.subscribe())
      }

      if (handlers.order && orderScope && (orderScope === 'all' || orderScope.length > 0)) {
        const filter = orderScope === 'all' ? `store_id=eq.${STORE_ID}` : `id=in.(${orderScope.join(',')})`
        channels.push(
          client
            .channel(`orders-${tag}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, (payload) => {
              if (payload.eventType === 'DELETE') return
              handlers.order!(rowToOrder(payload.new as SupabaseOrderRow))
            })
            .subscribe(),
        )
      }

      return () => {
        channels.forEach((c) => client.removeChannel(c))
      }
    },
  } satisfies RemoteBackend
}

export type { KvRow, StockRow }
