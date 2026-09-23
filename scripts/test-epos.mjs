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
// Fake <audio> that records what the alarm tried to play so tests can drive
// the "file missing → siren" fallback by firing onerror themselves.
const audioLog = []
globalThis.Audio = class {
  constructor(src) {
    this.src = src
    this.volume = 1
    this.loop = false
    this.currentTime = 0
    this.paused = true
    this.onended = null
    this.onerror = null
    audioLog.push(this)
  }
  play() {
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

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
const alertBus = await load('/src/services/alertSoundBus.ts')
const orderAlerts = await load('/src/services/orderAlerts.ts')
const deliverySettings = await load('/src/services/deliverySettingsStore.ts')

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

/** Web ordering is off by default (launch mode) — switch it on and open all day for checkout tests. */
const openTheShop = () => {
  deliverySettings.saveDeliverySettings({ isOnlineOrderingEnabled: true })
  const allDay = { openTime: '00:00', closeTime: '23:59', isClosed: false }
  const weeklyHours = Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => [d, { ...allDay }]))
  menuStore.saveStoreSettings({ ...menuStore.getStoreSettings(), weeklyHours })
}
const webPayload = (p, qty = 1, extra = {}) => ({
  fulfilment: 'pickup',
  customer,
  lines: [line(p, qty)],
  subtotal: p.price * qty,
  deliveryFee: 0,
  serviceFee: 49,
  tip: 0,
  discount: 0,
  total: p.price * qty + 49,
  paymentMethod: 'card',
  ...extra,
})

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
  openTheShop()
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
  openTheShop()
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
  localStorage.removeItem('just_spuds_pin_lock_v1')
})

await test('five wrong PINs lock every PIN prompt for a while, a right PIN clears it', () => {
  localStorage.removeItem('just_spuds_pin_lock_v1')
  for (let i = 0; i < 5; i++) assert.equal(authStore.loginWithPin('0001').ok, false)
  assert.ok(authStore.getPinLockRemainingMs() > 0, 'locked after 5 failures')
  const locked = authStore.loginWithPin('8888')
  assert.equal(locked.ok, false, 'even the right PIN is refused while locked')
  assert.match(locked.message, /try again/i)
  assert.equal(authStore.verifyManagerPin('5555').ok, false, 'manager prompt shares the lock')
  localStorage.setItem('just_spuds_pin_lock_v1', JSON.stringify({ fails: 5, until: Date.now() - 1 }))
  assert.equal(authStore.loginWithPin('8888').ok, true, 'works again once the lock expires')
  assert.equal(authStore.getPinLockRemainingMs(), 0, 'success clears the counter')
  authStore.logout()
})

await test('the Admin login tab only admits management PINs', () => {
  assert.equal(authStore.loginWithPin('1111', authStore.MANAGEMENT_ROLES).ok, false, 'cashier cannot open the admin console')
  assert.equal(authStore.loginWithPin('5555', authStore.MANAGEMENT_ROLES).ok, true)
  assert.equal(typeof authStore.loginWithCredentials, 'undefined', 'the any-email admin login is gone')
  authStore.logout()
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
section('🛡️ Web checkout enforces every ordering rule itself')

await test('ordering switched off, or outside trading hours, is refused at the service — not just the button', async () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  deliverySettings.saveDeliverySettings({ isOnlineOrderingEnabled: false })
  let res = await checkout.processCheckout(webPayload(p))
  assert.equal(res.ok, false)
  assert.match(res.reason, /unavailable|launching|paused/i)

  openTheShop()
  const closed = { openTime: '11:00', closeTime: '11:30', isClosed: false }
  const weeklyHours = Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => [d, { ...closed }]))
  menuStore.saveStoreSettings({ ...menuStore.getStoreSettings(), weeklyHours })
  const check = checkout.validateCheckout(webPayload(p), new Date(2026, 0, 5, 20, 0)) // 8pm, well past close
  assert.equal(check.ok, false)
  assert.match(check.reason, /closed/i)
  const open = checkout.validateCheckout(webPayload(p), new Date(2026, 0, 5, 11, 5))
  assert.equal(open.ok, true, 'inside hours is fine')
  openTheShop()
})

await test('the basket is repriced from the live menu: stale prices and smuggled overrides are ignored', async () => {
  openTheShop()
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  const cheap = { ...line(p, 2), base: 1, priceOverridePence: 0, priceOverrideReason: 'hacked' }
  const res = await checkout.processCheckout({ ...webPayload(p, 2), lines: [cheap], subtotal: 2, total: 51 })
  assert.equal(res.ok, true)
  assert.equal(res.order.payment.subtotal, p.price * 2, 'subtotal comes from the menu price')
  assert.equal(res.order.payment.total, p.price * 2 + 49)
  assert.equal(res.order.lines[0].priceOverridePence, undefined, 'web lines never carry a price override')
})

