import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  signInWithPin,
  logout,
  isManagerOrAdmin,
  SHOP_FLOOR_ROLES,
  MANAGEMENT_ROLES,
  type Role,
} from '../../services/authStore'
import { getRoster, subscribeRoster, type StaffMember } from '../../services/staffRoster'
import {
  getActiveTimeclockEntry,
  isOnBreak,
  subscribeTimeclock,
  workedMs,
  formatDuration,
  type TimeclockEntry,
} from '../../services/timeclockStore'
import { getLocalDeviceName } from '../../services/terminalLockStore'
import type { TillShift } from '../../services/tillStore'
import { playPOSTouchTone } from '../../services/printerBridge'
import { gbp } from '../../utils/format'
import FixedAmbientBackdrop from '../FixedAmbientBackdrop'
import FullscreenButton from '../FullscreenButton'
import SyncStatusPill from '../SyncStatusPill'

export interface PosOperatorStandbyProps {
  tillName: string
  shift: TillShift | null
  cartItemCount: number
  cartTotalPence: number
  activeKitchenCount: number
  openChecksCount: number
  heldTicketsCount: number
  activeAlertsCount: number
  lockReason: string | null
  onClearLockReason: () => void
  onOpenTimeclock: () => void
  onOpenSoftwareModal: () => void
}

type SignOnMode = 'staff' | 'manager'

function formatRoleLabel(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return 'Owner / Admin'
    case 'STORE_MANAGER':
    case 'MANAGER':
      return 'Store Manager'
    case 'SUPERVISOR':
      return 'Supervisor'
    case 'CASHIER':
      return 'Counter Cashier'
    case 'KITCHEN_STAFF':
    case 'STAFF':
      return 'Kitchen / Counter'
    default:
      return role
  }
}

