import { useEffect, useState } from 'react'
import {
  getDeviceId,
  getEpoch,
  publishAllDocs,
  startFresh,
  subscribeSyncStatus,
  syncNow,
  type SyncStatus,
} from '../../../services/cloudSync'
import { subscribeRoster, type StaffMember } from '../../../services/staffRoster'
import { getDrivers, subscribeDrivers } from '../../../services/driverStore'
import {
  getBusinessDetails,
  getConfiguredHours,
  getProducts,
  getStoreSettings,
  saveStoreSettings,
  subscribeMenu,
} from '../../../services/menuStore'
import { getDeliverySettings, saveDeliverySettings, subscribeDeliverySettings } from '../../../services/deliverySettingsStore'
import { DEFAULT_SOUND_URLS, previewAlertSound } from '../../../services/alertSoundBus'
import { logAuditEvent } from '../../../services/auditStore'
import type { AuthUser } from '../../../services/authStore'
import { cx } from '../../../utils/format'

type Tab = 'staff' | 'drivers' | 'delivery' | 'products'

interface GoLivePanelProps {
  user: AuthUser | null
  onGoTo: (tab: Tab) => void
  onSimulateRush: () => void
}

type Level = 'done' | 'todo' | 'warn' | 'info'

function Item({ level, title, children, action }: { level: Level; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const icon = level === 'done' ? '✓' : level === 'todo' ? '!' : level === 'warn' ? '•' : 'i'
  const tone =
    level === 'done'
      ? 'bg-emerald-500 text-ink'
      : level === 'todo'
      ? 'bg-red-500 text-white'
      : level === 'warn'
      ? 'bg-amber-400 text-ink'
      : 'bg-white/15 text-white'
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black', tone)} aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          {children && <div className="mt-0.5 text-[12px] leading-relaxed text-white/60">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{action}</div>}
    </li>
  )
}

const btn = 'rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/15'
const btnPrimary = 'rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-black text-ink hover:bg-amber-300'

/**
 * Admin › Go-Live: everything that has to be true before the shop takes real
 * orders, checked live, with the fix one tap away. Nothing here is decorative —
 * each line reads the same state the tills and the website use.
 */