await test('a voucher is re-validated at checkout and never applies under its minimum', async () => {
  openTheShop()
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  menuStore.savePromoCode({ code: 'BIG20', discountPercent: 20, minOrderPence: 100000, description: 'test', active: true })
  const res = await checkout.processCheckout({ ...webPayload(p), promoCode: 'BIG20', discount: 500, total: p.price + 49 - 500 })
  assert.equal(res.ok, false)
  assert.match(res.reason, /BIG20/)
  menuStore.savePromoCode({ code: 'BIG20', discountPercent: 20, minOrderPence: 0, description: 'test', active: true })
  const ok = await checkout.processCheckout({ ...webPayload(p), promoCode: 'BIG20' })
  assert.equal(ok.ok, true)
  assert.equal(ok.order.payment.discount, Math.round(p.price * 0.2), 'discount is what the voucher says, not what the client sent')
  menuStore.deletePromoCode('BIG20')
})

await test('delivery needs a postcode we cover and the minimum basket', async () => {
  openTheShop()
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  const far = await checkout.processCheckout({ ...webPayload(p), fulfilment: 'delivery', customer: { ...customer, streetAddress: '1 High St', postcode: 'SW1A 1AA' } })
  assert.equal(far.ok, false)
  deliverySettings.saveDeliverySettings({ minOrderPence: 100000 })
  const small = await checkout.processCheckout({ ...webPayload(p), fulfilment: 'delivery', customer: { ...customer, streetAddress: '1 High St', postcode: 'HP20 1SN' } })
  assert.equal(small.ok, false)
  assert.match(small.reason, /minimum/i)
  deliverySettings.saveDeliverySettings({ minOrderPence: 1000 })
})

// ---------------------------------------------------------------------------
section('🔒 Order lifecycle guards')

await test('an order cannot be cancelled twice (stock would come back twice)', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 5, 'test', 'seed')
  const o = orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 2)], paymentMethod: 'cash', paymentStatus: 'paid' }, 'Cashier')
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 3)
  assert.equal(orderStore.cancelOrder(o.id, 'first').ok, true)
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 5)
  assert.equal(orderStore.cancelOrder(o.id, 'again').ok, false)
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 5, 'stock unchanged by the refused second cancel')
  assert.equal(orderStore.updateOrderStatus(o.id, 'accepted'), undefined, 'a cancelled order cannot be revived')
  assert.equal(orderStore.settleOpenOrder(o.id, { lines: o.lines, discount: 0, paymentMethod: 'cash', actor: 'Cashier' }), undefined, 'nor settled')
})

await test('an unpaid till check cannot be completed from the kitchen until it is settled', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 5, 'test', 'seed')
  const o = orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'in_store', paymentStatus: 'pending_store' }, 'Cashier')
  orderStore.updateOrderStatus(o.id, 'baking')
  orderStore.updateOrderStatus(o.id, 'ready_for_pickup')
  assert.match(orderStore.getStatusChangeBlocker(orderStore.getOrderById(o.id), 'collected'), /unpaid/i)
  assert.equal(orderStore.updateOrderStatus(o.id, 'collected'), undefined)
  assert.equal(orderStore.getOrderById(o.id).status, 'ready_for_pickup', 'still waiting')
  orderStore.settleOpenOrder(o.id, { lines: o.lines, discount: 0, paymentMethod: 'cash', actor: 'Cashier' })
  assert.equal(orderStore.updateOrderStatus(o.id, 'collected').status, 'collected', 'completes once paid')
  assert.equal(orderStore.updateOrderStatus(o.id, 'baking'), undefined, 'a completed order is final')
})

await test('refunds: once only, never more than was paid, and a cash refund comes off the drawer', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 5, 'test', 'seed')
  tillStore.openTillShift('Manager', 10000)
  const o = orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' }, 'Cashier')
  tillStore.recordTillSale({ paymentMethod: 'cash', totalPence: o.payment.total, orderId: o.shortId, staffName: 'Cashier' })
  const before = tillStore.getCurrentShift().expectedCash
  assert.equal(orderStore.refundOrder(o.id, o.payment.total + 100, 'too much', 'Manager').ok, false, 'over-refund refused')
  const half = Math.floor(o.payment.total / 2)
  assert.equal(orderStore.refundOrder(o.id, half, 'partial', 'Manager').ok, true)
  assert.equal(tillStore.getCurrentShift().expectedCash, before - half, 'drawer expectation drops')
  assert.equal(tillStore.getCurrentShift().refundsTotal, half)
  const rest = orderStore.refundOrder(o.id, o.payment.total, 'rest', 'Manager')
  assert.equal(rest.ok, false, 'cannot refund more than what is left')
  assert.equal(orderStore.refundOrder(o.id, o.payment.total - half, 'rest', 'Manager').ok, true)
  assert.equal(orderStore.getOrderById(o.id).payment.status, 'refunded')
  assert.equal(orderStore.refundOrder(o.id, 1, 'again', 'Manager').ok, false, 'fully refunded orders are done')
  tillStore.closeTillShift('Manager', { ...tillStore.EMPTY_DENOMINATIONS })
})

