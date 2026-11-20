/**
 * Staff sign-in & device pairing tests.
 *
 * Part 1 runs supabase/migrations/20261028_staff_security.sql in PGlite (real
 * Postgres compiled to WebAssembly) on a copy of the shop's tables, with the
 * old-style staff and driver lists, and checks every rule as the website's
 * public "anon" role would hit it. Part 2 drives the app's own auth and sync
 * code against that database.
 *
 * Run with: npm test (after the EPOS suite) or node scripts/test-staff-security.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261028_staff_security.sql', import.meta.url), 'utf8')
const MIGRATION_ORDERS = readFileSync(new URL('../supabase/migrations/20261120_orders_server.sql', import.meta.url), 'utf8')
// The base schema minus the realtime publication (PGlite has no logical replication).
const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').split('-- 5. ENABLE REALTIME')[0]

let passed = 0
let failed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ❌ ${name}\n     ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n     ') : err}`)
  }
}
const section = (title) => console.log(`\n${title}`)

const PREFIX = 'just_spuds'
const LEGACY_SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const legacyRoster = {
  data: {
    salt: LEGACY_SALT,
    members: [
      { id: 'usr-owner-1', name: 'Sunny (Store Owner)', role: 'STORE_MANAGER', status: 'ACTIVE', pinHash: 'f'.repeat(64), defaultPin: true, email: 'sunny@justspuds.uk' },
      { id: 'usr-mgr-1', name: 'Elena Rostova (Store Manager)', role: 'STORE_MANAGER', status: 'ACTIVE', pinHash: 'e'.repeat(64), defaultPin: true },
      { id: 'usr-sup-1', name: 'Marcus Bell (Shift Supervisor)', role: 'SUPERVISOR', status: 'ACTIVE', pinHash: 'd'.repeat(64), defaultPin: true },
      { id: 'usr-cashier-1', name: 'Chloe Smith (Till Cashier)', role: 'CASHIER', status: 'ACTIVE', pinHash: 'c'.repeat(64), defaultPin: true },
      { id: 'usr-staff-1', name: 'Jack Davies (Kitchen Chef)', role: 'KITCHEN_STAFF', status: 'DISABLED', pinHash: 'b'.repeat(64), defaultPin: true },
      { id: 'usr-admin-1', name: 'Vansh (System Admin)', role: 'SUPER_ADMIN', status: 'ACTIVE', pinHash: 'a'.repeat(64), defaultPin: true },
    ],
  },
  at: '2026-10-20T10:00:00.000Z',
  by: 'dev-old',
}
const legacyDrivers = {
  data: [
    { id: 'usr-driver-1', name: 'Liam Walker', status: 'ACTIVE', pinHash: `${LEGACY_SALT}$${'9'.repeat(64)}`, defaultPin: true, phone: '07700 900201' },
    { id: 'usr-driver-2', name: 'Amara Khan', status: 'SUSPENDED', pinHash: `${LEGACY_SALT}$${'8'.repeat(64)}`, defaultPin: true },
  ],
  at: '2026-10-20T10:00:00.000Z',
}

/** A database shaped like the live project before the migration. */
async function freshDb() {
  const db = await PGlite.create({ extensions: { pgcrypto } })
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
  `)
  await db.exec(SCHEMA)
  // Supabase grants the API roles everything on public tables; RLS does the rest.
  await db.exec('grant all on all tables in schema public to anon, authenticated;')
  const put = (key, value) =>
    db.query('insert into public.delivery_settings (store_id, settings, updated_at) values ($1, $2, now())', [key, JSON.stringify(value)])
  await put(`${PREFIX}::doc::staff.roster`, legacyRoster)
  await put(`${PREFIX}::doc::drivers`, legacyDrivers)
  await put(`${PREFIX}::doc::menu.products`, { data: [{ id: 'spud-1', name: 'Just Cheese', category: 'spuds', description: 'Cheese', price: 545, image: '', model: null, video: null, extras: [], sauces: true }], at: '2026-10-20T10:00:00.000Z' })
  await put(`${PREFIX}::priv::terminal.registry`, { data: { enforceStoreHardwareLock: true, masterTerminal: null, enrolledTerminals: [{ deviceId: 'term_a', name: 'Old till', stationRole: 'secondary_till', tokenHash: 'h', enrolledAt: '2026-10-01T10:00:00.000Z', enrolledBy: 'Sunny' }] }, at: '2026-10-20T10:00:00.000Z' })
  await put(`${PREFIX}::rec::audit::a1`, { id: 'a1', action: 'staff.pin_changed', updatedAt: '2026-10-20T10:00:00.000Z' })
  return db
}

async function migrate(db) {
  const results = await db.exec(MIGRATION)
  return results[results.length - 1].rows
}

/** Functions that return rows (PostgREST answers these with an array). */
const SETOF = new Set(['jsp_sync_list', 'jsp_customer_orders', 'jsp_orders_list'])

/** Call an exposed function the way the website does: as the anon role, from an IP. */
async function rpc(db, fn, args = {}, { ip = '203.0.113.7' } = {}) {
  const names = Object.keys(args)
  // Postgres arrays (text[]) go as arrays; everything else structured goes as JSON.
  const values = names.map((n) => (n === 'p_ids' ? args[n] : args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]))
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'cf-connecting-ip': ip })])
    await tx.query('set local role anon')
    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`
    if (SETOF.has(fn)) return (await tx.query(`select * from ${call}`, values)).rows
    return (await tx.query(`select ${call} as r`, values)).rows[0].r
  })
}

async function asAnon(db, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query('set local role anon')
    return tx.query(sql, params)
  })
}