export default function PosOperatorStandby({
  tillName,
  shift,
  cartItemCount,
  cartTotalPence,
  activeKitchenCount,
  openChecksCount,
  heldTicketsCount,
  activeAlertsCount,
  lockReason,
  onClearLockReason,
  onOpenTimeclock,
  onOpenSoftwareModal,
}: PosOperatorStandbyProps) {
  const isShiftOpen = Boolean(shift && shift.status === 'open')

  // Default to Manager mode when the till shift is closed (since opening float is a Manager workflow),
  // and Counter/Staff mode when the shift is already open for rapid cashier switching.
  const [mode, setMode] = useState<SignOnMode>(() => (isShiftOpen ? 'staff' : 'manager'))
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [roster, setRoster] = useState<StaffMember[]>(() => getRoster())
  const [timeclockTick, setTimeclockTick] = useState(0)

  useEffect(() => {
    setMode(isShiftOpen ? 'staff' : 'manager')
  }, [isShiftOpen])

  useEffect(() => {
    const unsubRoster = subscribeRoster(() => setRoster(getRoster()))
    const unsubClock = subscribeTimeclock(() => setTimeclockTick((t) => t + 1))
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => {
      unsubRoster()
      unsubClock()
      window.clearInterval(timer)
    }
  }, [])

  const activeShopRoster = useMemo(() => {
    return roster.filter(
      (m) => m.status === 'ACTIVE' && SHOP_FLOOR_ROLES.includes(m.role),
    )
  }, [roster])

  const filteredRoster = useMemo(() => {
    if (mode === 'manager') {
      return activeShopRoster.filter((m) => isManagerOrAdmin(m.role))
    }
    return activeShopRoster
  }, [activeShopRoster, mode])

  const selectedMember = useMemo(
    () => activeShopRoster.find((m) => m.id === selectedMemberId) || null,
    [activeShopRoster, selectedMemberId],
  )

  const clockByStaffId = useMemo(() => {
    void timeclockTick
    const map = new Map<string, TimeclockEntry>()
    for (const m of activeShopRoster) {
      const entry = getActiveTimeclockEntry(m.id)
      if (entry) map.set(m.id, entry)
    }
    return map
  }, [activeShopRoster, timeclockTick])

  const stationLabel = getLocalDeviceName() || tillName

  const handleDigit = (digit: string) => {
    playPOSTouchTone('numpad')
    if (error) setError(null)
    if (lockReason) onClearLockReason()
    setPinInput((prev) => (prev.length < 8 ? prev + digit : prev))
  }

  const handleBackspace = () => {
    playPOSTouchTone('numpad')
    setPinInput((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    playPOSTouchTone('numpad')
    setPinInput('')
    setError(null)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (busy || pinInput.trim().length < 4) return
    setBusy(true)
    setError(null)
    try {
      const allowed = mode === 'manager' ? MANAGEMENT_ROLES : SHOP_FLOOR_ROLES
      const res = await signInWithPin(pinInput, allowed)
      if (!res.ok || !res.user) {
        playPOSTouchTone('numpad')
        setError(
          mode === 'manager' && res.message.includes('access to this area')
            ? '🚫 Manager or Supervisor PIN required in Manager Sign-On mode.'
            : res.message,
        )
        setPinInput('')
        return
      }

      // If a specific operator tile was pre-selected on the standby screen, verify the PIN belongs to them
      if (selectedMember && res.user.id !== selectedMember.id) {
        logout()
        playPOSTouchTone('numpad')
        setError(
          // Never say the PIN was right for someone else — that tells a guesser whose PIN they just found.
          `Wrong PIN for ${selectedMember.name}. Tap "All Operators (Auto-ID)" to sign in as yourself.`,
        )
        setPinInput('')
        return
      }

      playPOSTouchTone('action')
      setPinInput('')
      setError(null)
      onClearLockReason()
    } finally {
      setBusy(false)
    }
  }

  // Physical keyboard numpad support so operators can type PIN + Enter without touching the screen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (document.querySelector('[role="dialog"]')) return

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClear()
      } else if (e.key === 'Enter') {
        if (pinInput.trim().length >= 4) {
          e.preventDefault()
          void handleSubmit()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const displayError = error || lockReason

  return (
    <div className="relative min-h-screen supports-[height:100dvh]:min-h-dvh w-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none overflow-x-hidden font-body">
      <FixedAmbientBackdrop variant="portal" />

      {/* Top Industrial POS Telemetry Bar */}
      <header className="relative z-10 border-b border-white/10 bg-slate-900/95 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-xl text-slate-950 font-black shadow-glow">
            🥔
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-black uppercase tracking-wider text-white">
                JUST SPUDS POS &bull; {tillName.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                🛡️ Kiosk Locked ({stationLabel})
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Dedicated Store Terminal &bull; Market Square Aylesbury &bull; Enter Operator PIN to Unlock
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeAlertsCount > 0 && (
            <div className="rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-3 py-1.5 text-xs font-black text-white shadow-glow animate-bounce flex items-center gap-1.5 ring-2 ring-rose-400">
              <span>🚨</span>
              <span>
                {activeAlertsCount} ONLINE ORDER{activeAlertsCount > 1 ? 'S' : ''} RINGING — SIGN ON TO ACCEPT
              </span>
            </div>
          )}

          {isShiftOpen && shift ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                SHIFT #{shift.shiftNumber} OPEN &bull; Float {gbp(shift.startingFloat)}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>TILL SHIFT CLOSED &bull; Manager Open Required</span>
            </div>
          )}

          <SyncStatusPill compact />
          <FullscreenButton showLabel className="rounded-xl px-2.5 py-1.5 text-xs" />

          <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-right font-mono">
            <div className="text-xs font-black text-white">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400">
              {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Subway / Enterprise QSR Sign-On Console */}
      <main className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 p-3 sm:p-6 max-w-7xl w-full mx-auto items-center">
        {/* LEFT PANEL: Role Selector + Operator Roster Tiles + Live Register Status */}
        <section className="lg:col-span-7 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/90 backdrop-blur-xl p-4 sm:p-6 shadow-2xl">
          {/* 1. Subway / EposNow Dual Mode Switcher: Manager vs Counter/Kitchen Staff */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
                Step 1 &bull; Select Sign-On Authority
              </span>
              <span className="text-[11px] text-slate-400">
                {isShiftOpen ? 'Shift is active — any staff can sign on' : 'Shift closed — select Manager to open float'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  playPOSTouchTone('tap')
                  setMode('manager')
                  setSelectedMemberId(null)
                  setError(null)
                }}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                  mode === 'manager'
                    ? 'border-amber-400 bg-gradient-to-br from-amber-400/25 to-amber-500/10 text-white shadow-glow ring-1 ring-amber-400/50'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400 text-2xl text-slate-950 font-black shadow">
                  👑
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black uppercase tracking-wide text-white">
                    Manager / Owner
                  </div>
                  <div className="text-[11px] text-amber-200/80 truncate">
                    Open Float &bull; Close Z-Report &bull; Till
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  playPOSTouchTone('tap')
                  setMode('staff')
                  setSelectedMemberId(null)
                  setError(null)
                }}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                  mode === 'staff'
                    ? 'border-sky-400 bg-gradient-to-br from-sky-400/25 to-sky-500/10 text-white shadow-lg ring-1 ring-sky-400/50'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-400 text-2xl text-slate-950 font-black shadow">
                  👤
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black uppercase tracking-wide text-white">
                    Counter / Kitchen Staff
                  </div>
                  <div className="text-[11px] text-sky-200/80 truncate">
                    Fast Cashier Sign-On &bull; KDS Flow
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Active Operator Touch Tiles (with live Clock-In Status) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Step 2 &bull; Choose Operator (Or Just Type Your PIN)
              </span>
              <span className="text-[11px] text-slate-400">
                {clockByStaffId.size} clocked in on shift
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => {
                  playPOSTouchTone('tap')
                  setSelectedMemberId(null)
                  setError(null)
                }}
                className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                  selectedMemberId === null
                    ? 'border-emerald-400 bg-emerald-500/15 text-white ring-1 ring-emerald-400/40'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-base">⚡</span>
                  <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-300">
                    Fast PIN
                  </span>
                </div>
                <div className="mt-2">
                  <div className="text-xs font-black text-white leading-tight">
                    All {mode === 'manager' ? 'Managers' : 'Operators'}
                  </div>
                  <div className="text-[10px] text-slate-400">Auto-identifies by PIN</div>
                </div>
              </button>

              {filteredRoster.map((member) => {
                const clockEntry = clockByStaffId.get(member.id)
                const onBrk = isOnBreak(clockEntry)
                const isSelected = selectedMemberId === member.id
                const isMgr = isManagerOrAdmin(member.role)

                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      playPOSTouchTone('tap')
                      setSelectedMemberId(isSelected ? null : member.id)
                      setError(null)
                    }}
                    className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/20 text-white ring-1 ring-amber-400/50'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm">{isMgr ? '👑' : '👤'}</span>
                      {clockEntry ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                            onBrk
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {onBrk ? '☕ Break' : `🟢 ${formatDuration(workedMs(clockEntry))}`}
                        </span>
                      ) : (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                          Off clock
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <div className="truncate text-xs font-black text-white">{member.name}</div>
                      <div className="truncate text-[10px] text-slate-400">
                        {formatRoleLabel(member.role)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Live Register Telemetry Strip (Shows paused sale, kitchen orders, open checks) */}
          <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-white/10 bg-black/40 p-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Sale on Till
              </div>
              {cartItemCount > 0 ? (
                <div className="mt-0.5 flex items-baseline justify-between gap-1">
                  <span className="text-xs font-black text-amber-300">
                    🛒 {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
                  </span>
                  <span className="font-mono text-sm font-black text-white">
                    {gbp(cartTotalPence)}
                  </span>
                </div>
              ) : (
                <div className="mt-0.5 text-xs font-bold text-emerald-300">
                  ✓ Ready for Next Sale
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Kitchen Queue
              </div>
              <div className="mt-0.5 text-xs font-black text-white">
                👨‍🍳 {activeKitchenCount} Active Order{activeKitchenCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Open / Held Checks
              </div>
              <div className="mt-0.5 text-xs font-black text-white">
                📋 {openChecksCount + heldTicketsCount} Ticket{openChecksCount + heldTicketsCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* 4. Store Appliance Quick Station Actions (No customer website escape link) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={onOpenTimeclock}
              className="flex-1 min-w-[160px] rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-black text-emerald-300 hover:bg-emerald-500/20 transition flex items-center justify-center gap-1.5"
            >
              <span>⏱️</span>
              <span>Clock In / Out (Time Clock)</span>
            </button>

            <Link
              to="/staff"
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/15 transition flex items-center gap-1.5"
            >
              <span>👨‍🍳</span>
              <span>Kitchen KDS</span>
            </Link>

            <button
              type="button"
              onClick={() => window.open('/cfd', 'JustSpudsCFD', 'width=1024,height=650')}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/15 transition flex items-center gap-1.5"
              title="Open Customer-Facing Display on secondary screen"
            >
              <span>📺</span>
              <span className="hidden sm:inline">Customer Screen</span>
            </button>

            <button
              type="button"
              onClick={onOpenSoftwareModal}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-slate-950 transition flex items-center gap-1.5"
            >
              <span>🛡️</span>
              <span className="hidden sm:inline">Kiosk Setup</span>
            </button>

            <Link
              to="/admin"
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/15 hover:text-white transition flex items-center gap-1.5"
            >
              <span>🔐</span>
              <span>Admin Vault</span>
            </Link>
          </div>
        </section>

        {/* RIGHT PANEL: High-Speed Industrial Touch PIN Pad */}
        <section className="lg:col-span-5 rounded-3xl border border-amber-400/40 bg-slate-900/95 backdrop-blur-xl p-5 sm:p-6 shadow-2xl ring-1 ring-amber-400/20">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl font-black shadow ${
                  mode === 'manager' ? 'bg-amber-400 text-slate-950' : 'bg-sky-400 text-slate-950'
                }`}
              >
                {mode === 'manager' ? '👑' : '👤'}
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-white truncate">
                  {selectedMember
                    ? `${selectedMember.name}`
                    : mode === 'manager'
                    ? 'Manager / Supervisor Sign-On'
                    : 'Counter / Kitchen Sign-On'}
                </h1>
                <p className="text-[11px] text-slate-400 truncate">
                  {selectedMember
                    ? `Enter ${selectedMember.name}'s PIN (${formatRoleLabel(selectedMember.role)})`
                    : mode === 'manager'
                    ? 'Enter Manager or Owner PIN to open float or run till'
                    : 'Enter your 4–8 digit Operator PIN'}
                </p>
              </div>
            </div>
            {selectedMember && (
              <button
                type="button"
                onClick={() => setSelectedMemberId(null)}
                className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-white/15"
              >
                Switch
              </button>
            )}
          </div>

          {displayError && (
            <div
              role="alert"
              className="mb-3 rounded-2xl border border-amber-400/50 bg-amber-500/15 px-3.5 py-2.5 text-xs font-bold text-amber-200 flex items-center justify-between gap-2"
            >
              <span>{displayError}</span>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  onClearLockReason()
                }}
                className="text-amber-200/70 hover:text-white shrink-0"
                aria-label="Dismiss message"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="relative">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => {
                  if (error) setError(null)
                  if (lockReason) onClearLockReason()
                  setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))
                }}
                placeholder="••••"
                aria-label="Operator PIN"
                className="w-full rounded-2xl border-2 border-amber-400/40 bg-black/70 px-4 py-3 text-center font-mono text-3xl tracking-[0.55em] text-white placeholder:text-white/20 focus:border-amber-400 focus:outline-none"
              />
              {pinInput.length > 0 && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  {pinInput.length} digits
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigit(digit)}
                  className="h-14 rounded-2xl border border-white/15 bg-white/5 font-mono text-2xl font-black text-white hover:bg-white/15 active:scale-95 transition shadow-sm"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="h-14 rounded-2xl border border-rose-500/30 bg-rose-950/30 font-body text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-900/50 active:scale-95 transition"
              >
                CLR
              </button>
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="h-14 rounded-2xl border border-white/15 bg-white/5 font-mono text-2xl font-black text-white hover:bg-white/15 active:scale-95 transition shadow-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-14 rounded-2xl border border-white/15 bg-white/5 font-mono text-xl font-black text-white hover:bg-white/15 active:scale-95 transition"
                aria-label="Delete digit"
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || pinInput.trim().length < 4}
              className={`w-full rounded-2xl py-4 font-body text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 shadow-glow transition active:scale-[0.99] disabled:opacity-40 ${
                mode === 'manager'
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400'
                  : 'bg-gradient-to-r from-sky-400 to-amber-400 hover:from-sky-300 hover:to-amber-300'
              }`}
            >
              {busy
                ? 'Verifying Operator PIN…'
                : !isShiftOpen
                ? '🔓 Sign On & Open Till Float →'
                : cartItemCount > 0
                ? `🔓 Sign On & Resume Sale (${gbp(cartTotalPence)}) →`
                : '🔓 Sign On to Till Register →'}
            </button>
          </form>
        </section>
      </main>

      {/* Bottom Security & Compliance Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-900/80 px-4 py-2 text-center text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>
          🔒 <strong>Enterprise QSR Security:</strong> Every sale, void, discount, and cash drawer action is stamped with your Operator PIN.
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          Keyboard Numpad Ready &bull; Press 0–9 &amp; Enter
        </span>
      </footer>
    </div>
  )
}