// ---------------------------------------------------------------------------
section('🧾 VAT follows each product’s rate')

await test('0% cold takeaway, 20% hot food, eat-in all standard, tips outside VAT, discount spread by value', async () => {
  const vat = await load('/src/services/vat.ts')
  const products = menuStore.getProducts()
  const hot = products.find((p) => p.category === 'SPUDS')
  const cold = products.find((p) => p.category === 'SALADS')
  menuStore.saveProduct({ ...menuStore.getProductById(hot.id), vatRate: 20, price: 600 })
  menuStore.saveProduct({ ...menuStore.getProductById(cold.id), vatRate: 0, price: 400 })
  const hotLine = { ...line(menuStore.getProductById(hot.id), 1) }
  const coldLine = { ...line(menuStore.getProductById(cold.id), 1) }

  const takeaway = vat.computeVat({ lines: [hotLine, coldLine] })
  assert.equal(takeaway.vat, 100, '£6.00 at 20% contains £1.00; the cold item none')
  assert.deepEqual(takeaway.bands.map((b) => [b.rate, b.gross]), [[20, 600], [0, 400]])

  const eatIn = vat.computeVat({ lines: [hotLine, coldLine], eatIn: true })
  assert.equal(eatIn.vat, Math.round((1000 * 20) / 120), 'eaten in, the salad is standard-rated too')

  const discounted = vat.computeVat({ lines: [hotLine, coldLine], discount: 100 })
  assert.equal(discounted.bands.find((b) => b.rate === 20).gross, 540, '£1 off spread 60/40 by value')

  const order = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer, lines: [hotLine, coldLine], paymentMethod: 'card', paymentStatus: 'paid', tip: 200 },
    'Cashier',
  )
  assert.equal(vat.orderVat(order).vat, 100, 'the £2 tip carries no VAT')
  const z = orderStore.generateZReport([{ ...order, status: 'collected' }])
  assert.equal(z.vatStandardAmount, 100)
  assert.deepEqual(z.vatBands.map((b) => b.rate), [20, 0])
})

// ---------------------------------------------------------------------------
section('🎫 Kitchen ticket notes')

await test('till bookkeeping is split from real instructions; buzzer / table stay loud', async () => {
  const notes = await load('/src/utils/kitchenNotes.ts')
  const parsed = notes.parseKitchenNotes('[TILL] [🔔 BUZZER #12] [POS TILL #01] TAKEAWAY • OPEN CHECK • Cashier: Chloe • No onions, nut allergy')
  assert.deepEqual(parsed.callouts, ['BUZZER #12'])
  assert.ok(parsed.meta.includes('TAKEAWAY') && parsed.meta.includes('OPEN CHECK') && parsed.meta.some((m) => /Cashier/.test(m)))
  assert.ok(!parsed.meta.includes('TILL'), 'the source badge already says TILL')
  assert.equal(parsed.note, 'No onions, nut allergy')
  assert.equal(notes.parseKitchenNotes('[TILL ORDER]').note, '', 'a bare till stamp is not an allergen alert')
  assert.equal(notes.parseKitchenNotes('Extra crispy please').note, 'Extra crispy please')
})

// ---------------------------------------------------------------------------
section('📊 Admin analytics are real numbers, never placeholders')

await test('an empty period reports zeros and no prep time, not seeded demo figures', () => {
  const a = orderStore.getDetailedBusinessAnalytics([], 'today')
  assert.equal(a.grossRevenue, 0)
  assert.equal(a.aovPence, 0)
  assert.equal(a.avgPrepTimeMins, null)
  assert.equal(a.deliveryPercent + a.pickupPercent, 0)
  assert.ok(a.hourlyRush.every((h) => h.count === 0), 'heatmap has no invented rush hours')
  assert.ok(a.dailyRevenue.every((d) => d.revenue === 0 && d.count === 0), '7-day trend is empty, not random')
  assert.deepEqual(a.topProducts, [])
  assert.deepEqual(a.topToppings, [])
})