const rejects = async (promise, pattern) => {
  let error = null
  try {
    await promise
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an error')
  if (pattern) assert.match(String(error.message), pattern)
}

const tempPinFor = (rows, id) => rows.find((r) => r.step.includes(`(${id})`))?.secret
const pairingCodeIn = (rows) => rows.find((r) => r.step.startsWith('Pairing code'))?.secret

// ===========================================================================
section('🗄️  Part 1 — the migration in real Postgres')
// ===========================================================================

const db = await freshDb()
const boot = await migrate(db)
const sunnyTemp = tempPinFor(boot, 'usr-owner-1')
const elenaTemp = tempPinFor(boot, 'usr-mgr-1')
const vanshTemp = tempPinFor(boot, 'usr-admin-1')
const firstCode = pairingCodeIn(boot)

await test('the migration runs and prints a temporary PIN for each owner/manager account plus a pairing code', async () => {
  assert.equal(boot.length, 4)
  for (const pin of [sunnyTemp, elenaTemp, vanshTemp]) assert.match(pin, /^\d{6}$/)
  assert.equal(new Set([sunnyTemp, elenaTemp, vanshTemp]).size, 3)
  assert.match(firstCode, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)
  assert.equal(tempPinFor(boot, 'usr-cashier-1'), undefined, 'other staff get their PIN from a manager')
})

await test('the shared staff and driver lists no longer carry any PIN data', async () => {
  const rows = (await db.query(`select store_id, settings from public.delivery_settings where store_id like '%::doc::%'`)).rows
  const roster = rows.find((r) => r.store_id.endsWith('staff.roster')).settings
  const drivers = rows.find((r) => r.store_id.endsWith('::drivers')).settings
  assert.equal(roster.data.salt, 'server')
  assert.equal(roster.data.members.length, 6)
  assert.ok(roster.data.members.every((m) => m.pinHash === '' && m.defaultPin === false))
  assert.ok(roster.at > legacyRoster.at, 'roster re-dated so every device takes the clean copy')
  assert.match(roster.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
  assert.equal(roster.data.members.find((m) => m.id === 'usr-owner-1').mustChange, true)
  assert.equal(roster.data.members.find((m) => m.id === 'usr-cashier-1').pinSet, false)
  assert.equal(roster.data.members.find((m) => m.id === 'usr-staff-1').status, 'DISABLED')
  assert.ok(drivers.data.every((d) => !('pinHash' in d) && !('pin' in d) && d.defaultPin === false))
  assert.equal(drivers.data[0].phone, '07700 900201', 'everything else about a driver is kept')
  assert.ok(drivers.at > legacyDrivers.at)
})

await test('the public key can read public documents only, and write nothing', async () => {
  const keys = (await asAnon(db, 'select store_id from public.delivery_settings order by store_id')).rows.map((r) => r.store_id)
  assert.ok(keys.length >= 3)
  assert.ok(keys.every((k) => k.includes('::doc::')), `anon saw ${keys.join(', ')}`)
  await rejects(asAnon(db, `insert into public.delivery_settings (store_id, settings) values ('${PREFIX}::doc::menu.promos', '{}')`), /permission denied|row-level security/)
  await rejects(asAnon(db, `update public.delivery_settings set settings = '{}' where store_id = '${PREFIX}::doc::menu.products'`), /permission denied/)
  await rejects(asAnon(db, `delete from public.delivery_settings`), /permission denied/)
})

await test('the PIN store, sessions and helper functions are out of reach of the public key', async () => {
  await rejects(asAnon(db, 'select * from jsp_private.people'), /permission denied/)
  await rejects(asAnon(db, 'select * from jsp_private.config'), /permission denied/)
  await rejects(asAnon(db, `select jsp_private.reset_pin('usr-owner-1')`), /permission denied/)
  await rejects(asAnon(db, 'select * from jsp_private.bootstrap()'), /permission denied/)
})

let tillToken = ''
await test('pairing needs a valid code; the device gets a secret token', async () => {
  const wrong = await rpc(db, 'jsp_pair_device', { p_code: 'AAAA-BBBB', p_device_id: 'term_till1', p_name: 'Front till' })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.error, 'invalid')
  const ok = await rpc(db, 'jsp_pair_device', { p_code: firstCode.toLowerCase().replace('-', ' '), p_device_id: 'term_till1', p_name: 'Front till' })
  assert.equal(ok.ok, true)
  assert.match(ok.token, /^[0-9a-f]{64}$/)
  assert.equal(ok.pairedBy, 'Supabase SQL editor')
  tillToken = ok.token
  const status = await rpc(db, 'jsp_device_status', { p_device: tillToken })
  assert.deepEqual([status.paired, status.name], [true, 'Front till'])
  assert.equal((await rpc(db, 'jsp_device_status', { p_device: 'nope' })).paired, false)
})

await test('ten wrong pairing codes from one address lock pairing there for 15 minutes', async () => {
  for (let i = 0; i < 10; i++) await rpc(db, 'jsp_pair_device', { p_code: `WRONG${i}`, p_device_id: 'term_x', p_name: 'x' }, { ip: '198.51.100.9' })
  const locked = await rpc(db, 'jsp_pair_device', { p_code: firstCode, p_device_id: 'term_x', p_name: 'x' }, { ip: '198.51.100.9' })
  assert.equal(locked.error, 'locked')
  const elsewhere = await rpc(db, 'jsp_pair_device', { p_code: firstCode, p_device_id: 'term_kds', p_name: 'Kitchen screen' }, { ip: '203.0.113.50' })
  assert.equal(elsewhere.ok, true)
})

await test('a PIN only works on a paired device, and the published starter PINs never work', async () => {
  const unpaired = await rpc(db, 'jsp_check_pin', { p_device: 'not-a-token', p_pin: sunnyTemp, p_open_session: true })
  assert.equal(unpaired.error, 'device')
  for (const starter of ['2468', '5555', '8888']) {
    assert.equal((await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: starter, p_open_session: true })).error, 'invalid')
  }
  await db.query(`update jsp_private.devices set fail_streak = 0, locked_until = null`)
})

let sunnySession = ''
await test('a temporary PIN signs in but must be changed, and cannot approve anything until then', async () => {
  const res = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: sunnyTemp, p_open_session: true })
  assert.equal(res.ok, true)
  assert.equal(res.person.id, 'usr-owner-1')
  assert.equal(res.person.role, 'STORE_MANAGER')
  assert.equal(res.mustChange, true)
  assert.match(res.session.token, /^[0-9a-f]{64}$/)
  sunnySession = res.session.token
  const approve = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: sunnyTemp, p_open_session: false })
  assert.equal(approve.error, 'must_change')
  const admin = await rpc(db, 'jsp_admin_people', { p_session: sunnySession })
  assert.equal(admin.error, 'forbidden', 'no admin tools on a temporary PIN')
})

await test('PIN rules: managers need 6+ digits, weak or taken PINs are refused, the old temporary PIN stops working', async () => {
  const change = (pin) => rpc(db, 'jsp_change_my_pin', { p_session: sunnySession, p_new_pin: pin })
  assert.equal((await change('4826')).error, 'short')
  assert.equal((await change('135790')).error, 'weak')
  assert.equal((await change('123456')).error, 'weak')
  assert.equal((await change('121212')).error, 'weak')
  assert.equal((await change(elenaTemp)).error, 'taken')
  assert.equal((await change(sunnyTemp)).error, 'same')
  assert.equal((await change('48a2b6')).error, 'format')
  const ok = await change('582914')
  assert.equal(ok.ok, true)
  assert.equal((await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: sunnyTemp, p_open_session: true })).error, 'invalid')
  const again = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '582914', p_open_session: true })
  assert.equal(again.ok, true)
  assert.equal(again.mustChange, false)
  sunnySession = again.session.token
  const verify = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '582914', p_open_session: false })
  assert.equal(verify.ok, true)
  assert.equal(verify.session, null, 'identifying someone opens no session')
  const roster = (await db.query(`select settings from public.delivery_settings where store_id = '${PREFIX}::doc::staff.roster'`)).rows[0].settings
  assert.equal(roster.data.members.find((m) => m.id === 'usr-owner-1').mustChange, false)
})

await test('wrong PINs lock the device: 5 → 30 s, then longer; 25 in a row blocks it until a manager unblocks it', async () => {
  const kds = await rpc(db, 'jsp_pair_device', { p_code: (await db.query(`select jsp_private.new_pairing_code() c`)).rows[0].c, p_device_id: 'term_lock', p_name: 'Lock test' })
  const tok = kds.token
  const tryPin = (pin) => rpc(db, 'jsp_check_pin', { p_device: tok, p_pin: pin, p_open_session: true })
  for (let i = 1; i <= 4; i++) {
    const r = await tryPin('604917')
    assert.equal(r.error, 'invalid')
    assert.equal(r.triesLeft, 5 - i)
  }
  const fifth = await tryPin('604917')
  assert.equal(fifth.error, 'locked')
  assert.equal(fifth.retryAfter, 30)
  assert.equal((await tryPin('582914')).error, 'locked', 'even the right PIN waits out the lock')
  for (let i = 6; i <= 25; i++) {
    await db.query(`update jsp_private.devices set locked_until = null where id = 'term_lock'`)
    await tryPin('604917')
  }
  assert.equal((await tryPin('582914')).error, 'blocked')
  assert.equal((await rpc(db, 'jsp_admin_device', { p_session: sunnySession, p_device_id: 'term_lock', p_action: 'unblock' })).ok, true)
  assert.equal((await tryPin('582914')).ok, true)
  // A success clears the streak.
  assert.equal((await db.query(`select fail_streak from jsp_private.devices where id = 'term_lock'`)).rows[0].fail_streak, 0)
})

let chloeSession = ''
await test('a manager adds staff and sets a temporary PIN; the new person must choose their own', async () => {
  const saved = await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { kind: 'staff', name: 'Priya Patel', role: 'CASHIER' } })
  assert.equal(saved.ok, true)
  assert.match(saved.id, /^usr-[0-9a-f]{12}$/)
  const weak = await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: saved.id, p_pin: '1111' })
  assert.equal(weak.error, 'weak')
  const taken = await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: saved.id, p_pin: '582914' })
  assert.equal(taken.message, 'Someone else already uses that PIN.')
  assert.equal((await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: saved.id, p_pin: '3907' })).ok, true)
  const first = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '3907', p_open_session: true })
  assert.equal(first.mustChange, true)
  assert.equal((await rpc(db, 'jsp_change_my_pin', { p_session: first.session.token, p_new_pin: '7351' })).ok, true, 'cashiers may use 4 digits')
  // Chloe (starter account) gets a PIN too.
  assert.equal((await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: 'usr-cashier-1', p_pin: '2963' })).ok, true)
  const chloe = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '2963', p_open_session: true })
  await rpc(db, 'jsp_change_my_pin', { p_session: chloe.session.token, p_new_pin: '8146' })
  chloeSession = (await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '8146', p_open_session: true })).session.token
  const roster = (await db.query(`select settings from public.delivery_settings where store_id = '${PREFIX}::doc::staff.roster'`)).rows[0].settings
  assert.ok(roster.data.members.some((m) => m.name === 'Priya Patel' && m.pinSet && !m.mustChange))
})