export default function GoLivePanel({ user, onGoTo, onSimulateRush }: GoLivePanelProps) {
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [members, setMembers] = useState<StaffMember[]>([])
  const [driversOnStarter, setDriversOnStarter] = useState(0)
  const [delivery, setDelivery] = useState(() => getDeliverySettings())
  const [, setMenuTick] = useState(0)
  const [soundFile, setSoundFile] = useState<'checking' | 'found' | 'missing'>('checking')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const actor = user?.name || 'Manager'

  const business = getBusinessDetails()
  const settings = getStoreSettings()
  const [form, setForm] = useState(() => ({
    storeName: business.name,
    phone: business.phone,
    address: business.address,
    vatNumber: settings.vatNumber || '',
    googleReviews: settings.social?.googleReviews || '',
    instagram: settings.social?.instagram || '',
    facebook: settings.social?.facebook || '',
  }))

  useEffect(() => {
    const unsubs = [
      subscribeSyncStatus(setSync),
      subscribeRoster(setMembers),
      subscribeDrivers(() => setDriversOnStarter(getDrivers().filter((d) => d.status === 'ACTIVE' && d.defaultPin).length)),
      subscribeDeliverySettings(setDelivery),
      subscribeMenu(() => setMenuTick((n) => n + 1)),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  // The SPA answers 200 with HTML for any path, so trust the content type.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const url of DEFAULT_SOUND_URLS) {
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
          if (res.ok && (res.headers.get('content-type') || '').startsWith('audio/')) {
            if (!cancelled) setSoundFile('found')
            return
          }
        } catch {
          // next
        }
      }
      if (!cancelled) setSoundFile('missing')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const say = (m: string) => {
    setMessage(m)
    window.setTimeout(() => setMessage(null), 5000)
  }

  const onStarter = members.filter((m) => m.status === 'ACTIVE' && m.defaultPin)
  const pinsDone = onStarter.length === 0 && driversOnStarter === 0
  const detailsDone = Boolean(business.phone && business.address)
  const syncDone = sync?.state === 'synced'
  const today = getConfiguredHours(new Date())
  const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  const products = getProducts()
  const offSale = products.filter((p) => p.available === false || (p.stockQuantity ?? 1) <= 0).length
  const epoch = getEpoch()

  const required = [syncDone, pinsDone, detailsDone]
  const readyCount = required.filter(Boolean).length

  const saveDetails = (e: React.FormEvent) => {
    e.preventDefault()
    const current = getStoreSettings()
    saveStoreSettings({
      ...current,
      storeName: form.storeName.trim() || current.storeName,
      phone: form.phone.trim(),
      address: form.address.trim(),
      vatNumber: form.vatNumber.trim().toUpperCase() || undefined,
      social: { googleReviews: form.googleReviews.trim(), instagram: form.instagram.trim(), facebook: form.facebook.trim() },
    })
    logAuditEvent(actor, 'store.business_details_updated', 'Business details', `phone=${form.phone.trim()}, vat=${form.vatNumber.trim() || '—'}`)
    say('Business details saved — receipts and the website use them now, on every device.')
  }

  const toggleOnline = () => {
    const next = !delivery.isOnlineOrderingEnabled
    if (next && !window.confirm('Switch online ordering ON? Customers will be able to place real orders from the website straight away.')) return
    saveDeliverySettings({ isOnlineOrderingEnabled: next })
    logAuditEvent(actor, 'store.online_ordering', 'Website', next ? 'switched ON' : 'switched OFF')
  }

  const doStartFresh = async () => {
    const typed = window.prompt(
      'This clears every order, till shift, timecard and audit entry made before now — on every device — so you open with clean books. Menu, prices, stock, staff and settings are kept.\n\nDo it before opening the till on launch day.\n\nType START to confirm:',
    )
    if (typed?.trim().toUpperCase() !== 'START') return
    setBusy('fresh')
    const res = await startFresh(actor)
    setBusy(null)
    say(res.message)
  }

  const inputCls = 'w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none'

  return (
    <div className="space-y-6 font-body">
      <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-2xl font-bold text-white">🚀 Go-live checklist</h2>
            <p className="mt-1 text-xs text-white/60">Everything that must be true before real customers order. Each line is checked live.</p>
          </div>
          <p className={cx('rounded-full px-3 py-1 text-xs font-black', readyCount === required.length ? 'bg-emerald-500 text-ink' : 'bg-red-500 text-white')}>
            {readyCount}/{required.length} essentials ready
          </p>
        </div>
        {message && <p className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">{message}</p>}
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/5">
        <h3 className="border-b border-white/10 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white/50">Essentials</h3>
        <ul className="divide-y divide-white/10">
          <Item
            level={syncDone ? 'done' : sync?.state === 'off' ? 'todo' : 'warn'}
            title={syncDone ? 'All devices are in sync' : sync?.state === 'off' ? 'Cloud sync is not configured' : 'This device is not in sync yet'}
            action={
              <>
                <button type="button" className={btn} onClick={async () => { setBusy('sync'); const ok = await syncNow({ fullOrders: true }); setBusy(null); say(ok ? 'Synced.' : 'Could not reach the server — check the internet connection.') }}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  type="button"
                  className={btn}
                  title="Use when this device has the correct menu and settings and the others do not"
                  onClick={async () => {
                    if (!window.confirm("Make THIS device's menu, prices, hours and settings the shop's copy on every device?")) return
                    setBusy('publish')
                    const ok = await publishAllDocs()
                    setBusy(null)
                    say(ok ? 'Published to every device.' : 'Could not publish — check the connection.')
                  }}
                >
                  {busy === 'publish' ? 'Publishing…' : 'Publish this device’s menu'}
                </button>
              </>
            }
          >
            Orders, menu, prices, sold-out items, hours, the online switch, staff PINs, shifts and timecards are shared between the till, kitchen screen, driver phones and this console.
            {sync && (
              <span className="block text-white/40">
                Device {getDeviceId()} · {sync.pending ? `${sync.pending} change(s) waiting to upload · ` : ''}
                {sync.lastSyncAt ? `last synced ${new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'not synced yet'}
              </span>
            )}
          </Item>

          <Item
            level={pinsDone ? 'done' : 'todo'}
            title={pinsDone ? 'Everyone has their own PIN' : 'Change the starter PINs'}
            action={
              !pinsDone && (
                <>
                  {onStarter.length > 0 && <button type="button" className={btnPrimary} onClick={() => onGoTo('staff')}>Staff PINs →</button>}
                  {driversOnStarter > 0 && <button type="button" className={btnPrimary} onClick={() => onGoTo('drivers')}>Driver PINs →</button>}
                </>
              )
            }
          >
            {pinsDone
              ? 'The PINs that ship with the app no longer work anywhere.'
              : `${onStarter.length + driversOnStarter} account(s) still use a PIN that is published with the app's source code. Anyone who reads it could sign in.`}
          </Item>

          <Item level={detailsDone ? 'done' : 'todo'} title="Business details on receipts and the website">
            <form onSubmit={saveDetails} className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Shop name</span>
                <input className={inputCls} value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Shop phone (customers call this)</span>
                <input className={inputCls} value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Address (comma-separated lines)</span>
                <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">VAT number — only if VAT-registered</span>
                <input className={inputCls} value={form.vatNumber} placeholder="GB 123 4567 89" onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Google review link</span>
                <input className={inputCls} value={form.googleReviews} placeholder="https://g.page/r/…/review" onChange={(e) => setForm({ ...form, googleReviews: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Instagram page</span>
                <input className={inputCls} value={form.instagram} placeholder="https://instagram.com/…" onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Facebook page</span>
                <input className={inputCls} value={form.facebook} placeholder="https://facebook.com/…" onChange={(e) => setForm({ ...form, facebook: e.target.value })} />
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-white/40">
                  Receipts print the VAT number only when one is entered. Social links stay hidden on the website until they point at a real page.
                </p>
                <button type="submit" className={btnPrimary}>Save details</button>
              </div>
            </form>
          </Item>
        </ul>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5">
        <h3 className="border-b border-white/10 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white/50">Before the doors open</h3>
        <ul className="divide-y divide-white/10">
          <Item
            level={delivery.isOnlineOrderingEnabled ? 'done' : 'info'}
            title={delivery.isOnlineOrderingEnabled ? 'Online ordering is ON' : 'Online ordering is OFF (website shows “launching soon”)'}
            action={
              <button type="button" className={delivery.isOnlineOrderingEnabled ? btn : btnPrimary} onClick={toggleOnline}>
                {delivery.isOnlineOrderingEnabled ? 'Switch off' : 'Switch on'}
              </button>
            }
          >
            Reaches every customer's browser within seconds. Leave it off until the kitchen screen is set up and the alarm has been tested.
          </Item>

          <Item
            level={today.isClosed ? 'warn' : 'done'}
            title={today.isClosed ? 'Closed today (per opening hours)' : `Open today ${fmt(today.openHour)}–${fmt(today.closeHour)}`}
            action={<button type="button" className={btn} onClick={() => onGoTo('delivery')}>Edit hours →</button>}
          >
            Web orders are refused outside these hours (last delivery orders 30 min before close, collection 15 min).
          </Item>

          <Item
            level={offSale > 0 ? 'warn' : 'done'}
            title={`${products.length} menu items${offSale ? ` · ${offSale} off sale` : ''}`}
            action={<button type="button" className={btn} onClick={() => onGoTo('products')}>Check menu & prices →</button>}
          >
            Check every price and set real stock counts — web orders stop at zero.
          </Item>

          <Item
            level={soundFile === 'found' ? 'done' : 'warn'}
            title={soundFile === 'found' ? 'New-order alarm sound installed' : soundFile === 'checking' ? 'Checking alarm sound…' : 'Alarm uses the built-in siren'}
            action={<button type="button" className={btn} onClick={() => previewAlertSound()}>▶ Test sound</button>}
          >
            {soundFile === 'found' ? 'Plays on the kitchen screen, till and here until each web order is accepted.' : 'Works fine. To use your own sound, add public/sounds/new-order.mp3 to the website.'}
          </Item>

          <Item
            level="info"
            title="Practise with a test rush"
            action={<button type="button" className={btn} onClick={onSimulateRush}>⚡ Send 2 test orders</button>}
          >
            Marked TEST everywhere and never counted in takings, stock or reports. Rings the alarm on every staff screen so the team can practise Accept / Decline.
          </Item>

          <Item level="info" title="Receipt printer & cash drawer (each till)">
            On the till: ⚙️ Settings → Connect USB printer, then “Test drawer kick”. Without a USB printer the browser print dialog is used.
          </Item>
        </ul>
      </section>

      <section className="rounded-3xl border border-red-500/30 bg-red-950/20">
        <h3 className="border-b border-red-500/20 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-red-300">Launch day</h3>
        <ul className="divide-y divide-red-500/20">
          <Item
            level={epoch ? 'done' : 'warn'}
            title={epoch ? `Trading fresh since ${new Date(epoch.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Start trading fresh'}
            action={
              <button type="button" onClick={doStartFresh} disabled={busy === 'fresh'} className="rounded-lg bg-red-500 px-3 py-1.5 text-[11px] font-black text-white hover:bg-red-400 disabled:opacity-50">
                {busy === 'fresh' ? 'Working…' : epoch ? 'Start fresh again' : 'Start trading fresh'}
              </button>
            }
          >
            Clears all test orders, shifts, timecards and audit entries on every device (menu, stock, staff and settings stay). Needs the internet. Do it before opening the till.
          </Item>
        </ul>
      </section>
    </div>
  )
}