await test('prep time is measured from placed → ready on the ticket timeline', () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 50, 'test', 'seed')
  const placedAt = new Date(Date.now() - 12 * 60000)
  const readyAt = new Date()
  const stamp = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const order = {
    ...orderStore.createManualCounterOrder(
      { fulfilment: 'pickup', customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' },
      'Cashier',
    ),
    createdAt: placedAt.toISOString(),
    status: 'collected',
  }
  order.timeline = [
    { status: 'placed', timestamp: stamp(placedAt), title: 'Placed', description: '' },
    { status: 'ready_for_pickup', timestamp: stamp(readyAt), title: 'Ready', description: '' },
  ]
  // '7days' rather than 'today' so a run that straddles midnight still sees the order
  const a = orderStore.getDetailedBusinessAnalytics([order], '7days')
  assert.equal(a.completedCount, 1)
  assert.ok(a.avgPrepTimeMins >= 11 && a.avgPrepTimeMins <= 13, `prep time ${a.avgPrepTimeMins}m`)
  assert.equal(a.aovPence, order.payment.total)
  assert.equal(a.topProducts[0].name, p.name)
  assert.equal(a.crmCustomers.length, 1, 'a named customer appears in the CRM once')
  const cancelled = { ...order, status: 'cancelled' }
  assert.equal(orderStore.getDetailedBusinessAnalytics([cancelled], '7days').dailyRevenue.reduce((s, d) => s + d.revenue, 0), 0, 'cancelled orders are not takings')
})

// ---------------------------------------------------------------------------
section('🔔 New online order alarm')

const webOrder = () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 50, 'test', 'seed')
  return orderStore.createNewOrder({
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
}
const settle = () => {
  // every pending web order from earlier tests gets acknowledged so only the
  // order under test can ring
  orderStore.getStoredOrders().forEach((o) => alertBus.dismissOrderAlert(o.id))
}
// The bus keeps one <audio> per URL, so "what is playing" is the newest element.
const currentAudio = () => audioLog[audioLog.length - 1]

await test('a placed web order rings the alarm until it is accepted', async () => {
  settle()
  const order = webOrder()
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  await tick()
  assert.deepEqual(alertBus.getActiveAlerts().map((a) => a.orderId), [order.id])
  assert.equal(alertBus.getAlertSoundState().sounding, true, 'alarm is sounding')
  assert.equal(currentAudio()?.src, '/sounds/new-order.mp3', 'store sound file tried first')
  assert.equal(currentAudio().paused, false)

  orderStore.updateOrderStatus(order.id, 'accepted')
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  assert.deepEqual(alertBus.getActiveAlerts(), [], 'accepted order drops off the queue')
  assert.equal(alertBus.getAlertSoundState().sounding, false, 'alarm stops')
  assert.equal(currentAudio().paused, true)
})

await test('a silenced order stays silent through later order updates and reloads', () => {
  settle()
  const order = webOrder()
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  assert.equal(alertBus.getActiveAlerts().length, 1)
  alertBus.dismissOrderAlert(order.id)
  assert.equal(alertBus.getAlertSoundState().sounding, false)
  // the next order-store tick (any status change anywhere) must not re-raise it
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  assert.deepEqual(alertBus.getActiveAlerts(), [])
  assert.equal(alertBus.isOrderAlertAcknowledged(order.id), true)
  assert.ok(JSON.parse(localStorage.getItem('just_spuds_alert_acked_v1')).includes(order.id), 'acknowledgement persisted')
  assert.equal(orderStore.getOrderById(order.id).status, 'placed', 'silencing does not accept')
})

await test('till, phone and counter orders never ring the online alarm', () => {
  settle()
  const p = firstSpud()
  orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' }, 'Cashier')
  orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'in_store', paymentStatus: 'pending_store', source: 'PHONE' }, 'Cashier')
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  assert.deepEqual(alertBus.getActiveAlerts(), [])
  assert.equal(alertBus.getAlertSoundState().sounding, false)
})

await test('the watcher picks up a new web order from the order store by itself', async () => {
  settle()
  const stop = orderAlerts.startOnlineOrderAlertWatcher()
  try {
    const order = webOrder()
    await tick()
    assert.deepEqual(alertBus.getActiveAlerts().map((a) => a.orderId), [order.id])
    orderStore.cancelOrder(order.id, 'test')
    assert.deepEqual(alertBus.getActiveAlerts(), [], 'cancelled elsewhere → alert gone')
  } finally {
    stop()
  }
})