await test('only owners/managers reach the admin tools, and only the system admin can touch the system admin', async () => {
  for (const [fn, args] of [
    ['jsp_admin_people', {}],
    ['jsp_admin_pairing_code', {}],
    ['jsp_admin_devices', {}],
    ['jsp_admin_events', { p_limit: 5 }],
    ['jsp_admin_save_person', { p_person: { name: 'Chloe Boss', role: 'STORE_MANAGER', id: 'usr-cashier-1' } }],
    ['jsp_admin_set_pin', { p_person_id: 'usr-owner-1', p_pin: '650183' }],
  ]) {
    assert.equal((await rpc(db, fn, { p_session: chloeSession, ...args })).error, 'forbidden', fn)
  }
  const promote = await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { id: 'usr-cashier-1', kind: 'staff', role: 'SUPER_ADMIN' } })
  assert.equal(promote.error, 'forbidden')
  const touchAdmin = await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: 'usr-admin-1', p_pin: '650183' })
  assert.equal(touchAdmin.error, 'forbidden')
  const selfDisable = await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { id: 'usr-owner-1', kind: 'staff', active: false } })
  assert.match(selfDisable.message, /can't change your own role or disable yourself/)
  const people = await rpc(db, 'jsp_admin_people', { p_session: sunnySession })
  assert.equal(people.ok, true)
  assert.ok(people.people.length >= 9)
  assert.ok(people.people.every((p) => !('pin_lookup' in p) && !('pinLookup' in p)))
})

await test('disabling someone or changing their role ends their sessions everywhere', async () => {
  assert.equal((await rpc(db, 'jsp_session', { p_session: chloeSession })).ok, true)
  assert.equal((await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { id: 'usr-cashier-1', kind: 'staff', active: false } })).ok, true)
  assert.equal((await rpc(db, 'jsp_session', { p_session: chloeSession })).ok, false)
  assert.equal((await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '8146', p_open_session: true })).error, 'invalid')
  await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { id: 'usr-cashier-1', kind: 'staff', active: true } })
  const back = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '8146', p_open_session: true })
  assert.equal(back.ok, true)
  await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { id: 'usr-cashier-1', kind: 'staff', role: 'SUPERVISOR' } })
  assert.equal((await rpc(db, 'jsp_session', { p_session: back.session.token })).ok, false)
})

await test('changing your PIN signs you out on your other devices; signing out ends the session', async () => {
  const kdsCode = (await db.query(`select jsp_private.new_pairing_code() c`)).rows[0].c
  const phone = await rpc(db, 'jsp_pair_device', { p_code: kdsCode, p_device_id: 'phone_sunny', p_name: 'Sunny phone' })
  const onPhone = (await rpc(db, 'jsp_check_pin', { p_device: phone.token, p_pin: '582914', p_open_session: true })).session.token
  assert.equal((await rpc(db, 'jsp_change_my_pin', { p_session: sunnySession, p_new_pin: '730482' })).ok, true)
  assert.equal((await rpc(db, 'jsp_session', { p_session: onPhone })).ok, false)
  assert.equal((await rpc(db, 'jsp_session', { p_session: sunnySession })).ok, true)
  const spare = (await rpc(db, 'jsp_check_pin', { p_device: phone.token, p_pin: '730482', p_open_session: true })).session.token
  await rpc(db, 'jsp_sign_out', { p_session: spare })
  assert.equal((await rpc(db, 'jsp_session', { p_session: spare })).ok, false)
})

await test('drivers sign in like staff; a suspended driver cannot', async () => {
  assert.equal((await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: 'usr-driver-1', p_pin: '4093' })).ok, true)
  const liam = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '4093', p_open_session: true })
  assert.equal(liam.person.kind, 'driver')
  assert.equal(liam.person.role, 'DRIVER')
  assert.equal((await rpc(db, 'jsp_admin_set_pin', { p_session: sunnySession, p_person_id: 'usr-driver-2', p_pin: '5182' })).ok, true)
  assert.equal((await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '5182', p_open_session: true })).error, 'invalid')
  const newDriver = await rpc(db, 'jsp_admin_save_person', { p_session: sunnySession, p_person: { id: 'usr-driver-77', kind: 'driver', name: 'New Driver', role: 'SUPER_ADMIN' } })
  assert.equal(newDriver.ok, true)
  const people = (await rpc(db, 'jsp_admin_people', { p_session: sunnySession })).people
  assert.equal(people.find((p) => p.id === 'usr-driver-77').role, 'DRIVER', 'a driver is always just a driver')
})

await test('a manager can pair new devices and unpair them; an unpaired device can no longer sync or sign in', async () => {
  const code = await rpc(db, 'jsp_admin_pairing_code', { p_session: sunnySession })
  assert.equal(code.ok, true)
  const dev = await rpc(db, 'jsp_pair_device', { p_code: code.code, p_device_id: 'term_spare', p_name: 'Spare till' })
  assert.equal(dev.pairedBy, 'Sunny (Store Owner)')
  assert.equal((await rpc(db, 'jsp_pair_device', { p_code: code.code, p_device_id: 'term_other', p_name: 'Other' })).error, 'invalid', 'codes from the admin work once')
  const devices = (await rpc(db, 'jsp_admin_devices', { p_session: sunnySession })).devices
  assert.ok(devices.some((d) => d.id === 'term_spare' && !d.revoked))
  assert.equal((await rpc(db, 'jsp_admin_device', { p_session: sunnySession, p_device_id: 'term_spare', p_action: 'revoke' })).ok, true)
  assert.equal((await rpc(db, 'jsp_check_pin', { p_device: dev.token, p_pin: '730482', p_open_session: true })).error, 'device')
  await rejects(rpc(db, 'jsp_sync_list', { p_device: dev.token, p_prefix: `${PREFIX}::priv::` }), /not paired/)
  const events = (await rpc(db, 'jsp_admin_events', { p_session: sunnySession, p_limit: 200 })).events
  assert.ok(events.some((e) => e.kind === 'sign_in' && e.ok === false && e.device === 'Front till'))
  assert.ok(events.some((e) => e.kind === 'device_revoke' && e.person === 'Sunny (Store Owner)'))
})

await test('paired devices read private documents and write through the server; the staff list stays server-owned', async () => {
  const priv = await rpc(db, 'jsp_sync_list', { p_device: tillToken, p_prefix: `${PREFIX}::priv::` })
  assert.deepEqual(priv.map((r) => r.store_id), [`${PREFIX}::priv::terminal.registry`])
  const recs = await rpc(db, 'jsp_sync_list', { p_device: tillToken, p_prefix: `${PREFIX}::rec::audit::`, p_since: '2026-01-01T00:00:00Z', p_limit: 10 })
  assert.equal(recs.length, 1)
  await rejects(rpc(db, 'jsp_sync_put', { p_device: 'nope', p_rows: [] }), /not paired/)
  const now = new Date().toISOString()
  const ok = await rpc(db, 'jsp_sync_put', {
    p_device: tillToken,
    p_rows: [
      { store_id: `${PREFIX}::doc::menu.promos`, settings: { data: [{ code: 'TEST' }], at: now }, updated_at: now },
      { store_id: `${PREFIX}::priv::blacklist`, settings: { data: [], at: now }, updated_at: now },
      { store_id: `${PREFIX}::rec::shifts::s1`, settings: { id: 's1', updatedAt: now }, updated_at: now },
      { store_id: `${PREFIX}::doc::staff.roster`, settings: { data: { salt: 'x', members: [{ id: 'evil', role: 'SUPER_ADMIN', pinHash: 'abc' }] }, at: now }, updated_at: now },
      { store_id: `${PREFIX}::doc::drivers`, settings: { data: [{ id: 'usr-driver-1', name: 'Liam Walker', pinHash: 'salt$hash', pin: '7777' }], at: now }, updated_at: now },
      { store_id: `other_shop::doc::menu.products`, settings: { data: [] }, updated_at: now },
    ],
  })
  assert.equal(ok, true)
  const rows = Object.fromEntries((await db.query('select store_id, settings from public.delivery_settings')).rows.map((r) => [r.store_id, r.settings]))
  assert.deepEqual(rows[`${PREFIX}::doc::menu.promos`].data, [{ code: 'TEST' }])
  assert.ok(rows[`${PREFIX}::priv::blacklist`])
  assert.ok(rows[`${PREFIX}::rec::shifts::s1`])
  assert.ok(!rows[`${PREFIX}::doc::staff.roster`].data.members.some((m) => m.id === 'evil'))
  assert.deepEqual(Object.keys(rows[`${PREFIX}::doc::drivers`].data[0]).sort(), ['defaultPin', 'id', 'name'])
  assert.equal(rows['other_shop::doc::menu.products'], undefined)
})

