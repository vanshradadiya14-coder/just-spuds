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
import { loginWithPin, type AuthUser, type Role } from '../../../services/authStore'
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
  const canManage = !!user && CAN_MANAGE.includes(user.role)
  const actor = user?.name || 'Manager'

  useEffect(() => {
    const unsubRoster = subscribeRoster(setMembers)
    const unsubDrivers = subscribeDrivers(() => setDriversOnStarter(getDrivers().filter((d) => d.status === 'ACTIVE' && d.defaultPin).length))
    return () => {
      unsubRoster()
      unsubDrivers()
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
    </div>
  )
}