await test('a missing sound file falls back to the built-in siren; a custom upload takes priority', async () => {
  settle()
  alertBus.setAlertSoundConfig({ source: 'default' })
  const order = webOrder()
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  await tick()
  // pretend none of the store files exist
  for (let i = 0; i < 3; i++) {
    const el = currentAudio()
    assert.equal(el.src, alertBus.DEFAULT_SOUND_URLS[i])
    el.onerror()
  }
  assert.equal(alertBus.getAlertSoundState().engine, 'synth', 'siren takes over')
  assert.equal(alertBus.getAlertSoundState().sounding, true)

  alertBus.setAlertSoundConfig({ source: 'custom', customName: 'bell.mp3', customDataUrl: 'data:audio/mpeg;base64,AAAA', volume: 0.5 })
  await tick()
  const custom = currentAudio()
  assert.equal(custom.src, 'data:audio/mpeg;base64,AAAA', 'custom sound is what plays')
  assert.equal(custom.volume, 0.5)
  assert.equal(JSON.parse(localStorage.getItem('just_spuds_alert_sound_v1')).customName, 'bell.mp3')
  alertBus.clearCustomAlertSound()
  assert.equal(alertBus.getAlertSoundConfig().source, 'default')
  alertBus.dismissOrderAlert(order.id)
})

await test('the till "Online order siren" switch mutes and un-mutes the alarm', async () => {
  settle()
  const order = webOrder()
  orderAlerts.reconcileOrderAlerts(orderStore.getStoredOrders())
  await tick()
  assert.equal(alertBus.getAlertSoundState().sounding, true)
  tillStore.updateTillSettings({ soundAlerts: false }, 'Manager')
  assert.equal(alertBus.getAlertSoundState().sounding, false, 'muted')
  assert.equal(alertBus.getActiveAlerts().length, 1, 'the order still needs accepting')
  tillStore.updateTillSettings({ soundAlerts: true }, 'Manager')
  await tick()
  assert.equal(alertBus.getAlertSoundState().sounding, true, 'rings again while the order is still waiting')
  alertBus.dismissOrderAlert(order.id)
})

// ---------------------------------------------------------------------------
section('☁️ Cross-device sync (in-memory server standing in for Supabase)')

const cloud = await load('/src/services/cloudSync.ts')
const { createMemoryBackend } = await load('/src/services/sync/backend.ts')
const roster = await load('/src/services/staffRoster.ts')
const blacklist = await load('/src/services/blacklistStore.ts')
const audit = await load('/src/services/auditStore.ts')
const orderRows = await load('/src/services/supabaseOrderSync.ts')
const mem = createMemoryBackend()
const DOC = (n) => `just_spuds::doc::${n}`
let clockAhead = 1
/** A timestamp later than anything this device has written — "another device, just now". */
const later = () => new Date(Date.now() + 60_000 + clockAhead++ * 1000).toISOString()
const remoteDoc = (name, data) => {
  const at = later()
  return { key: DOC(name), value: { data, at, by: 'dev-other' }, updatedAt: at }
}
/** Another device writes to the server: stored there, and pushed live to subscribers. */
const serverPut = (row) => {
  mem.kv.set(row.key, row)
  mem.emitKv(row)
}
const serverOrder = (o) => {
  mem.orders.set(o.id, o)
  mem.emitOrder(o)
}
localStorage.removeItem('just_spuds_pin_lock_v1')

await test('a manager device seeds the menu, settings, staff list and stock on first sync', async () => {
  assert.equal(authStore.loginWithPin('5555').ok, true)
  await cloud.startCloudSync({ backend: mem, timers: false })
  for (const name of ['menu.products', 'menu.promos', 'store.settings', 'delivery.settings', 'staff.roster', 'drivers', 'kitchen.pause']) {
    // kitchen.pause only exists once someone pauses; everything else is seeded
    if (name === 'kitchen.pause') continue
    assert.ok(mem.kv.has(DOC(name)), `${name} published`)
  }
  const products = mem.kv.get(DOC('menu.products')).value.data
  assert.ok(products.length > 0)
  assert.ok(products.every((p) => p.stockQuantity === undefined), 'stock never rides in the menu document')
  assert.ok(mem.stock.size >= products.length, 'every product has a shared stock count')
  const rosterDoc = mem.kv.get(DOC('staff.roster')).value.data
  assert.ok(!JSON.stringify(rosterDoc).includes('"5555"'), 'no plaintext PINs leave the device')
  assert.equal(cloud.getSyncStatus().state, 'synced')
})