await test('running the migration again keeps PINs and devices, and only prints a new pairing code', async () => {
  const again = await migrate(db)
  assert.equal(again.length, 1)
  assert.ok(pairingCodeIn(again))
  assert.equal((await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: '730482', p_open_session: true })).ok, true)
  const keys = (await asAnon(db, 'select store_id from public.delivery_settings')).rows.map((r) => r.store_id)
  assert.ok(keys.every((k) => k.includes('::doc::')))
})

await test('emergency reset from the SQL editor gives a new temporary PIN and ends old sessions', async () => {
  const pin = (await db.query(`select jsp_private.reset_pin('usr-owner-1') p`)).rows[0].p
  assert.match(pin, /^\d{6}$/)
  assert.equal((await rpc(db, 'jsp_session', { p_session: sunnySession })).ok, false)
  const res = await rpc(db, 'jsp_check_pin', { p_device: tillToken, p_pin: pin, p_open_session: true })
  assert.equal(res.mustChange, true)
})

// ===========================================================================
section('🧾 Part 1b — orders and stock behind the server (20261120_orders_server.sql)')
// ===========================================================================

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const isoNow = () => new Date().toISOString()
let orderSeq = 0
/** An order row as the website sends it (see supabaseOrderSync.orderToRow). */
const webRow = (lines, extra = {}) => {
  const n = 10000 + ++orderSeq
  const subtotal = lines.reduce((s, l) => s + l.base * l.qty, 0)
  const { payment: pay, customer: cust, ...rest } = extra
  return {
    id: `ord-${1790000000000 + orderSeq}-${n}`,
    short_id: `JS-W-${n}`,
    store_id: PREFIX,
    status: 'placed',
    fulfilment: 'pickup',
    // A different phone per order, so only the rate-limit test trips the per-phone limit.
    customer: { name: 'Sarah Mitchell', phone: `07700 9${n}`, email: '', ...cust },
    lines,
    payment: { method: 'in_store', status: 'pending_store', subtotal, deliveryFee: 0, serviceFee: 49, tip: 0, discount: 0, total: subtotal + 49, ...pay },
    eta_minutes: 15,
    is_scheduled: false,
    timeline: [{ status: 'placed', timestamp: '12:00', title: 'Order Placed' }],
    created_at: isoNow(),
    updated_at: isoNow(),
    ...rest,
  }
}
const spudLine = (qty = 1, extra = {}) => ({ lineId: `l-${Math.random()}`, productId: 'spud-1', name: 'Just Cheese', base: 545, extras: [], sauces: [], meal: false, image: '', category: 'SPUDS', qty, ...extra })
const drinkLine = (qty = 1, extra = {}) => ({ lineId: `l-${Math.random()}`, productId: 'drink-1', name: 'Cola', base: 150, extras: [], sauces: [], meal: false, image: '', category: 'DRINKS', qty, ...extra })
let placeSeq = 0
const place = (row, token = null, ip = `203.0.${Math.floor(++placeSeq / 200)}.${placeSeq % 200}`) => rpc(db, 'jsp_customer_order_save', { p_row: row, p_token: token }, { ip })
const rowOf = async (id) => (await db.query('select * from public.orders where id = $1', [id])).rows[0]
const stockOf = async (id) => (await db.query('select remaining_count from public.menu_stock where id = $1', [id])).rows[0]?.remaining_count
const putDoc = (name, data) =>
  rpc(db, 'jsp_sync_put', { p_device: tillToken, p_rows: [{ store_id: `${PREFIX}::doc::${name}`, settings: { data, at: isoNow() }, updated_at: isoNow() }] })

// An order that existed before the migration, placed the old way.
await db.query(
  `insert into public.orders (id, short_id, status, fulfilment, customer, lines, payment, timeline) values ('ord-1700000000000-11111', 'JS-W-11111', 'placed', 'pickup', '{"name":"Old Order","phone":"07700 900555"}', '[]', '{"total":500,"status":"pending_store"}', '[]')`,
)
const ordersBoot = (await db.exec(MIGRATION_ORDERS)).pop().rows

await putDoc('menu.products', [
  { id: 'spud-1', name: 'Just Cheese', category: 'SPUDS', price: 545, storePrice: 495, available: true },
  { id: 'drink-1', name: 'Cola', category: 'DRINKS', price: 150, available: true },
  { id: 'counter-1', name: 'Counter Special', category: 'SPUDS', price: 300, available: true, channelVisibility: 'in_store_only' },
  { id: 'off-1', name: 'Off Today', category: 'SPUDS', price: 300, available: false },
])
await putDoc('menu.extras', [{ id: 'beans', label: 'Beans', price: 100 }])
await putDoc('menu.promos', [{ code: 'SPUD10', discountPercent: 10, minOrderPence: 1000, active: true, description: '' }, { code: 'OLD', discountPence: 500, active: false, description: '' }])
await putDoc('blacklist.hashes', [sha256('just-spuds-blacklist:07911654987')])
const deliverySettingsDoc = { isOnlineOrderingEnabled: true, deliveryFeePence: 400, freeDeliveryThresholdPence: 2500, minOrderPence: 1000, deliveryRadiusMetres: 5000, orderingPausedMessage: 'Launching soon' }
await putDoc('delivery.settings', deliverySettingsDoc)
await rpc(db, 'jsp_stock_put', { p_device: tillToken, p_rows: [{ id: 'spud-1', remaining_count: 3 }] })

await test('the public key can no longer read or write orders; stock is read-only; old orders got a tracking key', async () => {
  assert.equal(Number(ordersBoot[0].orders_kept), 1, 'existing orders are kept')
  await rejects(asAnon(db, 'select id from public.orders'), /permission denied/)
  await rejects(asAnon(db, `insert into public.orders (id, short_id, customer, lines, payment, timeline) values ('ord-x', 'JS-W-1', '{}', '[]', '{}', '[]')`), /permission denied/)
  await rejects(asAnon(db, `update public.orders set status = 'collected'`), /permission denied/)
  assert.equal((await asAnon(db, 'select id, remaining_count from public.menu_stock')).rows.length, 1, 'the menu can still show sold out')
  await rejects(asAnon(db, `update public.menu_stock set remaining_count = 999`), /permission denied/)
  await rejects(asAnon(db, `insert into public.order_events (order_id, status) values ('x', 'y')`), /permission denied/)
  assert.match((await rowOf('ord-1700000000000-11111')).track_token, /^[0-9a-f]{32}$/)
  const status = await rpc(db, 'jsp_auth_status', {})
  assert.equal(status.orders, true)
})

let firstOrder
await test('a web order is placed through the server: checked, unpaid, stock taken, tracking key returned', async () => {
  const row = webRow([spudLine(1)], { status: 'collected', payment: { status: 'paid', paidAt: isoNow(), takenBy: 'Me' }, delivery_details: { _x: { isTest: true, scheduleDate: 'Thu 9 Oct' } } })
  const res = await place(row)
  assert.equal(res.ok, true, res.message)
  assert.match(res.token, /^[0-9a-f]{32}$/)
  const saved = await rowOf(row.id)
  assert.equal(saved.status, 'placed', 'a browser cannot create a completed order')
  assert.equal(saved.payment.status, 'pending_store', 'or a paid one')
  assert.equal(saved.payment.paidAt, undefined)
  assert.equal(saved.payment.total, 545 + 49)
  assert.equal(saved.delivery_details._x.isTest, undefined, 'or hide it from the takings as a training order')
  assert.equal(saved.delivery_details._x.scheduleDate, 'Thu 9 Oct')
  assert.equal(await stockOf('spud-1'), 2)
  const pings = (await asAnon(db, 'select order_id, status from public.order_events where order_id = $1', [row.id])).rows
  assert.deepEqual(pings, [{ order_id: row.id, status: 'placed' }], 'screens are told an order arrived — number and status only')
  firstOrder = { row, token: res.token }
})

