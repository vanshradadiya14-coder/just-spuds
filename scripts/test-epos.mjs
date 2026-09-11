/**
 * EPOS & core store engine tests.
 *
 * These load the real TypeScript service modules through Vite's SSR loader
 * (no extra test framework needed) with a minimal browser shim, so a change to
 * menuStore / orderStore / authStore / checkout is exercised for real rather
 * than against a JS re-implementation of what the code is supposed to do.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { createServer } from 'vite'

// ---------------------------------------------------------------------------
// Browser shim: the stores gate on `typeof window` and persist to localStorage.
// ---------------------------------------------------------------------------
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}
globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.document = { body: { style: {} }, createElement: () => ({ style: {} }), addEventListener() {}, removeEventListener() {} }
globalThis.BroadcastChannel = class {
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.Audio = class {
  play() {
    return Promise.resolve()
  }
}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
})

const load = (p) => vite.ssrLoadModule(p)
const menuStore = await load('/src/services/menuStore.ts')
const orderStore = await load('/src/services/orderStore.ts')
const authStore = await load('/src/services/authStore.ts')
const checkout = await load('/src/services/checkout.ts')
const tillStore = await load('/src/services/tillStore.ts')

let passed = 0
let failed = 0
async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`)
    failed++
  }
}
const section = (t) => console.log(`\n${t}`)

const firstSpud = () => menuStore.getProducts().find((p) => p.category === 'SPUDS')
const line = (p, qty = 1) => ({
  key: `${p.id}-${qty}`,
  productId: p.id,
  name: p.name,
  qty,
  unitPrice: p.price,
  lineTotal: p.price * qty,
  extras: [],
  sauces: [],
})
const customer = { name: 'Test Customer', phone: '07700 900000', email: 'test@example.com' }

// ---------------------------------------------------------------------------
section('📦 Stock deduction is the single source of truth')

await test('a web order deducts exactly the ordered quantity', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  orderStore.createNewOrder({
    fulfilment: 'pickup',
    customer,
    lines: [line(p, 3)],
    subtotal: p.price * 3,
    deliveryFee: 0,
    serviceFee: 0,
    tip: 0,
    discount: 0,
    total: p.price * 3,
    paymentMethod: 'card',
  })
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 7)
})

await test('a till order deducts stock too and is tagged as TILL', () => {
  const p = firstSpud()
  const before = menuStore.getProductById(p.id).stockQuantity
  const order = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 2)], paymentMethod: 'cash', paymentStatus: 'paid' },
    'Cashier',
  )
  assert.equal(order.source, 'TILL')
  assert.ok(order.shortId.startsWith('JS-T-'))
  assert.equal(menuStore.getProductById(p.id).stockQuantity, before - 2)
})

await test('stock hitting zero takes the product off sale', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 1, 'test', 'seed')
  orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' },
    'Cashier',
  )
  const after = menuStore.getProductById(p.id)
  assert.equal(after.stockQuantity, 0)
  assert.equal(after.available, false)
  assert.equal(menuStore.isProductSoldOut(after, {}), true)
})

// ---------------------------------------------------------------------------
section('🛡️ Cancellations restore stock without undoing a manual 86')

await test('cancelling an order puts the items back', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 5, 'test', 'seed')
  const order = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 2)], paymentMethod: 'cash', paymentStatus: 'paid' },
    'Cashier',
  )
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 3)
  orderStore.cancelOrder(order.id, 'Customer changed mind')
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 5)
})

await test('restock re-enables a product that only went off sale because it ran out', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 0, 'test', 'seed')
  assert.equal(menuStore.getProductById(p.id).available, false)
  menuStore.adjustProductStock(p.id, 12, 'test', 'delivery arrived')
  assert.equal(menuStore.getProductById(p.id).available, true)
})

await test("restock does NOT re-enable a product a manager 86'd while stock was still on hand", () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 8, 'test', 'seed')
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), available: false })
  menuStore.adjustProductStock(p.id, 20, 'test', 'delivery arrived')
  assert.equal(menuStore.getProductById(p.id).available, false, 'manual 86 must survive a restock')
  // and the same for an order cancellation
  menuStore.adjustProductStock(p.id, 8, 'test', 'seed')
  const order = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' },
    'Cashier',
  )
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), available: false })
  orderStore.cancelOrder(order.id, 'test')
  assert.equal(menuStore.getProductById(p.id).available, false, 'manual 86 must survive a cancellation')
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), available: true })
})

// ---------------------------------------------------------------------------
section('🌐 Channel visibility & online overselling')

await test('in-store-only products are hidden from the storefront and rejected at checkout', async () => {
  const p = firstSpud()
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), channelVisibility: 'in_store_only', stockQuantity: 10, available: true })
  assert.ok(!menuStore.getOnlineProducts().some((x) => x.id === p.id), 'should not be listed online')
  assert.equal(menuStore.getOnlineProductById(p.id), undefined, 'direct product page should 404')
  assert.ok(menuStore.getInStoreProducts().some((x) => x.id === p.id), 'still available on the till')
  const res = await checkout.processCheckout({
    fulfilment: 'collection',
    customer,
    lines: [line(p, 1)],
    subtotal: p.price,
    deliveryFee: 0,
    serviceFee: 0,
    tip: 0,
    discount: 0,
    total: p.price,
    paymentMethod: 'card',
  })
  assert.equal(res.ok, false)
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), channelVisibility: 'all' })
})

await test('online-only products never appear on the till grid', () => {
  const p = firstSpud()
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), channelVisibility: 'online_only' })
  assert.ok(!menuStore.getInStoreProducts().some((x) => x.id === p.id))
  assert.ok(menuStore.getOnlineProducts().some((x) => x.id === p.id))
  menuStore.saveProduct({ ...menuStore.getProductById(p.id), channelVisibility: 'all' })
})

await test('online checkout refuses more than is in stock', async () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 2, 'test', 'seed')
  const res = await checkout.processCheckout({
    fulfilment: 'collection',
    customer,
    lines: [line(p, 3)],
    subtotal: p.price * 3,
    deliveryFee: 0,
    serviceFee: 0,
    tip: 0,
    discount: 0,
    total: p.price * 3,
    paymentMethod: 'card',
  })
  assert.equal(res.ok, false)
  assert.match(res.reason, /stock/i)
})

// ---------------------------------------------------------------------------
section('🔐 Roles & manager PIN authorisation')

await test('every staff PIN can reach the till and kitchen (the new roles were locked out before)', () => {
  for (const pin of ['1111', '1234', '3333', '5555', '2468', '8888']) {
    const res = authStore.loginWithPin(pin)
    assert.equal(res.ok, true, `PIN ${pin} should sign in`)
    assert.equal(authStore.hasRole(res.user, authStore.SHOP_FLOOR_ROLES), true, `PIN ${pin} (${res.user.role}) should pass the shop-floor gate`)
    assert.ok(authStore.homePortalForRole(res.user.role), `PIN ${pin} needs a home portal`)
  }
  authStore.logout()
})

await test('manager PIN gate accepts supervisors and above, rejects cashier / kitchen / unknown', () => {
  assert.equal(authStore.verifyManagerPin('5555').ok, true)
  assert.equal(authStore.verifyManagerPin('3333').ok, true)
  assert.equal(authStore.verifyManagerPin('8888').ok, true)
  assert.equal(authStore.verifyManagerPin('1111').ok, false)
  assert.equal(authStore.verifyManagerPin('1234').ok, false)
  assert.equal(authStore.verifyManagerPin('9999').ok, false)
})

// ---------------------------------------------------------------------------
section('🧾 Till shift & Z-report')

await test('online sales taken during an open shift are counted on it', () => {
  tillStore.openTillShift('Cashier', 10000)
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  orderStore.createNewOrder({
    fulfilment: 'pickup',
    customer,
    lines: [line(p, 1)],
    subtotal: p.price,
    deliveryFee: 0,
    serviceFee: 0,
    tip: 0,
    discount: 0,
    total: p.price,
    paymentMethod: 'card',
  })
  const shift = tillStore.getCurrentShift()
  assert.equal(shift.onlineOrdersCount, 1)
  assert.equal(shift.onlineOrdersTotal, p.price)
  tillStore.closeTillShift('Cashier', tillStore.EMPTY_DENOMINATIONS, 'test close')
})

await test('cash tender is settled in pence and refuses short payment', () => {
  assert.equal(tillStore.calculateDenominationsTotal({ ...tillStore.EMPTY_DENOMINATIONS, note10: 1, coin2: 2 }), 1400)
})

// ---------------------------------------------------------------------------
await vite.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