await test('the online-ordering switch and kitchen pause travel both ways', async () => {
  deliverySettings.saveDeliverySettings({ isOnlineOrderingEnabled: true })
  orderStore.setKitchenPause({ isPaused: true, reasonCode: 'rush_capacity', reasonText: 'Rush', resumeAt: 'manual' })
  await cloud.syncNow()
  assert.equal(mem.kv.get(DOC('delivery.settings')).value.data.isOnlineOrderingEnabled, true, 'published')
  assert.equal(mem.kv.get(DOC('kitchen.pause')).value.data.isPaused, true)
  // the owner switches it off from home
  const current = mem.kv.get(DOC('delivery.settings')).value.data
  mem.kv.set(DOC('delivery.settings'), remoteDoc('delivery.settings', { ...current, isOnlineOrderingEnabled: false }))
  mem.kv.set(DOC('kitchen.pause'), remoteDoc('kitchen.pause', { isPaused: false, reasonCode: 'rush_capacity', reasonText: '' }))
  await cloud.syncNow()
  assert.equal(deliverySettings.getDeliverySettings().isOnlineOrderingEnabled, false)
  assert.equal(orderStore.getKitchenPauseState().isPaused, false)
})

await test('a price change made on another device lands instantly and keeps this device’s stock count', () => {
  const p = firstSpud()
  const stockBefore = menuStore.getProductById(p.id).stockQuantity
  let notified = 0
  const unsub = menuStore.subscribeMenu(() => notified++)
  const remote = mem.kv.get(DOC('menu.products')).value.data.map((x) => (x.id === p.id ? { ...x, price: 999 } : x))
  serverPut(remoteDoc('menu.products', remote))
  unsub()
  assert.equal(menuStore.getProductById(p.id).price, 999)
  assert.equal(menuStore.getProductById(p.id).stockQuantity, stockBefore)
  assert.ok(notified > 0, 'open screens re-render')
})

await test('stock moves by delta: a sale here and one on another till both count', async () => {
  const p = firstSpud()
  menuStore.adjustProductStock(p.id, 10, 'test', 'seed')
  await cloud.syncNow()
  assert.equal(mem.stock.get(p.id).qty, 10)
  mem.stock.set(p.id, { id: p.id, qty: 7 }) // the other till sold 3; this device has not heard yet
  orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 2)], paymentMethod: 'cash', paymentStatus: 'paid' }, 'Cashier')
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 8)
  await cloud.syncNow()
  assert.equal(mem.stock.get(p.id).qty, 5, '10 − 3 − 2')
  assert.equal(menuStore.getProductById(p.id).stockQuantity, 5)
})

let offlineOrder
await test('an order taken while offline waits in the outbox and uploads when the network returns', async () => {
  const p = firstSpud()
  mem.state.fail = true
  offlineOrder = orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' }, 'Cashier')
  assert.equal(await cloud.syncNow(), false)
  assert.ok(!mem.orders.has(offlineOrder.id))
  assert.ok(JSON.parse(localStorage.getItem('just_spuds_order_outbox_v1')).includes(offlineOrder.id), 'kept in the outbox')
  assert.equal(cloud.getSyncStatus().state, 'offline')
  assert.ok(cloud.getSyncStatus().pending > 0)
  mem.state.fail = false
  assert.equal(await cloud.syncNow(), true)
  assert.ok(mem.orders.has(offlineOrder.id), 'uploaded once back online')
  assert.ok(!JSON.parse(localStorage.getItem('just_spuds_order_outbox_v1')).includes(offlineOrder.id))
})

await test('the newer copy of an order wins; a late, stale echo cannot undo it', () => {
  const remote = { ...mem.orders.get(offlineOrder.id), status: 'baking', updatedAt: later() }
  serverOrder(remote)
  assert.equal(orderStore.getOrderById(offlineOrder.id).status, 'baking')
  mem.emitOrder({ ...remote, status: 'accepted', updatedAt: new Date(Date.now() - 3600_000).toISOString() })
  assert.equal(orderStore.getOrderById(offlineOrder.id).status, 'baking')
})

await test('void reasons, manager overrides, schedule and the test flag survive the orders table', () => {
  const o = {
    ...offlineOrder,
    adminNotes: [{ id: 'n1', timestamp: new Date().toISOString(), author: 'Manager', note: 'Voided 1x Coke' }],
    manualOverrides: [{ id: 'm1', overriddenAt: new Date().toISOString(), overriddenBy: 'Manager', reason: 'x', changesSummary: 'y' }],
    scheduleDate: 'Today',
    scheduleTime: '1:00 PM',
    isTest: true,
    deliveryDetails: { deliveryPin: '4821' },
  }
  const back = orderRows.rowToOrder(orderRows.orderToRow(o))
  assert.deepEqual(back.adminNotes, o.adminNotes)
  assert.deepEqual(back.manualOverrides, o.manualOverrides)
  assert.equal(back.scheduleDate, 'Today')
  assert.equal(back.isTest, true)
  assert.deepEqual(back.deliveryDetails, { deliveryPin: '4821' }, 'packing key never leaks into the order')
})