await test('prices come from the shop’s menu: cheaper, off-menu, counter-only and counter-priced baskets are refused', async () => {
  assert.equal((await place(webRow([spudLine(1, { base: 100 })]))).error, 'price')
  assert.equal((await place(webRow([spudLine(1, { base: 495 })]))).error, 'price', 'the cheaper till price cannot be claimed online')
  assert.equal((await place(webRow([spudLine(1, { extras: ['beans'] })]))).error, 'price', 'a topping is charged')
  assert.equal((await place(webRow([spudLine(1, { extras: ['beans'], base: 545 })], { payment: { subtotal: 645, total: 694 } }))).ok, true)
  assert.equal((await place(webRow([spudLine(1, { meal: true })]))).error, 'price', 'so is the meal deal')
  assert.match((await place(webRow([{ ...spudLine(1), productId: 'ghost' }]))).message, /no longer on the menu/)
  assert.match((await place(webRow([{ ...spudLine(1), productId: 'counter-1', base: 300 }]))).message, /can't be ordered online/)
  assert.match((await place(webRow([{ ...spudLine(1), productId: 'off-1', base: 300 }]))).message, /can't be ordered online/)
  assert.equal((await place(webRow([spudLine(1, { priceOverridePence: 1 })]))).ok, false, 'no manager override from a browser')
  assert.equal((await place(webRow([drinkLine(1)], { payment: { total: 100 } }))).error, 'price', 'the total must add up')
  assert.equal((await place({ ...webRow([drinkLine(1)]), short_id: 'JS-T-12345' })).ok, false, 'a browser cannot create a till order')
  assert.equal(await stockOf('spud-1'), 1, 'only the one accepted spud order took stock')
})

await test('two customers cannot both buy the last one', async () => {
  const a = await place(webRow([spudLine(1)]))
  const b = await place(webRow([spudLine(1)]))
  assert.equal(a.ok, true)
  assert.equal(b.error, 'stock')
  assert.match(b.message, /sold out/)
  assert.equal(await stockOf('spud-1'), 0)
  const mixed = await place(webRow([drinkLine(2), spudLine(1)]))
  assert.equal(mixed.error, 'stock')
  assert.equal((await db.query(`select count(*)::int n from public.orders where lines::text like '%drink-1%' and lines::text like '%spud-1%'`)).rows[0].n, 0, 'nothing of a refused basket is kept')
  await rpc(db, 'jsp_stock_put', { p_device: tillToken, p_rows: [{ id: 'spud-1', remaining_count: 20 }] })
})

await test('blocked numbers, a paused kitchen and switched-off ordering are enforced by the server', async () => {
  for (const phone of ['07911 654987', '+44 7911 654987', '447911654987']) {
    assert.equal((await place(webRow([drinkLine(1)], { customer: { phone } }))).error, 'blocked', phone)
  }
  assert.equal((await place(webRow([drinkLine(1)], { customer: { phone: '12345' } }))).ok, false)
  await putDoc('kitchen.pause', { isPaused: true, resumeAt: 'manual', reasonText: 'Baking a fresh batch.' })
  const paused = await place(webRow([drinkLine(1)]))
  assert.equal(paused.error, 'closed')
  assert.match(paused.message, /fresh batch/)
  assert.equal((await place(webRow([drinkLine(1)], { is_scheduled: true }))).ok, true, 'a pre-order for later is still taken')
  await putDoc('kitchen.pause', { isPaused: false })
  await putDoc('delivery.settings', { ...deliverySettingsDoc, isOnlineOrderingEnabled: false })
  const off = await place(webRow([drinkLine(1)]))
  assert.equal(off.error, 'closed')
  assert.equal(off.message, 'Launching soon')
  await putDoc('delivery.settings', deliverySettingsDoc)
})

await test('delivery: area, distance, minimum and fee are the server’s, vouchers are capped', async () => {
  const delivery = (lines, cust = {}, pay = {}) => {
    const subtotal = lines.reduce((s, l) => s + l.base * l.qty, 0)
    const fee = subtotal >= 2500 ? 0 : 400
    return webRow(lines, {
      fulfilment: 'delivery',
      customer: { streetAddress: '14 Oxford Road', postcode: 'HP21 8AA', latitude: 51.8075, longitude: -0.7865, ...cust },
      payment: { method: 'driver_device', deliveryFee: fee, total: subtotal + fee + 49, ...pay },
    })
  }
  const ok = await place(delivery([spudLine(2)]))
  assert.equal(ok.ok, true, ok.message)
  assert.equal((await rowOf(ok.id)).payment.status, 'pending_delivery')
  assert.equal((await rowOf(ok.id)).payment.deliveryFee, 400)
  assert.equal((await place(delivery([spudLine(1)]))).error, 'price', 'under the minimum')
  assert.equal((await place(delivery([spudLine(2)], {}, { deliveryFee: 0, total: 1090 + 49 }))).error, 'price', 'the delivery fee cannot be dropped')
  assert.equal((await place(delivery([spudLine(5)]))).ok, true, 'free delivery over the threshold')
  assert.equal((await place(delivery([spudLine(2)], { postcode: 'MK18 1AA' }))).error, 'area')
  const far = await place(delivery([spudLine(2)], { postcode: 'HP17 8BB', latitude: 51.7715, longitude: -0.9275 }))
  assert.equal(far.error, 'area')
  assert.match(far.message, /km from the shop/)
  assert.equal((await place(delivery([spudLine(2)], { streetAddress: '' }))).ok, false)

  const voucher = (code, discount) => webRow([spudLine(2)], { payment: { promoCode: code, discount, total: 1090 - discount + 49 } })
  assert.equal((await place(voucher('SPUD10', 109))).ok, true)
  assert.equal((await place(voucher('SPUD10', 500))).error, 'price', '10% is 10%')
  assert.equal((await place(voucher('OLD', 500))).error, 'price', 'a switched-off voucher')
  assert.equal((await place(voucher('MADEUP', 500))).error, 'price')
  assert.equal((await place(voucher('FREESPUD-AB12CD', 650))).ok, true, 'a Spud Club reward up to its value')
  assert.equal((await place(voucher('FREESPUD-AB12CD', 1000))).error, 'price')
})

await test('a customer reads, cancels and reviews only their own order, with its tracking key', async () => {
  const { row, token } = firstOrder
  const mine = await rpc(db, 'jsp_customer_orders', { p_refs: [{ id: row.id, token }, { id: 'ord-1700000000000-11111', token: 'guess' }] })
  assert.deepEqual(mine.map((o) => o.id), [row.id], 'an order id without its key returns nothing')
  assert.equal((await place({ ...row, status: 'cancelled' }, 'wrong-key')).error, 'forbidden')
  assert.equal((await place({ ...row, status: 'cancelled' }, null)).error, 'forbidden')
  // A browser "editing" its order changes nothing.
  const edit = await place({ ...row, status: 'collected', payment: { ...row.payment, status: 'paid', total: 1 } }, token)
  assert.equal(edit.unchanged, true)
  assert.equal((await rowOf(row.id)).status, 'placed')
  assert.equal((await place({ ...row, review: { rating: 5, comment: 'great' } }, token)).unchanged, true, 'no review before the food arrives')

  const before = await stockOf('spud-1')
  const cancelled = await place({ ...row, status: 'cancelled', cancellation: { reason: 'Changed my mind' } }, token)
  assert.equal(cancelled.ok, true)
  const saved = await rowOf(row.id)
  assert.equal(saved.status, 'cancelled')
  assert.equal(saved.cancellation.reason, 'Changed my mind')
  assert.equal(await stockOf('spud-1'), before + 1, 'the stock comes back, once')
  await place({ ...row, status: 'cancelled' }, token)
  assert.equal(await stockOf('spud-1'), before + 1)

  // Once the kitchen has accepted, cancelling online is too late.
  const second = webRow([drinkLine(1)])
  const placed = await place(second)
  const staffCopy = await rowOf(second.id)
  await rpc(db, 'jsp_orders_put', { p_device: tillToken, p_rows: [{ ...staffCopy, status: 'accepted', created_at: staffCopy.created_at.toISOString(), updated_at: isoNow() }] })
  assert.equal((await place({ ...second, status: 'cancelled' }, placed.token)).error, 'too_late')
  await rpc(db, 'jsp_orders_put', { p_device: tillToken, p_rows: [{ ...staffCopy, status: 'collected', created_at: staffCopy.created_at.toISOString(), updated_at: isoNow() }] })
  assert.equal((await place({ ...second, review: { rating: 9, comment: 'Lovely', tags: ['Hot'] } }, placed.token)).ok, true)
  const reviewed = await rowOf(second.id)
  assert.equal(reviewed.review.rating, 5, 'ratings are 1 to 5')
  assert.equal(reviewed.track_token, placed.token, 'staff updates keep the customer’s key')
})

await test('tracking on another phone needs the order number and the phone’s last digits or the postcode', async () => {
  const row = webRow([drinkLine(1)], { customer: { phone: '07700 900777', postcode: 'HP20 1SN' } })
  const placed = await place(row)
  const byPhone = await rpc(db, 'jsp_track_lookup', { p_ref: row.short_id.toLowerCase(), p_verify: '0777' }, { ip: '198.51.100.20' })
  assert.deepEqual([byPhone.ok, byPhone.id, byPhone.token], [true, row.id, placed.token])
  assert.equal((await rpc(db, 'jsp_track_lookup', { p_ref: row.id, p_verify: 'hp20 1sn' }, { ip: '198.51.100.20' })).ok, true)
  const digitsOnly = await rpc(db, 'jsp_track_lookup', { p_ref: row.short_id.replace('JS-W-', ''), p_verify: '07700 900777' }, { ip: '198.51.100.20' })
  assert.equal(digitsOnly.id, row.id, 'the bare number off the receipt works too')
  assert.equal((await rpc(db, 'jsp_track_lookup', { p_ref: row.short_id, p_verify: '1234' }, { ip: '198.51.100.20' })).error, 'not_found')
  assert.equal((await rpc(db, 'jsp_track_lookup', { p_ref: row.short_id, p_verify: '77' }, { ip: '198.51.100.20' })).error, 'not_found', 'two digits is not enough')
  for (let i = 0; i < 10; i++) await rpc(db, 'jsp_track_lookup', { p_ref: 'JS-W-00000', p_verify: '0000' }, { ip: '198.51.100.21' })
  assert.equal((await rpc(db, 'jsp_track_lookup', { p_ref: row.short_id, p_verify: '0777' }, { ip: '198.51.100.21' })).error, 'rate', 'guessing is cut off')
})

await test('staff devices list and update orders; an older copy never overwrites a newer one; unpaired devices get nothing', async () => {
  await rejects(rpc(db, 'jsp_orders_list', { p_device: 'nope' }), /not paired/)
  await rejects(rpc(db, 'jsp_orders_put', { p_device: 'nope', p_rows: [] }), /not paired/)
  await rejects(rpc(db, 'jsp_stock_put', { p_device: 'nope', p_rows: [] }), /not paired/)
  const all = await rpc(db, 'jsp_orders_list', { p_device: tillToken, p_since: '2020-01-01T00:00:00Z', p_limit: 500 })
  assert.ok(all.length >= 8)
  const till = { id: 'ord-1800000000000-22222', short_id: 'JS-T-22222', status: 'accepted', fulfilment: 'pickup', customer: { name: 'Counter' }, lines: [], payment: { total: 500, status: 'paid' }, timeline: [], created_at: isoNow(), updated_at: '2026-11-20T12:00:00.000Z' }
  assert.equal(await rpc(db, 'jsp_orders_put', { p_device: tillToken, p_rows: [till] }), true)
  await rpc(db, 'jsp_orders_put', { p_device: tillToken, p_rows: [{ ...till, status: 'collected', updated_at: '2026-11-20T12:05:00.000Z' }] })
  await rpc(db, 'jsp_orders_put', { p_device: tillToken, p_rows: [{ ...till, status: 'preparing', updated_at: '2026-11-20T12:01:00.000Z' }] })
  assert.equal((await rowOf(till.id)).status, 'collected', 'a stale till copy arriving late is ignored')
  const one = await rpc(db, 'jsp_orders_list', { p_device: tillToken, p_ids: [till.id] })
  assert.equal(one.length, 1)
})

await test('too many orders from one phone in half an hour are cut off', async () => {
  const phone = '07700 900888'
  for (let i = 0; i < 6; i++) assert.equal((await place(webRow([drinkLine(1)], { customer: { phone } }))).ok, true, `order ${i + 1}`)
  assert.equal((await place(webRow([drinkLine(1)], { customer: { phone } }))).error, 'rate')
  assert.equal((await place(webRow([drinkLine(1)], { customer: { phone: '07700 900889' } }))).ok, true, 'other customers are unaffected')
})

await test('running the orders migration again keeps every order and key', async () => {
  const before = (await db.query('select id, track_token from public.orders order by id')).rows
  await db.exec(MIGRATION_ORDERS)
  assert.deepEqual((await db.query('select id, track_token from public.orders order by id')).rows, before)
  await rejects(asAnon(db, 'select id from public.orders'), /permission denied/)
})

await db.close()

// ===========================================================================
section('📱 Part 2 — the app’s sign-in and sync code against that database')
// ===========================================================================

// Created before the browser shim below: PGlite treats a global `window` as a browser.
const pg = await freshDb()

// Browser shim: the stores gate on `typeof window` and persist to localStorage.
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
globalThis.sessionStorage = undefined
globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.document = { body: { style: {} }, createElement: () => ({ style: {} }), addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' }
globalThis.BroadcastChannel = class {
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

// Never let a test reach the live project (supabase.ts falls back to it).
process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'placeholder'
process.env.VITE_FIREBASE_API_KEY = ''

const { createServer } = await import('vite')
// configFile: false — the app's vite.config.ts warms up the whole client app and
// pre-bundles React at start-up; when that finished mid-run Vite reloaded its module
// graph and the tests ended up talking to two copies of the same store.
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
})
const load = (p) => vite.ssrLoadModule(p)
if ((await load('/src/services/supabase.ts')).isSupabaseConfigured) throw new Error('Refusing to run: Supabase is configured')
const cloud = await load('/src/services/cloudSync.ts')
const authStore = await load('/src/services/authStore.ts')
const staffAuth = await load('/src/services/staffAuth.ts')
const serverState = await load('/src/services/serverAuthState.ts')
const roster = await load('/src/services/staffRoster.ts')
const terminalLock = await load('/src/services/terminalLockStore.ts')
const menuStore = await load('/src/services/menuStore.ts')
const { createMemoryBackend } = await load('/src/services/sync/backend.ts')
const orderStore = await load('/src/services/orderStore.ts')
const orderRows = await load('/src/services/supabaseOrderSync.ts')
const checkout = await load('/src/services/checkout.ts')
const deliverySettings = await load('/src/services/deliverySettingsStore.ts')

const iso = (v) => (v instanceof Date ? v.toISOString() : v)

/**
 * The app's backend contract on top of PGlite, as the public key sees it:
 * table reads and writes run as `anon` (so row security applies), database
 * functions as PostgREST would call them. Stock and orders stay in memory.
 */
function pgliteBackend(pg) {
  const mem = createMemoryBackend()
  const asAnonTx = (fn) =>
    pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.headers', '{"cf-connecting-ip":"192.0.2.10"}', true)`)
      await tx.query('set local role anon')
      return fn(tx)
    })
  mem.listKv = async (prefix, opts) => {
    if (mem.state.fail) return null
    const where = ['left(store_id, length($1)) = $1']
    const params = [prefix]
    if (opts?.since) {
      params.push(opts.since)
      where.push(`updated_at >= $${params.length}`)
    }
    const rows = await asAnonTx((tx) =>
      tx.query(`select store_id, settings, updated_at from public.delivery_settings where ${where.join(' and ')} order by updated_at desc ${opts?.limit ? `limit ${Number(opts.limit)}` : ''}`, params),
    )
    return rows.rows.map((r) => ({ key: r.store_id, value: r.settings, updatedAt: iso(r.updated_at) }))
  }
  mem.putKv = async (rows) => {
    if (mem.state.fail) return false
    try {
      await asAnonTx(async (tx) => {
        for (const r of rows) {
          await tx.query(
            'insert into public.delivery_settings (store_id, settings, updated_at) values ($1, $2, $3) on conflict (store_id) do update set settings = excluded.settings, updated_at = excluded.updated_at',
            [r.key, JSON.stringify(r.value), r.updatedAt],
          )
        }
      })
      return true
    } catch {
      return false
    }
  }
  // Orders and stock straight from the tables, as the public key — allowed before
  // the orders migration, refused after it.
  mem.fetchOrders = async (query) => {
    if (mem.state.fail) return null
    try {
      const rows = await asAnonTx((tx) => tx.query('select * from public.orders order by created_at desc'))
      return rows.rows
        .map((r) => orderRows.rowToOrder(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)]))))
        .filter((o) => (!query.ids || query.ids.includes(o.id)) && (!query.since || o.createdAt >= query.since))
    } catch {
      return null
    }
  }
  mem.upsertOrders = async (orders) => {
    if (mem.state.fail) return false
    try {
      await asAnonTx(async (tx) => {
        for (const o of orders) {
          const r = orderRows.orderToRow(o)
          await tx.query(
            `insert into public.orders (id, short_id, status, fulfilment, customer, lines, payment, timeline, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             on conflict (id) do update set status = excluded.status, payment = excluded.payment, timeline = excluded.timeline, updated_at = excluded.updated_at`,
            [r.id, r.short_id, r.status, r.fulfilment, JSON.stringify(r.customer), JSON.stringify(r.lines), JSON.stringify(r.payment), JSON.stringify(r.timeline), r.created_at, r.updated_at],
          )
        }
      })
      return true
    } catch {
      return false
    }
  }
  mem.listStock = async () => {
    if (mem.state.fail) return null
    const rows = await asAnonTx((tx) => tx.query('select id, remaining_count, updated_at from public.menu_stock'))
    return rows.rows.filter((r) => typeof r.remaining_count === 'number').map((r) => ({ id: r.id, qty: r.remaining_count, updatedAt: iso(r.updated_at) }))
  }
  mem.putStock = async (rows) => {
    if (mem.state.fail) return false
    try {
      await asAnonTx(async (tx) => {
        for (const r of rows) {
          await tx.query(
            `insert into public.menu_stock (id, remaining_count, is_sold_out) values ($1, $2, $2 <= 0) on conflict (id, store_id) do update set remaining_count = excluded.remaining_count, is_sold_out = excluded.is_sold_out, updated_at = now()`,
            [r.id, r.qty],
          )
        }
      })
      return true
    } catch {
      return false
    }
  }
  mem.state.rpc = async (fn, args) => {
    try {
      const data = await rpc(pg, fn, args, { ip: '192.0.2.10' })
      // PostgREST sends timestamps as text.
      return { ok: true, data: Array.isArray(data) ? data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)]))) : data }
    } catch (err) {
      const msg = String(err.message)
      if (/does not exist/.test(msg)) return { ok: false, kind: 'missing', message: msg }
      if (/not paired|permission denied/.test(msg)) return { ok: false, kind: 'denied', message: msg }
      return { ok: false, kind: 'error', message: msg }
    }
  }
  return mem
}

