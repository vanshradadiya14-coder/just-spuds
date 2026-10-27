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
import { loginWithPin, ADMIN_CONSOLE_ROLES, type AuthUser, type Role } from '../../../services/authStore'
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

function PinFields({ onSubmit, submitLabel, busyLabel }: { onSubmit: (pin: string) => string | null; submitLabel: string; busyLabel?: string }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (pin !== confirm) {
          setError('The two PINs do not match.')
          return
        }
        const err = onSubmit(pin)
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
      <button type="submit" className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-ink hover:bg-amber-300">
        {busyLabel || submitLabel}
      </button>
      {error && <p className="basis-full text-[11px] font-bold text-red-300">{error}</p>}
    </form>
  )
}

/**
 * Admin › Staff: who can sign in, their role, and their PIN. PINs are never
 * shown — only set. Changing a PIN signs that person out on every device.
 */
export default function StaffAccounts({ user }: StaffAccountsProps) {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [driversOnStarter, setDriversOnStarter] = useState(0)
  const [pinFor, setPinFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<Role>('CASHIER')
  const [flash, setFlash] = useState<string | null>(null)
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
    const unsubTerm = subscribeMasterTerminal(() => {
      setEnrolledTerminals(getEnrolledTerminals())
      setHwLockEnforced(isStoreHardwareLockEnforced())
      setThisDeviceEnrolled(isTerminalEnrolled())
      setPasskeyActive(hasAdminPasskey())
    })
    return () => {
      unsubRoster()
      unsubDrivers()
      unsubTerm()
    }
  }, [])

  const onStarter = members.filter((m) => m.status === 'ACTIVE' && m.defaultPin)
  const takenByDriver = (pin: string) => isDriverPinTaken(pin)

  const say = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 3500)
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="display text-xl text-white font-bold">Staff &amp; PINs</h2>
          <p className="font-body text-xs text-white/60">
            Everyone signs in with their own PIN. Changes reach every till, kitchen screen and phone within seconds.
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

      {(onStarter.length > 0 || driversOnStarter > 0) && (
        <div role="alert" className="rounded-2xl border-2 border-red-500/60 bg-red-950/40 p-4 font-body text-xs text-red-100 space-y-1">
          <p className="text-sm font-black text-white">⚠️ Change the starter PINs before you open</p>
          <p>
            {onStarter.length > 0 && <>{onStarter.map((m) => m.name.split(' (')[0]).join(', ')} still use{onStarter.length === 1 ? 's' : ''} a PIN that ships with the app and is published online. </>}
            {driversOnStarter > 0 && <>{driversOnStarter} driver{driversOnStarter > 1 ? 's' : ''} too (Drivers tab). </>}
            Anyone who reads the code could sign in with them.
          </p>
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
            onSubmit={(pin) => {
              const res = addStaffMember({ name: newName, role: newRole, pin }, actor, takenByDriver)
              if (!res.ok) return res.message
              setNewName('')
              setAdding(false)
              say(res.message)
              return null
            }}
          />
          <p className="text-[10px] text-white/40">4–8 digits. Use 6 digits for managers. Tell the person their PIN in person — it is never shown again.</p>
        </div>
      )}

      <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/20 font-body">
        {members.map((m) => {
          const isMe = user?.id === m.id
          const editable = canManage && (m.role !== 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN')
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
                    {m.defaultPin ? <span className="ml-2 font-bold text-red-300">starter PIN ⚠</span> : <span className="ml-2 text-emerald-300">own PIN ✓</span>}
                  </p>
                </div>
                {editable && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.role !== 'SUPER_ADMIN' && (
                      <select
                        value={m.role}
                        onChange={(e) => {
                          const res = updateStaffMember(m.id, { role: e.target.value as Role }, actor)
                          say(res.message)
                        }}
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
                        m.defaultPin ? 'bg-red-500 text-white hover:bg-red-400' : 'border border-white/20 bg-white/5 text-white hover:bg-white/15',
                      )}
                    >
                      {m.defaultPin ? 'Set PIN now' : 'Change PIN'}
                    </button>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => {
                          const res = updateStaffMember(m.id, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }, actor)
                          say(res.message)
                        }}
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
                  onSubmit={(pin) => {
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