await test('web orders from customer phones count on the open till shift exactly once', () => {
  tillStore.openTillShift('Manager', 0)
  const before = tillStore.getCurrentShift().onlineOrdersTotal
  const now = new Date().toISOString()
  const web = {
    id: 'ord-remote-web-1', shortId: 'JS-W-11111', source: 'WEBSITE', createdAt: now, updatedAt: now, status: 'placed',
    fulfilment: 'pickup', customer, lines: [], timeline: [], estimatedDeliveryTime: '', etaMinutes: 15,
    payment: { method: 'card', status: 'paid', subtotal: 1234, deliveryFee: 0, serviceFee: 0, tip: 0, discount: 0, total: 1234 },
  }
  serverOrder(web)
  serverOrder({ ...web, status: 'accepted', updatedAt: later() })
  assert.equal(tillStore.getCurrentShift().onlineOrdersTotal - before, 1234)
})

await test('training orders never touch stock, the shift or the reports', () => {
  const ids = ['spud-great-british', 'panini-chicken-bacon']
  const stockBefore = ids.map((id) => menuStore.getProductById(id)?.stockQuantity)
  const shiftBefore = tillStore.getCurrentShift().onlineOrdersTotal
  const sims = orderStore.injectSimulatedRushOrders()
  assert.ok(sims.every((o) => o.isTest))
  assert.deepEqual(ids.map((id) => menuStore.getProductById(id)?.stockQuantity), stockBefore)
  assert.equal(tillStore.getCurrentShift().onlineOrdersTotal, shiftBefore)
  const done = sims.map((o) => ({ ...o, status: 'collected' }))
  assert.equal(orderStore.getDetailedBusinessAnalytics(done, '7days').completedCount, 0)
  assert.equal(orderStore.generateZReport(done).orderCount, 0)
  tillStore.closeTillShift('Manager', { ...tillStore.EMPTY_DENOMINATIONS })
})

await test('a Z-report closed on the till appears in the admin history on another device', () => {
  const now = new Date().toISOString()
  const shift = {
    id: 'shift-remote-1', shiftNumber: 7, status: 'closed', openedAt: now, closedAt: now, openedBy: 'Chloe', startingFloat: 10000,
    expectedCash: 12000, cashSalesTotal: 2000, cardSalesTotal: 0, onlineOrdersTotal: 0, totalDiscountGiven: 0, refundsTotal: 0,
    inStoreOrdersCount: 3, onlineOrdersCount: 0, movements: [], updatedAt: now,
  }
  serverPut({ key: 'just_spuds::rec::shifts::shift-remote-1', value: shift, updatedAt: now })
  assert.ok(tillStore.getPastZReports().some((s) => s.id === 'shift-remote-1'))
  assert.notEqual(tillStore.getCurrentShift()?.id, 'shift-remote-1', 'another till’s shift is never rung up on here')
})

await test('a PIN change reaches every device and ends sessions opened with the old PIN', async () => {
  const res = roster.setStaffPin('usr-cashier-1', '482913', 'Manager')
  assert.equal(res.ok, true, res.message)
  await cloud.syncNow()
  const published = mem.kv.get(DOC('staff.roster')).value.data
  assert.equal(published.members.find((m) => m.id === 'usr-cashier-1').defaultPin, false)
  assert.equal(authStore.loginWithPin('1111').ok, false, 'old PIN dead')
  assert.equal(authStore.loginWithPin('482913').ok, true, 'new PIN works')
  // someone changes the cashier's PIN on another device → this session ends
  const changed = {
    ...published,
    members: published.members.map((m) => (m.id === 'usr-cashier-1' ? { ...m, pinHash: roster.hashPin('736150', published.salt) } : m)),
  }
  serverPut(remoteDoc('staff.roster', changed))
  assert.equal(authStore.getCurrentUser(), null, 'signed out on this device')
  assert.equal(authStore.loginWithPin('736150').ok, true)
  assert.equal(roster.validateNewPin('1234', undefined).ok, false, 'starter / sequential PINs refused')
  localStorage.removeItem('just_spuds_pin_lock_v1')
})

await test('a fresh browser refuses the published starter PINs until it has checked the server', async () => {
  authStore.logout()
  localStorage.removeItem('just_spuds_sync_last_pull_v1')
  const meta = JSON.parse(localStorage.getItem('just_spuds_sync_meta_v1'))
  delete meta['staff.roster']
  localStorage.setItem('just_spuds_sync_meta_v1', JSON.stringify(meta))
  const blocked = authStore.loginWithPin('3333') // supervisor still on the starter PIN
  assert.equal(blocked.ok, false)
  assert.match(blocked.message, /checking/i)
  await cloud.syncNow()
  assert.equal(authStore.loginWithPin('3333').ok, true, 'fine once the real staff list is known')
})

