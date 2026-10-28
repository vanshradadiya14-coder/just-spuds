import { useEffect, useState } from 'react'
import {
  addStaffMember,
  ASSIGNABLE_ROLES,
  setStaffPin,
  subscribeRoster,
  updateStaffMember,
  type StaffMember,
} from '../../../services/staffRoster'
import { getDrivers, isDriverPinTaken, subscribeDrivers } from '../../../services/driverStore'
import { loginWithPin, currentSessionToken, ADMIN_CONSOLE_ROLES, type AuthUser, type Role } from '../../../services/authStore'
import { syncNow } from '../../../services/cloudSync'
import { isServerAuth, subscribeServerAuth } from '../../../services/serverAuthState'
import {
  adminDevice,
  adminDevices,
  adminEvents,
  adminPairingCode,
  adminSavePerson,
  adminSetPin,
  type ServerDevice,
  type ServerEvent,
} from '../../../services/staffAuth'
import {
  getEnrolledTerminals,
  enrollAndClaimMasterTerminal,
  revokeEnrolledTerminal,
  isStoreHardwareLockEnforced,
  setStoreHardwareLockEnforced,
  isTerminalEnrolled,
  getLocalDeviceId,
  getLocalDeviceName,
  hasAdminPasskey,
  setAdminPasskey,
  clearAdminPasskey,
  subscribeMasterTerminal,
  type EnrolledTerminalRecord,
} from '../../../services/terminalLockStore'
import { cx } from '../../../utils/format'

interface StaffAccountsProps {
  user: AuthUser | null
}

const CAN_MANAGE: Role[] = ['STORE_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']

const roleLabel = (role: Role) =>
  ASSIGNABLE_ROLES.find((r) => r.role === role)?.label ||
  (role === 'SUPER_ADMIN' ? 'System admin' : role.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()))

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function PinFields({
  onSubmit,
  submitLabel,
}: {
  onSubmit: (pin: string) => string | null | Promise<string | null>
  submitLabel: string
}) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        if (pin !== confirm) {
          setError('The two PINs do not match.')
          return
        }
        setBusy(true)
        const err = await onSubmit(pin)
        setBusy(false)
        setError(err)
        if (!err) {
          setPin('')
          setConfirm('')
        }
      }}
    >
      <input
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={8}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        placeholder="New PIN"
        aria-label="New PIN"
        className="w-28 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
      />
      <input
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={8}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
        placeholder="Repeat"
        aria-label="Repeat new PIN"
        className="w-28 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
      />
      <button type="submit" disabled={busy} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-ink hover:bg-amber-300 disabled:opacity-60">
        {busy ? 'Saving…' : submitLabel}
      </button>
      {error && <p className="basis-full text-[11px] font-bold text-red-300">{error}</p>}
    </form>
  )
}

const EVENT_LABELS: Record<string, string> = {
  sign_in: 'Sign-in',
  verify: 'PIN check',
  pair: 'Device paired',
  pin_change: 'Chose own PIN',
  pin_set: 'PIN set by manager',
  pin_reset: 'PIN reset (SQL editor)',
  person_saved: 'Account updated',
  pairing_code: 'Pairing code made',
  device_revoke: 'Device unpaired',
  device_unblock: 'Device unblocked',
  device_rename: 'Device renamed',
}

/**
 * Admin › Staff & PINs › Devices (server sign-in only). PINs only work on
 * paired devices, so this is where new tills, kitchen screens and phones get
 * a one-time code, and where a lost or blocked device is dealt with.
 */