const backend = pgliteBackend(pg)

await test('before the migration the app keeps the old sign-in; afterwards it switches to the server by itself', async () => {
  await cloud.startCloudSync({ backend, timers: false })
  assert.equal(serverState.getServerAuthMode(), 'legacy')
  const boot2 = await migrate(pg)
  globalThis.__boot = boot2
  await cloud.refreshServerAuth()
  assert.equal(serverState.getServerAuthMode(), 'server')
  serverState.setServerAuthMode('legacy')
  assert.equal(serverState.getServerAuthMode(), 'server', 'never back to the old sign-in')
})

const boot2 = globalThis.__boot
const ownerTemp = tempPinFor(boot2, 'usr-owner-1')

await test('an unpaired browser cannot even try a PIN', async () => {
  const res = await authStore.signInWithPin(ownerTemp)
  assert.equal(res.ok, false)
  assert.match(res.message, /isn.t paired/)
  assert.equal(authStore.getCurrentUser(), null)
})

await test('pairing with the code from the SQL editor, then the owner signs in with the temporary PIN', async () => {
  const bad = await staffAuth.pairThisDevice('ZZZZ-ZZZZ', terminalLock.getLocalDeviceId(), 'Front till')
  assert.equal(bad.ok, false)
  const paired = await staffAuth.pairThisDevice(pairingCodeIn(boot2), terminalLock.getLocalDeviceId(), 'Front till')
  assert.equal(paired.ok, true)
  assert.equal(serverState.isDevicePaired(), true)
  const res = await authStore.signInWithPin(ownerTemp)
  assert.equal(res.ok, true)
  assert.equal(res.mustChangePin, true)
  const user = authStore.getCurrentUser()
  assert.equal(user.id, 'usr-owner-1')
  assert.equal(user.authMode, 'server')
  assert.match(user.serverToken, /^[0-9a-f]{64}$/)
  assert.equal((await authStore.verifyManagerPinAsync(ownerTemp)).ok, false, 'a temporary PIN approves nothing')
})