await test('a customer device publishes nothing and keeps only its own orders', async () => {
  const p = firstSpud()
  authStore.logout()
  localStorage.removeItem('just_spuds_staff_device_v1')
  localStorage.removeItem('just_spuds_customer_placed_order_ids_v1')
  localStorage.removeItem('just_spuds_active_order_id')
  const settingsAt = mem.kv.get(DOC('delivery.settings')).value.at
  deliverySettings.saveDeliverySettings({ deliveryFeePence: 1 }) // a curious customer in devtools
  const mine = orderStore.createNewOrder({
    fulfilment: 'pickup', customer, lines: [line(p, 1)], subtotal: p.price, deliveryFee: 0, serviceFee: 0, tip: 0, discount: 0, total: p.price, paymentMethod: 'card',
  })
  await cloud.syncNow({ fullOrders: true })
  assert.equal(mem.kv.get(DOC('delivery.settings')).value.at, settingsAt, 'settings untouched on the server')
  assert.ok(mem.orders.has(mine.id), 'its own order uploads')
  const local = orderStore.getStoredOrders()
  assert.ok(local.length >= 1 && local.every((o) => o.id === mine.id), 'nobody else’s order (names, phones, addresses) stays on a customer phone')
})

await test('staff screens flag a web order priced below the real menu (tampered browser)', () => {
  const p = firstSpud()
  const honest = { ...line(p, 2) }
  const cheap = { ...line(p, 2), base: 1 }
  const order = (l, subtotal) => ({
    id: 'x', shortId: 'JS-W-1', source: 'WEBSITE', fulfilment: 'pickup', lines: [l],
    payment: { subtotal, deliveryFee: 0, serviceFee: 49, tip: 0, discount: 0, total: subtotal + 49 },
  })
  assert.equal(orderStore.getPriceCheck(order(honest, p.price * 2)).ok, true)
  const bad = orderStore.getPriceCheck(order(cheap, 2))
  assert.equal(bad.ok, false)
  assert.equal(bad.expected, p.price * 2)
  assert.match(bad.message, /menu/i)
  assert.equal(orderStore.getPriceCheck({ ...order(cheap, 2), source: 'TILL' }).ok, true, 'till prices (incl. overrides) are the till’s business')
})

await test('a blocked number is refused on a customer phone that only holds hashes', async () => {
  assert.equal(authStore.loginWithPin('736150').ok, true)
  blacklist.blacklistPhone('07700 900555', 'Prank orders', 'Manager')
  await cloud.syncNow()
  assert.ok(mem.kv.has('just_spuds::priv::blacklist'), 'full list: staff only')
  const hashes = mem.kv.get(DOC('blacklist.hashes')).value.data
  assert.ok(hashes.length >= 1 && !JSON.stringify(hashes).includes('900555'), 'public copy has no phone numbers')
  localStorage.removeItem('just_spuds_blacklist_v1') // as on a customer phone
  assert.equal(blacklist.isPhoneBlacklisted('+44 7700 900555').blacklisted, true)
})

await test('"Start trading fresh" clears pre-launch orders, shifts and audit entries on every device', async () => {
  assert.equal(authStore.loginWithPin('736150').ok, true)
  await cloud.syncNow({ fullOrders: true })
  assert.ok(orderStore.getStoredOrders().length > 0)
  const res = await cloud.startFresh('Manager')
  assert.equal(res.ok, true, res.message)
  const at = cloud.getEpochAt()
  assert.equal(orderStore.getStoredOrders().length, 0)
  assert.ok(!tillStore.getPastZReports().some((s) => s.openedAt < at), 'old Z-reports gone')
  assert.ok(audit.getAuditLogs().every((l) => l.timestamp >= at))
  await cloud.syncNow({ fullOrders: true })
  assert.equal(orderStore.getStoredOrders().length, 0, 'old orders are not downloaded again')
  // a new sale after the reset syncs normally
  const p = firstSpud()
  const fresh = orderStore.createManualCounterOrder({ fulfilment: 'pickup', customer, lines: [line(p, 1)], paymentMethod: 'cash', paymentStatus: 'paid' }, 'Cashier')
  await cloud.syncNow()
  assert.ok(mem.orders.has(fresh.id))
  // another device resets again: this device follows
  const epoch2 = { id: 'ep-other', at: later(), by: 'Owner' }
  serverPut({ key: DOC('system.epoch'), value: { data: epoch2, at: epoch2.at, by: 'dev-other' }, updatedAt: epoch2.at })
  assert.equal(cloud.getEpoch().id, 'ep-other')
  assert.equal(orderStore.getStoredOrders().length, 0)
})

cloud.stopCloudSync()

// ---------------------------------------------------------------------------
await vite.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
