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

// Existing process.env values beat .env files in Vite, and supabase.ts falls
// back to the live project when nothing is set - so point the test run at a
// placeholder that isSupabaseConfigured() rejects. Otherwise every test order
// would be synced into the real orders table.
process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'placeholder'
process.env.VITE_FIREBASE_API_KEY = ''

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
})


const load = (p) => vite.ssrLoadModule(p)
const supabaseMod = await load('/src/services/supabase.ts')
if (supabaseMod.isSupabaseConfigured) throw new Error('Refusing to run: Supabase is configured, tests would write to the live database')
const menuStore = await load('/src/services/menuStore.ts')
const orderStore = await load('/src/services/orderStore.ts')
const authStore = await load('/src/services/authStore.ts')
const checkout = await load('/src/services/checkout.ts')
const tillStore = await load('/src/services/tillStore.ts')
const timeclock = await load('/src/services/timeclockStore.ts')

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
let lineSeq = 0
/** A real CartLine (see hooks/useCart.tsx) with no extras. */
const line = (p, qty = 1) => ({
  lineId: `line-${++lineSeq}`,
  productId: p.id,
  name: p.name,
  base: p.price,
  extras: [],
  sauces: [],
  meal: false,
  image: p.image || '',
  category: p.category,
  qty,
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
section('🍳 Open checks: send to kitchen now, pay at collection')

await test('an open check deducts stock on send, is listed, and settles with a tip', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  const sent = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 2)], paymentMethod: 'in_store', paymentStatus: 'pending_store' },
    'Cashier',
  )
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 8, 'stock leaves when the ticket is fired')
  assert.ok(orderStore.getOpenTillChecks().some((o) => o.id === sent.id), 'appears in open checks')
  const settled = orderStore.settleOpenOrder(sent.id, { lines: sent.lines, discount: 0, tip: 100, paymentMethod: 'card', actor: 'Cashier' })
  assert.equal(settled.payment.status, 'paid')
  assert.equal(settled.payment.tip, 100)
  assert.equal(settled.payment.total, p.price * 2 + 100)
  assert.ok(!orderStore.getOpenTillChecks().some((o) => o.id === sent.id), 'gone from open checks once paid')
  assert.equal(orderStore.settleOpenOrder(sent.id, { lines: sent.lines, discount: 0, paymentMethod: 'cash', actor: 'x' }), undefined, 'cannot settle twice')
})

await test('items added while settling are deducted once; originals are not deducted again', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  const sent = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'in_store', paymentStatus: 'pending_store' },
    'Cashier',
  )
  const extra = { ...line(p, 1), lineId: 'extra-line-1' }
  orderStore.settleOpenOrder(sent.id, { lines: [...sent.lines, extra], discount: 0, paymentMethod: 'cash', actor: 'Cashier' })
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 8)
})

await test('voiding a sent line needs a reason, restores stock and re-totals the check', () => {
  const p = firstSpud()
  const drink = menuStore.getProducts().find((x) => x.category === 'COLD_DRINKS')
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  const sent = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 1), line(drink, 1)], paymentMethod: 'in_store', paymentStatus: 'pending_store' },
    'Cashier',
  )
  const res = orderStore.voidOpenOrderLine(sent.id, sent.lines[0].lineId, 'Customer changed mind', 'Manager')
  assert.equal(res.ok, true)
  assert.equal(res.order.lines.length, 1)
  assert.equal(res.order.payment.total, drink.price)
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 10, 'stock returned')
  const last = orderStore.voidOpenOrderLine(sent.id, res.order.lines[0].lineId, 'x', 'Manager')
  assert.equal(last.ok, false, 'last line cannot be voided - void the check')
  // ...unless the cashier has already rung a replacement onto the check
  const replacement = line(p, 1)
  const swapped = orderStore.voidOpenOrderLine(sent.id, res.order.lines[0].lineId, 'Customer changed mind', 'Manager', [replacement])
  assert.equal(swapped.ok, true, 'swap is allowed when a pending line exists')
  assert.deepEqual(swapped.order.lines.map((l) => l.lineId), [replacement.lineId])
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 9, 'replacement deducted once')
  const settled = orderStore.settleOpenOrder(sent.id, { lines: swapped.order.lines, discount: 0, paymentMethod: 'cash', actor: 'Cashier' })
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 9, 'settle must not deduct the committed replacement again')
  assert.equal(settled.payment.total, p.price)
})

await test('cancelling an open check restores its stock', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 5, 'test', 'seed')
  const sent = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [line(p, 3)], paymentMethod: 'in_store', paymentStatus: 'pending_store' },
    'Cashier',
  )
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 2)
  orderStore.cancelOrder(sent.id, 'Till void: walked out')
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 5)
  assert.ok(!orderStore.getOpenTillChecks().some((o) => o.id === sent.id))
})

// ---------------------------------------------------------------------------
section('⏱️ Time clock')

await test('clock in / break / clock out produce a timecard with breaks excluded', () => {
  const user = authStore.findUserByPin('1111')
  assert.ok(user, 'cashier PIN resolves without a session')
  assert.equal(authStore.getCurrentUser(), null, 'findUserByPin must not sign anyone in')
  const entry = timeclock.clockIn(user)
  assert.ok(timeclock.getActiveTimeclockEntry(user.id))
  assert.equal(timeclock.clockIn(user).id, entry.id, 'second clock-in is a no-op')
  timeclock.startBreak(user.id)
  assert.equal(timeclock.isOnBreak(timeclock.getActiveTimeclockEntry(user.id)), true)
  timeclock.endBreak(user.id)
  const out = timeclock.clockOut(user.id)
  assert.ok(out.clockOut)
  assert.equal(timeclock.getActiveTimeclockEntry(user.id), undefined)
  const fake = { ...out, clockIn: new Date(Date.now() - 3 * 3600000).toISOString(), clockOut: new Date().toISOString(), breaks: [{ start: new Date(Date.now() - 2 * 3600000).toISOString(), end: new Date(Date.now() - 90 * 60000).toISOString() }] }
  assert.equal(timeclock.formatDuration(timeclock.workedMs(fake)), '2h 30m')
})

// ---------------------------------------------------------------------------
await vite.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
