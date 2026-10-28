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
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const MIGRATION = readFileSync(new URL('../supabase/migrations/20261028_staff_security.sql', import.meta.url), 'utf8')
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

/** Call an exposed function the way the website does: as the anon role, from an IP. */
async function rpc(db, fn, args = {}, { ip = '203.0.113.7' } = {}) {
  const names = Object.keys(args)
  const values = names.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]))
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'cf-connecting-ip': ip })])
    await tx.query('set local role anon')
    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`
    if (fn === 'jsp_sync_list') return (await tx.query(`select * from ${call}`, values)).rows
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
await load('/src/services/orderStore.ts')
const { createMemoryBackend } = await load('/src/services/sync/backend.ts')

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
  mem.state.rpc = async (fn, args) => {
    try {
      const data = await rpc(pg, fn, args, { ip: '192.0.2.10' })
      return { ok: true, data: Array.isArray(data) ? data.map((r) => ({ ...r, updated_at: iso(r.updated_at) })) : data }
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

cloud.stopCloudSync()
await vite.close()
await pg.close()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
