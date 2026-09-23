/**
 * Storage backend contract for cross-device sync, plus an in-memory
 * implementation used by the test suite (and usable as a stand-in offline).
 *
 * The production implementation (supabaseBackend.ts) maps these onto tables
 * that already exist in the Supabase project, so going live needs no SQL:
 *   - key/value rows      → `delivery_settings` (store_id = key, settings = value)
 *   - stock counts        → `menu_stock`        (id = product id, remaining_count)
 *   - orders              → `orders`
 */
import type { Order } from '../orderStore'

export interface KvRow {
  key: string
  value: unknown
  updatedAt: string
}

export interface StockRow {
  id: string
  qty: number
  updatedAt?: string
}

export interface OrderQuery {
  /** Only orders created at or after this ISO time. */
  since?: string
  /** Only these order ids (customer devices). */
  ids?: string[]
  limit?: number
}

export interface SubscribeHandlers {
  kv?: (row: KvRow) => void
  stock?: (row: StockRow) => void
  order?: (order: Order) => void
}

export interface RemoteBackend {
  /** Rows whose key starts with `prefix`, newest first. `null` = the call failed. */
  listKv(prefix: string, opts?: { limit?: number; since?: string }): Promise<KvRow[] | null>
  putKv(rows: KvRow[]): Promise<boolean>
  listStock(): Promise<StockRow[] | null>
  putStock(rows: StockRow[]): Promise<boolean>
  fetchOrders(query: OrderQuery): Promise<Order[] | null>
  upsertOrders(orders: Order[]): Promise<boolean>
  /** `orderScope` 'all' for staff screens, a list of ids for a customer's own orders, null for none. */
  subscribe(handlers: SubscribeHandlers, orderScope: 'all' | string[] | null): () => void
}

/**
 * In-memory backend. `fail` switches every call to a failure so tests can
 * exercise the offline path; `emit` pushes rows to subscribers the way
 * Supabase realtime would.
 */
export function createMemoryBackend() {
  const kv = new Map<string, KvRow>()
  const stock = new Map<string, StockRow>()
  const orders = new Map<string, Order>()
  const subs = new Set<{ handlers: SubscribeHandlers; scope: 'all' | string[] | null }>()
  const state = { fail: false, calls: 0 }

  const emitKv = (row: KvRow) => subs.forEach((s) => s.handlers.kv?.(row))
  const emitStock = (row: StockRow) => subs.forEach((s) => s.handlers.stock?.(row))
  const emitOrder = (o: Order) =>
    subs.forEach((s) => {
      if (s.scope === 'all' || (Array.isArray(s.scope) && s.scope.includes(o.id))) s.handlers.order?.(o)
    })

  const backend: RemoteBackend & {
    kv: typeof kv
    stock: typeof stock
    orders: typeof orders
    state: typeof state
    emitKv: typeof emitKv
    emitStock: typeof emitStock
    emitOrder: typeof emitOrder
  } = {
    kv,
    stock,
    orders,
    state,
    emitKv,
    emitStock,
    emitOrder,
    async listKv(prefix, opts) {
      state.calls++
      if (state.fail) return null
      let rows = [...kv.values()].filter((r) => r.key.startsWith(prefix))
      if (opts?.since) rows = rows.filter((r) => r.updatedAt >= opts.since!)
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      return JSON.parse(JSON.stringify(opts?.limit ? rows.slice(0, opts.limit) : rows))
    },
    async putKv(rows) {
      state.calls++
      if (state.fail) return false
      rows.forEach((r) => {
        const copy = JSON.parse(JSON.stringify(r)) as KvRow
        kv.set(r.key, copy)
        emitKv(copy)
      })
      return true
    },
    async listStock() {
      state.calls++
      if (state.fail) return null
      return [...stock.values()].map((r) => ({ ...r }))
    },
    async putStock(rows) {
      state.calls++
      if (state.fail) return false
      rows.forEach((r) => {
        const copy = { ...r, updatedAt: r.updatedAt || new Date().toISOString() }
        stock.set(r.id, copy)
        emitStock(copy)
      })
      return true
    },
    async fetchOrders(query) {
      state.calls++
      if (state.fail) return null
      let list = [...orders.values()]
      if (query.ids) list = list.filter((o) => query.ids!.includes(o.id))
      if (query.since) list = list.filter((o) => o.createdAt >= query.since!)
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return JSON.parse(JSON.stringify(query.limit ? list.slice(0, query.limit) : list))
    },
    async upsertOrders(list) {
      state.calls++
      if (state.fail) return false
      list.forEach((o) => {
        const copy = JSON.parse(JSON.stringify(o)) as Order
        orders.set(o.id, copy)
        emitOrder(copy)
      })
      return true
    },
    subscribe(handlers, orderScope) {
      const entry = { handlers, scope: orderScope }
      subs.add(entry)
      return () => {
        subs.delete(entry)
      }
    },
  }
  return backend
}

export type MemoryBackend = ReturnType<typeof createMemoryBackend>