await test('choosing your own PIN: the rules come from the server, and the new PIN works everywhere', async () => {
  assert.match((await authStore.changeMyPin('4826')).message, /6 to 8 digits/)
  assert.equal((await authStore.changeMyPin('582914')).ok, true)
  assert.equal(authStore.getCurrentUser().mustChangePin, false)
  const approve = await authStore.verifyManagerPinAsync('582914')
  assert.equal(approve.ok, true)
  assert.equal(approve.managerName, 'Sunny (Store Owner)')
  await cloud.syncNow()
  const sunny = roster.getRoster().find((m) => m.id === 'usr-owner-1')
  assert.equal(sunny.pinSet, true)
  assert.equal(sunny.mustChange, false)
  assert.ok(roster.getRoster().every((m) => !m.pinHash), 'no PIN data in this browser')
  assert.ok(!localStorage.getItem('just_spuds_drivers_v1')?.includes('$'), 'no driver PIN hashes either')
})

await test('the admin console signs in through the server and unlocks the vault', async () => {
  const res = await authStore.loginAdminConsoleVerified('582914')
  assert.equal(res.ok, true, res.message)
  assert.equal(authStore.isAdminVaultUnlocked(), true)
  const wrong = await authStore.loginAdminConsoleVerified('604917')
  assert.equal(wrong.ok, false)
})

await test('changes are written through the server (direct writes are refused) and private documents arrive', async () => {
  assert.equal(await backend.putKv([{ key: 'just_spuds::doc::menu.promos', value: { data: [] }, updatedAt: new Date().toISOString() }]), false)
  const product = menuStore.getProducts()[0]
  menuStore.saveProduct({ ...product, price: product.price + 10 })
  const enrolled = await terminalLock.enrollThisDevice('Sunny (Store Owner)', 'Front till', 'master_till')
  assert.equal(enrolled.ok, true)
  assert.equal(await cloud.syncNow(), true)
  const rows = Object.fromEntries((await pg.query('select store_id, settings from public.delivery_settings')).rows.map((r) => [r.store_id, r.settings]))
  const saved = rows['just_spuds::doc::menu.products'].data.find((p) => p.id === product.id)
  assert.equal(saved.price, product.price + 10)
  const reg = rows['just_spuds::priv::terminal.registry'].data
  assert.ok(reg.enrolledTerminals.some((t) => t.deviceId === terminalLock.getLocalDeviceId()))
  assert.ok(reg.enrolledTerminals.some((t) => t.deviceId === 'term_a'), 'the till list already on the server was kept')
})

let cashierId = ''
await test('a manager adds a cashier with a temporary PIN; the cashier picks their own at first sign-in', async () => {
  const token = authStore.currentSessionToken()
  const added = await staffAuth.adminSavePerson(token, { kind: 'staff', name: 'Priya Patel', role: 'CASHIER' })
  assert.equal(added.ok, true)
  cashierId = added.id
  assert.equal((await staffAuth.adminSetPin(token, cashierId, '3907')).ok, true)
  const first = await authStore.signInWithPin('3907')
  assert.equal(first.ok, true)
  assert.equal(first.mustChangePin, true)
  assert.equal(authStore.getCurrentUser().id, cashierId, 'a brand-new person is accepted before the staff list re-syncs')
  assert.equal((await authStore.changeMyPin('7351')).ok, true)
  const again = await authStore.signInWithPin('7351', ['CASHIER', 'SUPERVISOR'])
  assert.equal(again.ok, true)
  assert.equal(again.mustChangePin, false)
  const noAccess = await authStore.signInWithPin('7351', ['STORE_MANAGER'])
  assert.equal(noAccess.ok, false)
})

await test('offline, people who signed in on this device recently can still sign in; nobody else can', async () => {
  await authStore.signInWithPin('7351')
  await staffAuth.whenOfflinePinsSaved() // the offline copy is hashed in the background
  backend.state.fail = true
  try {
    const off = await authStore.signInWithPin('7351')
    assert.equal(off.ok, true)
    assert.equal(authStore.getCurrentUser().authMode, 'offline')
    assert.match(off.message, /offline/)
    const owner = await authStore.verifyPinAsync('582914')
    assert.equal(owner.ok, true, 'the owner signed in here earlier too')
    const stranger = await authStore.signInWithPin('6043')
    assert.equal(stranger.ok, false)
    assert.match(stranger.message, /last 7 days/)
  } finally {
    backend.state.fail = false
  }
})

await test('disabling the cashier ends their session on this device at the next check', async () => {
  const owner = await authStore.signInWithPin('582914')
  const ownerToken = owner.user.serverToken
  const cashier = await authStore.signInWithPin('7351')
  assert.equal(cashier.ok, true)
  assert.equal((await staffAuth.adminSavePerson(ownerToken, { id: cashierId, kind: 'staff', active: false })).ok, false, 'the owner session ended when the cashier signed in on this till')
  const owner2 = await authStore.verifyPinAsync('582914')
  assert.equal(owner2.ok, true)
  const ownerAgain = (await rpc(pg, 'jsp_check_pin', { p_device: serverState.getDeviceToken(), p_pin: '582914', p_open_session: true })).session.token
  assert.equal((await staffAuth.adminSavePerson(ownerAgain, { id: cashierId, kind: 'staff', active: false })).ok, true)
  await authStore.checkServerSession()
  assert.equal(authStore.getCurrentUser(), null)
})