function ServerDevicesPanel({ say }: { say: (msg: string) => void }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [devices, setDevices] = useState<ServerDevice[]>([])
  const [events, setEvents] = useState<ServerEvent[]>([])
  const [showEvents, setShowEvents] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const thisDevice = getLocalDeviceId()

  const load = async () => {
    const token = currentSessionToken()
    if (!token) {
      setError('Sign in again (online) to manage devices.')
      return
    }
    const [d, e] = await Promise.all([adminDevices(token), adminEvents(token, 40)])
    if (d.ok) setDevices(d.devices)
    else setError(d.message)
    if (e.ok) setEvents(e.events)
  }

  useEffect(() => {
    void load()
  }, [])

  const makeCode = async () => {
    const token = currentSessionToken()
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const res = await adminPairingCode(token)
    setBusy(false)
    if (res.ok) setCode({ code: res.code, expiresAt: res.expiresAt })
    else setError(res.message)
  }

  const act = async (device: ServerDevice, action: 'revoke' | 'unblock') => {
    if (action === 'revoke') {
      const warning =
        device.id === thisDevice
          ? 'Unpair THIS device? Nobody can sign in on it until it is paired again with a new code.'
          : `Unpair "${device.name}"? Everyone signed in on it is signed out, and it needs a new code to be used again.`
      if (!window.confirm(warning)) return
    }
    const token = currentSessionToken()
    if (!token) return
    const res = await adminDevice(token, device.id, action)
    if (res.ok) say(res.message)
    else setError(res.message)
    void load()
  }

  const live = devices.filter((d) => !d.revoked)
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-black/30 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">🔗 Paired devices ({live.length})</p>
          <p className="text-xs text-white/60 mt-0.5 max-w-xl">
            Staff PINs only work on devices the shop has paired, and the PINs themselves are checked by the shop's server. To add a till,
            kitchen screen or phone, make a code here and type it on that device within 15 minutes.
          </p>
        </div>
        <button type="button" onClick={makeCode} disabled={busy} className="rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-black text-ink hover:bg-amber-300 disabled:opacity-60">
          {busy ? 'Making a code…' : '+ Pair a new device'}
        </button>
      </div>

      {code && (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Pairing code — works once</p>
          <p className="font-mono text-3xl font-black tracking-[0.25em] text-white select-all">{code.code}</p>
          <p className="text-[11px] text-white/60">
            On the new device open the till, kitchen or admin sign-in page and type this code. Expires at{' '}
            {new Date(code.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        </div>
      )}

      {error && <p className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-2 text-xs font-bold text-rose-200">{error}</p>}

      {live.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/40">
          {live.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-white">
                  {d.name}
                  {d.id === thisDevice && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">This device</span>}
                  {d.blocked && <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">Blocked — too many wrong PINs</span>}
                  {!d.blocked && d.locked && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Locked for a moment</span>}
                </p>
                <p className="text-[11px] text-white/50">
                  Paired {when(d.pairedAt)}
                  {d.pairedBy ? ` by ${d.pairedBy}` : ''} · last seen {when(d.lastSeenAt)}
                </p>
              </div>
              <div className="flex gap-1.5">
                {(d.blocked || d.locked) && (
                  <button type="button" onClick={() => act(d, 'unblock')} className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/60">
                    Unblock
                  </button>
                )}
                <button type="button" onClick={() => act(d, 'revoke')} className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-900/60">
                  Unpair
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <button type="button" onClick={() => setShowEvents((v) => !v)} className="text-[11px] font-bold text-amber-300 hover:text-amber-200">
          {showEvents ? '▾' : '▸'} Recent sign-ins and PIN changes
        </button>
        {showEvents && (
          <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-white/5 rounded-xl border border-white/10 bg-black/40 text-[11px]">
            {events.length === 0 && <li className="p-2.5 text-white/50">Nothing yet.</li>}
            {events.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="flex flex-wrap gap-x-2 p-2">
                <span className={ev.ok ? 'text-emerald-300' : 'text-rose-300'}>{ev.ok ? '✓' : '✗'}</span>
                <span className="text-white/50 tabular-nums">{when(ev.at)}</span>
                <span className="font-bold text-white">{EVENT_LABELS[ev.kind] || ev.kind}</span>
                {ev.person && <span className="text-white/80">{ev.person}</span>}
                {ev.device && <span className="text-white/50">on {ev.device}</span>}
                {!ev.ok && !ev.person && ev.kind !== 'pair' && <span className="text-rose-300/80">wrong PIN</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Admin › Staff: who can sign in, their role, and their PIN. PINs are never
 * shown — only set. Changing a PIN signs that person out on every device.
 * With server sign-in every change is made on the server, and a PIN a manager
 * sets for someone else is temporary: they choose their own at first sign-in.
 */
export default function StaffAccounts({ user }: StaffAccountsProps) {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [driversOnStarter, setDriversOnStarter] = useState(0)
  const [pinFor, setPinFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<Role>('CASHIER')
  const [flash, setFlash] = useState<string | null>(null)
  const [server, setServer] = useState(() => isServerAuth())
  const [enrolledTerminals, setEnrolledTerminals] = useState<EnrolledTerminalRecord[]>(() => getEnrolledTerminals())
  const [hwLockEnforced, setHwLockEnforced] = useState<boolean>(() => isStoreHardwareLockEnforced())
  const [thisDeviceEnrolled, setThisDeviceEnrolled] = useState<boolean>(() => isTerminalEnrolled())
  const [passkeyActive, setPasskeyActive] = useState<boolean>(() => hasAdminPasskey())
  const [newPasskey, setNewPasskey] = useState('')
  const [confirmPasskey, setConfirmPasskey] = useState('')
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  const canManage = !!user && CAN_MANAGE.includes(user.role)
  const actor = user?.name || 'Manager'

  useEffect(() => {
    const unsubRoster = subscribeRoster(setMembers)
    const unsubDrivers = subscribeDrivers(() => setDriversOnStarter(getDrivers().filter((d) => d.status === 'ACTIVE' && d.defaultPin).length))
    const unsubServer = subscribeServerAuth(() => setServer(isServerAuth()))
    const unsubTerm = subscribeMasterTerminal(() => {
      setEnrolledTerminals(getEnrolledTerminals())
      setHwLockEnforced(isStoreHardwareLockEnforced())
      setThisDeviceEnrolled(isTerminalEnrolled())
      setPasskeyActive(hasAdminPasskey())
    })
    return () => {
      unsubRoster()
      unsubDrivers()
      unsubServer()
      unsubTerm()
    }
  }, [])

  const onStarter = server ? [] : members.filter((m) => m.status === 'ACTIVE' && m.defaultPin)
  const withoutPin = server ? members.filter((m) => m.status === 'ACTIVE' && !m.pinSet) : []
  const takenByDriver = (pin: string) => isDriverPinTaken(pin)

  const say = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 4500)
  }

  /** Run an owner tool on the server, then pull the updated staff list. Returns an error message or null. */
  const onServer = async (fn: (token: string) => Promise<{ ok: boolean; message: string }>): Promise<string | null> => {
    const token = currentSessionToken()
    if (!token) return 'Sign in again (online) to manage staff.'
    const res = await fn(token)
    if (!res.ok) return res.message
    void syncNow().catch(() => false)
    say(res.message)
    return null
  }

  const saveMember = async (m: StaffMember, patch: { role?: Role; active?: boolean }) => {
    if (server) {
      const err = await onServer((t) => adminSavePerson(t, { id: m.id, kind: 'staff', ...patch }))
      if (err) say(err)
      return
    }
    const res = updateStaffMember(m.id, { ...(patch.role ? { role: patch.role } : {}), ...(patch.active !== undefined ? { status: patch.active ? 'ACTIVE' : 'DISABLED' } : {}) }, actor)
    say(res.message)
  }

  const pinState = (m: StaffMember) =>
    server ? (!m.pinSet ? 'none' : m.mustChange ? 'temporary' : 'own') : m.defaultPin ? 'starter' : 'own'

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="display text-xl text-white font-bold">Staff &amp; PINs</h2>
          <p className="font-body text-xs text-white/60">
            {server
              ? 'Everyone signs in with their own PIN, checked by the shop’s server. Changes reach every till, kitchen screen and phone within seconds.'
              : 'Everyone signs in with their own PIN. Changes reach every till, kitchen screen and phone within seconds.'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-xl bg-amber-400 px-3.5 py-2 font-body text-xs font-black text-ink hover:bg-amber-300"
          >
            {adding ? 'Close' : '+ Add staff'}
          </button>
        )}
      </div>

      {(onStarter.length > 0 || (!server && driversOnStarter > 0)) && (
        <div role="alert" className="rounded-2xl border-2 border-red-500/60 bg-red-950/40 p-4 font-body text-xs text-red-100 space-y-1">
          <p className="text-sm font-black text-white">⚠️ Change the starter PINs before you open</p>
          <p>
            {onStarter.length > 0 && <>{onStarter.map((m) => m.name.split(' (')[0]).join(', ')} still use{onStarter.length === 1 ? 's' : ''} a PIN that ships with the app and is published online. </>}
            {driversOnStarter > 0 && <>{driversOnStarter} driver{driversOnStarter > 1 ? 's' : ''} too (Drivers tab). </>}
            Anyone who reads the code could sign in with them.
          </p>
        </div>
      )}

      {withoutPin.length > 0 && (
        <div className="rounded-2xl border border-amber-400/50 bg-amber-950/30 p-3.5 font-body text-xs text-amber-100">
          <strong className="text-white">No PIN yet:</strong> {withoutPin.map((m) => m.name.split(' (')[0]).join(', ')}. They can't sign in until a manager sets a
          temporary PIN — they then choose their own the first time they sign in.
        </div>
      )}

      {flash && <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 font-body text-xs font-bold text-emerald-300">{flash}</p>}

      {adding && canManage && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 space-y-3 font-body">
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full name"
              aria-label="Full name"
              className="flex-1 min-w-[10rem] rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              aria-label="Role"
              className="rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </select>
          </div>
          <PinFields
            submitLabel="Add"
            onSubmit={async (pin) => {
              if (server) {
                const token = currentSessionToken()
                if (!token) return 'Sign in again (online) to manage staff.'
                const name = newName.trim()
                const saved = await adminSavePerson(token, { kind: 'staff', name, role: newRole })
                if (!saved.ok) return saved.message
                const set = await adminSetPin(token, saved.id, pin)
                void syncNow().catch(() => false)
                setNewName('')
                setAdding(false)
                say(set.ok ? `${name} added. Their PIN is temporary — they choose their own at first sign-in.` : `${name} added, but the PIN wasn't saved: ${set.message}`)
                return null
              }
              const res = addStaffMember({ name: newName, role: newRole, pin }, actor, takenByDriver)
              if (!res.ok) return res.message
              setNewName('')
              setAdding(false)
              say(res.message)
              return null
            }}
          />
          <p className="text-[10px] text-white/40">
            {server
              ? 'Give them a temporary PIN in person: 4–8 digits, or 6–8 for supervisors and managers. They choose their own the first time they sign in.'
              : '4–8 digits. Use 6 digits for managers. Tell the person their PIN in person — it is never shown again.'}
          </p>
        </div>
      )}

      <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/20 font-body">
        {members.map((m) => {
          const isMe = user?.id === m.id
          const editable = canManage && (m.role !== 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN')
          const state = pinState(m)
          return (
            <li key={m.id} className="p-3 sm:p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={cx('text-sm font-bold', m.status === 'ACTIVE' ? 'text-white' : 'text-white/40 line-through')}>
                    {m.name}
                    {isMe && <span className="ml-2 text-[10px] font-bold text-amber-300">(you)</span>}
                  </p>
                  <p className="text-[11px] text-white/50">
                    {roleLabel(m.role)}
                    {state === 'starter' && <span className="ml-2 font-bold text-red-300">starter PIN ⚠</span>}
                    {state === 'none' && <span className="ml-2 font-bold text-red-300">no PIN yet</span>}
                    {state === 'temporary' && <span className="ml-2 font-bold text-amber-300">temporary PIN — changes it at first sign-in</span>}
                    {state === 'own' && <span className="ml-2 text-emerald-300">own PIN ✓</span>}
                  </p>
                </div>
                {editable && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.role !== 'SUPER_ADMIN' && !(server && isMe) && (
                      <select
                        value={m.role}
                        onChange={(e) => void saveMember(m, { role: e.target.value as Role })}
                        aria-label={`Role for ${m.name}`}
                        className="rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-white"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.role} value={r.role}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setPinFor(pinFor === m.id ? null : m.id)}
                      className={cx(
                        'rounded-lg px-2.5 py-1 text-[11px] font-bold',
                        state === 'starter' || state === 'none' ? 'bg-red-500 text-white hover:bg-red-400' : 'border border-white/20 bg-white/5 text-white hover:bg-white/15',
                      )}
                    >
                      {state === 'starter' || state === 'none' ? 'Set PIN now' : 'Change PIN'}
                    </button>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => void saveMember(m, { active: m.status !== 'ACTIVE' })}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/70 hover:bg-white/15"
                        title={m.status === 'ACTIVE' ? 'Stops this PIN working on every device' : 'Lets this person sign in again'}
                      >
                        {m.status === 'ACTIVE' ? 'Disable' : 'Re-enable'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {pinFor === m.id && editable && (
                <PinFields
                  submitLabel="Save PIN"
                  onSubmit={async (pin) => {
                    if (server) {
                      const err = await onServer((t) => adminSetPin(t, m.id, pin))
                      if (!err) setPinFor(null)
                      return err
                    }
                    const res = setStaffPin(m.id, pin, actor, takenByDriver)
                    if (!res.ok) return res.message
                    // Changing your own PIN ends your session (it was opened with the old one) — reopen it.
                    if (isMe) loginWithPin(pin)
                    setPinFor(null)
                    say(res.message)
                    return null
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
      {!canManage && <p className="font-body text-[11px] text-white/40">Only a store manager can add staff or change PINs.</p>}

      {canManage && server && <ServerDevicesPanel say={say} />}

      {/* STORE HARDWARE LOCK & ADMIN VAULT SECURITY */}
      {canManage && (
        <div className="mt-6 pt-6 border-t border-white/10 space-y-5 font-body">
          <div>
            <h3 className="display text-lg text-white font-bold flex items-center gap-2">
              <span>🛡️</span>
              <span>In-Store Hardware Lock &amp; Admin Vault Security</span>
            </h3>
            <p className="text-xs text-white/60 mt-0.5">
              Ensure the Till &amp; Kitchen system works strictly inside the store on authorized hardware, and lock the Admin Console exclusively to the Store Admin.
            </p>
          </div>

          {/* 1. In-Store Hardware Lock Policy */}
          <div className="rounded-2xl border border-amber-400/30 bg-black/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🏪 In-Store Till Hardware Lock</span>
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
                      hwLockEnforced ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
                    )}
                  >
                    {hwLockEnforced ? ' Strictly Enforced (Store Only)' : 'Unlocked'}
                  </span>
                </p>
                <p className="text-xs text-white/60 mt-0.5">
                  When enforced, cashiers and kitchen staff can ONLY sign into <code className="text-amber-300">/pos</code> and <code className="text-amber-300">/staff</code> on physical store machines enrolled by the Admin below. Personal phones and home computers are blocked.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!thisDeviceEnrolled && (
                  <button
                    type="button"
                    onClick={() => {
                      enrollAndClaimMasterTerminal(actor, getLocalDeviceName(), 'master_till')
                      say(`Enrolled "${getLocalDeviceName()}" as an official Store Terminal.`)
                    }}
                    className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-black text-ink hover:bg-amber-300"
                  >
                    + Enroll This Device as Store Till
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = !hwLockEnforced
                    setStoreHardwareLockEnforced(next, actor)
                    say(next ? 'In-store hardware lock ENFORCED.' : 'In-store hardware lock relaxed.')
                  }}
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15"
                >
                  {hwLockEnforced ? 'Disable Hardware Lock' : 'Enforce Hardware Lock'}
                </button>
              </div>
            </div>

            {enrolledTerminals.length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Enrolled In-Store Workstations ({enrolledTerminals.length})
                </p>
                <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/40">
                  {enrolledTerminals.map((term) => {
                    const isCurrent = term.deviceId === getLocalDeviceId()
                    return (
                      <li key={term.deviceId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                        <div>
                          <p className="font-bold text-white">
                            {term.name}
                            {isCurrent && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">This Device</span>}
                          </p>
                          <p className="text-[11px] text-white/50 font-mono">
                            {term.deviceId} &bull; {term.stationRole.replace(/_/g, ' ')} &bull; Enrolled by {term.enrolledBy}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            revokeEnrolledTerminal(term.deviceId, actor)
                            say(`Revoked store terminal "${term.name}".`)
                          }}
                          className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-900/60"
                        >
                          Revoke Device
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-amber-300 pt-1">
                ℹ️ No store terminals enrolled yet. Open <code className="font-mono">/pos</code> on your store counter computer and enter your Admin PIN to enroll it, or click <strong>+ Enroll This Device as Store Till</strong> above.
              </p>
            )}
          </div>

          {/* 2. Secondary Admin Master Passkey (2-Factor Lock for /admin) */}
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🔑 Secondary Admin Master Passkey (2FA for Admin Console)</span>
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
                      passkeyActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-white/10 text-white/60',
                    )}
                  >
                    {passkeyActive ? '2-Factor Active (PIN + Passkey)' : 'Admin PIN Only'}
                  </span>
                </p>
                <p className="text-xs text-white/60 mt-0.5">
                  Only accounts with role {ADMIN_CONSOLE_ROLES.join(', ')} can access <code className="text-amber-300">/admin</code>. Set an extra secret passkey below so even someone who sees your PIN cannot open the Admin Console.
                </p>
              </div>
              {passkeyActive && (
                <button
                  type="button"
                  onClick={() => {
                    clearAdminPasskey(actor)
                    setPasskeyActive(false)
                    say('Secondary Admin Master Passkey removed.')
                  }}
                  className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-900/60"
                >
                  Remove Passkey
                </button>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPasskeyError(null)
                if (newPasskey !== confirmPasskey) {
                  setPasskeyError('The two passkeys do not match.')
                  return
                }
                const res = setAdminPasskey(newPasskey, actor)
                if (!res.ok) {
                  setPasskeyError(res.message)
                  return
                }
                setNewPasskey('')
                setConfirmPasskey('')
                setPasskeyActive(true)
                say(res.message)
              }}
              className="flex flex-wrap items-center gap-2 pt-1"
            >
              <input
                type="password"
                value={newPasskey}
                onChange={(e) => setNewPasskey(e.target.value)}
                placeholder={passkeyActive ? 'New Master Passkey' : 'Set Master Passkey (min 4 chars)'}
                className="w-52 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
              <input
                type="password"
                value={confirmPasskey}
                onChange={(e) => setConfirmPasskey(e.target.value)}
                placeholder="Confirm Passkey"
                className="w-44 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-black text-ink hover:bg-amber-300"
              >
                {passkeyActive ? 'Update Passkey' : 'Enable Admin Passkey'}
              </button>
              {passkeyError && <p className="basis-full text-[11px] font-bold text-rose-300">{passkeyError}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
