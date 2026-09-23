/**
 * READ-ONLY check that the sync adapter's queries are valid against the live
 * Supabase project (filters, ordering, limits, column names). Never writes.
 *
 * Run with: node scripts/probe-sync-readonly.mjs
 */
import { createServer } from 'vite'

globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
})
try {
  const { createSupabaseBackend } = await vite.ssrLoadModule('/src/services/sync/supabaseBackend.ts')
  const b = createSupabaseBackend()
  if (!b) throw new Error('Supabase is not configured in this environment')
  const since = new Date(Date.now() - 86400000).toISOString()
  const results = {
    docs: await b.listKv('just_spuds::doc::'),
    privateDocs: await b.listKv('just_spuds::priv::'),
    auditSince: await b.listKv('just_spuds::rec::audit::', { limit: 5, since }),
    stock: await b.listStock(),
    ordersSince: await b.fetchOrders({ since, limit: 3 }),
    ordersByIds: await b.fetchOrders({ ids: ['ord-does-not-exist'] }),
    ordersNoIds: await b.fetchOrders({ ids: [] }),
  }
  let ok = true
  for (const [name, value] of Object.entries(results)) {
    const fine = Array.isArray(value)
    ok &&= fine
    console.log(`${fine ? '✅' : '❌'} ${name.padEnd(12)} ${fine ? `${value.length} row(s)` : 'query failed'}`)
  }
  process.exitCode = ok ? 0 : 1
} finally {
  await vite.close()
}