// ---- Orders behind the server: first on this paired till -------------------
const midday = () => {
  const d = new Date()
  d.setHours(13, 0, 0, 0)
  return d
}
const pgOrder = async (id) => (await pg.query('select * from public.orders where id = $1', [id])).rows[0]
const pgStock = async (id) => (await pg.query('select remaining_count from public.menu_stock where id = $1', [id])).rows[0]?.remaining_count

await test('after the orders migration a paired till writes orders and stock through the server, never the table', async () => {
  await pg.exec(MIGRATION_ORDERS)
  await cloud.refreshServerAuth()
  assert.equal(serverState.isOrdersServer(), true)
  assert.equal((await authStore.signInWithPin('582914')).ok, true)

  const product = menuStore.getProducts()[0]
  menuStore.adjustProductStock(product.id, 5, 'Sunny', 'stock take')
  deliverySettings.saveDeliverySettings({ isOnlineOrderingEnabled: true, deliveryFeePence: 400, freeDeliveryThresholdPence: 2500, minOrderPence: 1000 })
  const sale = orderStore.createManualCounterOrder(
    { fulfilment: 'pickup', customer: { name: 'Counter', phone: '01296 423456', email: '' }, lines: [{ lineId: 'l1', productId: product.id, name: product.name, base: product.price, extras: [], sauces: [], meal: false, image: '', category: product.category, qty: 1 }], paymentMethod: 'cash', paymentStatus: 'paid' },
    'Sunny',
  )
  assert.equal(await cloud.syncNow(), true)
  const saved = await pgOrder(sale.id)
  assert.equal(saved.short_id, sale.shortId, 'the till sale reached the server')
  assert.equal(saved.payment.status, 'paid')
  assert.equal(await pgStock(product.id), 4, 'the till set the count and its sale took one')
  // The old direct routes are closed.
  assert.equal(await backend.upsertOrders([sale]), false)
  assert.equal(await backend.fetchOrders({}), null)
  assert.equal(await backend.putStock([{ id: product.id, qty: 99 }]), false)
  const settings = (await pg.query(`select settings from public.delivery_settings where store_id = 'just_spuds::doc::delivery.settings'`)).rows[0].settings
  assert.equal(settings.data.isOnlineOrderingEnabled, true)
})

await test('a manager unpairs this device from elsewhere: it forgets its token and every session on it', async () => {
  const owner = (await rpc(pg, 'jsp_check_pin', { p_device: serverState.getDeviceToken(), p_pin: '582914', p_open_session: true })).session.token
  await authStore.signInWithPin('582914')
  assert.equal((await staffAuth.adminDevice(owner, terminalLock.getLocalDeviceId(), 'revoke')).ok, true)
  await cloud.refreshServerAuth()
  assert.equal(serverState.isDevicePaired(), false)
  assert.equal(authStore.getCurrentUser(), null)
  const res = await authStore.signInWithPin('582914')
  assert.match(res.message, /isn.t paired/)
})

// ---- …then as a customer's browser (no pairing, no staff flag) --------------
localStorage.removeItem('just_spuds_staff_device_v1')
localStorage.removeItem('just_spuds_orders_v1')
const customer = { name: 'Sarah Mitchell', phone: '07700 900321', email: '' }
const basket = (qty = 1) => {
  const p = menuStore.getProducts()[0]
  return {
    fulfilment: 'pickup',
    customer,
    lines: [{ lineId: `l-${Math.random()}`, productId: p.id, name: p.name, base: p.price, extras: [], sauces: [], meal: false, image: '', category: p.category, qty }],
    subtotal: p.price * qty,
    deliveryFee: 0,
    serviceFee: 49,
    tip: 0,
    discount: 0,
    total: p.price * qty + 49,
    paymentMethod: 'in_store',
  }
}

let webOrder
await test('a customer’s order is placed through the server and comes back with a tracking key', async () => {
  const p = menuStore.getProducts()[0]
  const res = await checkout.processCheckout(basket(1), midday())
  assert.equal(res.ok, true, res.reason)
  webOrder = res.order
  const saved = await pgOrder(webOrder.id)
  assert.equal(saved.status, 'placed')
  assert.equal(saved.payment.status, 'pending_store')
  assert.equal(saved.payment.total, p.price + 49)
  assert.match(serverState.getOrderToken(webOrder.id), /^[0-9a-f]{32}$/)
  assert.equal(await pgStock(p.id), 3, 'the server took the stock — the browser sent no stock change of its own')
  await cloud.syncNow()
  assert.equal(await pgStock(p.id), 3)
})

await test('the server’s "no" is shown at checkout and leaves nothing behind on the phone', async () => {
  const p = menuStore.getProducts()[0]
  // The owner put the price up; this phone still has the old menu.
  await pg.query(
    `update public.delivery_settings set settings = jsonb_set(settings, '{data,0,price}', '999') where store_id = 'just_spuds::doc::menu.products'`,
  )
  const before = orderStore.getStoredOrders().length
  const res = await checkout.processCheckout(basket(1), midday())
  assert.equal(res.ok, false)
  assert.match(res.reason, /Prices have changed/)
  assert.equal(orderStore.getStoredOrders().length, before, 'no phantom order on the tracking page')
  assert.equal(await pgStock(p.id), 3, 'and no stock taken')
  await pg.query(
    `update public.delivery_settings set settings = jsonb_set(settings, '{data,0,price}', $1::jsonb) where store_id = 'just_spuds::doc::menu.products'`,
    [String(p.price)],
  )
  // Sold out between basket and checkout.
  const tooMany = await checkout.processCheckout(basket(3), midday())
  assert.equal(tooMany.ok, true, 'three left, three ordered')
  const none = await checkout.processCheckout(basket(1), midday())
  assert.equal(none.ok, false)
  assert.match(none.reason, /sold out|out of stock/i)
})

await test('offline, the order waits on the phone and is placed when the shop can be reached', async () => {
  await pg.query(`update public.menu_stock set remaining_count = 10, updated_at = now()`)
  await cloud.syncNow({ fullOrders: true }) // the restock reaches this phone
  backend.state.fail = true
  const res = await checkout.processCheckout(basket(1), midday())
  backend.state.fail = false
  assert.equal(res.ok, true, res.reason)
  assert.equal(await pgOrder(res.order.id), undefined, 'not on the server yet')
  await cloud.syncNow()
  assert.equal((await pgOrder(res.order.id)).status, 'placed')
})

await test('a customer can cancel until the kitchen accepts; after that the kitchen’s copy stands', async () => {
  const p = menuStore.getProducts()[0]
  const stock = await pgStock(p.id)
  assert.equal(orderStore.cancelOrder(webOrder.id, 'Changed my mind').ok, true)
  await cloud.syncNow()
  assert.equal((await pgOrder(webOrder.id)).status, 'cancelled')
  assert.equal(await pgStock(p.id), stock + 1, 'the server put the stock back')

  const second = (await checkout.processCheckout(basket(1), midday())).order
  await pg.query(`update public.orders set status = 'baking', updated_at = now() where id = $1`, [second.id])
  assert.equal(orderStore.cancelOrder(second.id, 'Too slow').ok, true, 'this phone has not heard the kitchen started')
  await cloud.syncNow()
  assert.equal((await pgOrder(second.id)).status, 'baking', 'the server refused the late cancel')
  assert.equal(orderStore.getOrderById(second.id).status, 'baking', 'and the phone shows the kitchen’s copy again')
})

await test('an order can be tracked from another phone with its number and the phone’s last digits', async () => {
  const id = webOrder.id
  localStorage.removeItem('just_spuds_orders_v1')
  localStorage.removeItem('just_spuds_order_tokens_v1')
  localStorage.removeItem('just_spuds_customer_placed_order_ids_v1')
  localStorage.removeItem('just_spuds_active_order_id')
  assert.equal(orderStore.getOrderById(id), undefined)
  const wrong = await cloud.lookupOrderOnServer(webOrder.shortId, '9999')
  assert.equal(wrong.ok, false)
  assert.match(wrong.message, /couldn't match/)
  const found = await cloud.lookupOrderOnServer(webOrder.shortId, '0321')
  assert.equal(found.ok, true)
  assert.equal(found.id, id)
  assert.equal(orderStore.getOrderById(id).customer.name, 'Sarah Mitchell')
})

cloud.stopCloudSync()
await vite.close()
await pg.close()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
