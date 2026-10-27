import { useState, useEffect } from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import {
  getCurrentUser,
  subscribeAuth,
  hasRole,
  logout,
  isAdminVaultUnlocked,
  touchAdminVault,
  loginAdminConsole,
  isAdminConsoleRole,
  type AuthUser,
  type Role,
} from '../services/authStore'
import {
  isTerminalEnrolled,
  isStoreHardwareLockEnforced,
  enrollAndClaimMasterTerminal,
  getLocalDeviceId,
  getLocalDeviceName,
  subscribeMasterTerminal,
  hasAdminPasskey,
  type StationRole,
} from '../services/terminalLockStore'
import FixedAmbientBackdrop from './FixedAmbientBackdrop'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: Role[]
  portalName: string
  loginTab?: 'staff' | 'admin' | 'customer'
  /** Require explicit Admin Vault verification & 15-min inactivity auto-lock (/admin). */
  requireAdminVault?: boolean
  /** Require this physical hardware device to be enrolled by an Admin as an official in-store station (/pos, /till, /staff). */
  requireStoreTerminal?: boolean
}

/**
 * Route protection wrapper.
 * Ensures unauthenticated visitors cannot view internal portals (/admin, /pos, /staff, /driver),
 * enforces Admin-only Vault isolation for /admin, and enforces In-Store Hardware Enrollment for /pos and /staff.
 */
export default function ProtectedRoute({
  children,
  allowedRoles,
  portalName,
  loginTab = 'staff',
  requireAdminVault = false,
  requireStoreTerminal = false,
}: ProtectedRouteProps) {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())
  const [vaultUnlocked, setVaultUnlocked] = useState<boolean>(() => isAdminVaultUnlocked())
  const [terminalEnrolled, setTerminalEnrolled] = useState<boolean>(() => isTerminalEnrolled())
  const [hardwareLockEnforced, setHardwareLockEnforced] = useState<boolean>(() => isStoreHardwareLockEnforced())

  // Store Hardware Enrollment form state (Admin-only gate for unenrolled devices)
  const [stationName, setStationName] = useState(() => getLocalDeviceName())
  const [stationRole, setStationRole] = useState<StationRole>('master_till')
  const [adminPin, setAdminPin] = useState('')
  const [adminPasskey, setAdminPasskey] = useState('')
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const location = useLocation()

  useEffect(() => {
    const unsubAuth = subscribeAuth((u) => {
      setUser(u)
      setVaultUnlocked(isAdminVaultUnlocked(u))
    })
    const unsubTerm = subscribeMasterTerminal(() => {
      setTerminalEnrolled(isTerminalEnrolled())
      setHardwareLockEnforced(isStoreHardwareLockEnforced())
    })
    return () => {
      unsubAuth()
      unsubTerm()
    }
  }, [])

  // Keep Admin Vault alive while actively working inside /admin, and auto-lock when idle
  useEffect(() => {
    if (!requireAdminVault) return
    const onActivity = () => touchAdminVault()
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })
    const timer = window.setInterval(() => {
      setVaultUnlocked(isAdminVaultUnlocked())
    }, 15_000)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.clearInterval(timer)
    }
  }, [requireAdminVault])

  // 1. Not signed in: redirect to login with current path saved for seamless return
  if (!user) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirectUrl}&tab=${loginTab}`} replace />
  }

  // 2. Disabled account check
  if (user.status !== 'ACTIVE') {
    return (
      <div className="relative min-h-screen bg-portal-dark text-slate-100 flex flex-col items-center justify-center p-6 select-none overflow-hidden">
        <FixedAmbientBackdrop variant="portal" />
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-red-500/40 bg-slate-900/95 backdrop-blur-xl p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-red-500/20 text-3xl border border-red-500/40 text-red-400">
            🚫
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account Suspended</h1>
          <p className="text-sm text-slate-400 mb-6">
            The account for <span className="font-semibold text-white">{user.name}</span> is currently inactive or disabled.
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full rounded-2xl bg-red-600 px-4 py-3 font-body text-sm font-bold text-white shadow-lg hover:bg-red-500 transition"
          >
            Sign Out &amp; Switch Account
          </button>
        </div>
      </div>
    )
  }

  // 3. Role check: signed in, but lacks permission for this specific portal (e.g. Cashier or Supervisor opening /admin)
  const isAuthorized = hasRole(user, allowedRoles)
  if (!isAuthorized) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search)
    return (
      <div className="relative min-h-screen bg-portal-dark text-slate-100 flex flex-col items-center justify-center p-6 select-none overflow-hidden">
        <FixedAmbientBackdrop variant="portal" />
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-rose-500/40 bg-slate-900/95 backdrop-blur-xl p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/20 text-3xl border border-rose-500/40 text-rose-400">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Admin-Only Restricted Area</h1>
          <p className="text-sm text-slate-300 mb-4">
            Only the Store Admin / Owner is permitted to access the <span className="font-bold text-amber-300">{portalName}</span>.
          </p>
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-xs space-y-1">
            <p className="text-slate-400">Current Signed-In User: <span className="font-semibold text-white">{user.name}</span></p>
            <p className="text-slate-400">Current Role: <span className="font-semibold text-rose-400">{user.role}</span></p>
            <p className="text-slate-400">Access Policy: <span className="font-mono text-slate-300">Strictly Admin Only (No other staff)</span></p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to={`/login?redirect=${redirectUrl}&tab=${loginTab}`}
              onClick={() => logout()}
              className="flex-1 rounded-2xl bg-amber-400 px-4 py-3 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-amber-300 transition flex items-center justify-center"
            >
              🔑 Sign In as Store Admin
            </Link>
            <Link
              to="/"
              onClick={() => logout()}
              className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-body text-xs font-bold text-white hover:bg-white/20 transition flex items-center justify-center"
            >
              Sign Out &amp; Exit
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 4. Admin Vault Gate: Even if an Admin signed into the Till (/pos), /admin requires explicit Admin Vault unlock
  if (requireAdminVault && (!isAdminConsoleRole(user.role) || !vaultUnlocked)) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirectUrl}&tab=admin`} replace />
  }

  // 5. Store Hardware Lock: /pos, /till, and /staff are strictly for enrolled in-store hardware
  if (requireStoreTerminal && hardwareLockEnforced && !terminalEnrolled) {
    const needPasskey = hasAdminPasskey()
    const handleAdminEnrollDevice = (e: React.FormEvent) => {
      e.preventDefault()
      setEnrollError(null)
      const res = loginAdminConsole(adminPin, needPasskey ? adminPasskey : undefined)
      if (!res.ok || !res.user) {
        setEnrollError(res.message || 'Invalid Admin credentials. Only the Store Admin can enroll a store terminal.')
        setAdminPin('')
        return
      }
      enrollAndClaimMasterTerminal(res.user.name, stationName.trim() || getLocalDeviceName(), stationRole)
      setTerminalEnrolled(true)
    }

    return (
      <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none overflow-hidden font-body">
        <FixedAmbientBackdrop variant="portal" />
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-amber-500/40 bg-slate-900/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl space-y-5">
          <div className="flex items-center gap-3.5 border-b border-white/10 pb-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-400 text-3xl text-slate-950 shadow-glow">
              🏪
            </div>
            <div>
              <span className="inline-block rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300 mb-1">
                In-Store Hardware Lock Active
              </span>
              <h1 className="text-xl font-black text-white uppercase tracking-wide">
                Store Terminal Not Enrolled
              </h1>
              <p className="text-xs text-slate-400">
                The Till &amp; Kitchen system works exclusively on authorized in-store hardware.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs text-slate-300 space-y-1.5">
            <p>
              🔒 <strong>Why am I seeing this?</strong> This device (<code className="text-amber-300 font-mono">{getLocalDeviceId()}</code>) has not been enrolled as an in-store workstation. Staff PINs cannot open the till on personal phones or outside computers.
            </p>
            <p className="text-slate-400">
              If this is a physical store computer or kitchen screen in Aylesbury, the <strong>Store Admin</strong> can enroll it below once.
            </p>
          </div>

          <form onSubmit={handleAdminEnrollDevice} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Store Workstation Name
              </label>
              <input
                type="text"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="e.g. Front Counter Till #1"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Workstation Role
              </label>
              <select
                value={stationRole}
                onChange={(e) => setStationRole(e.target.value as StationRole)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="master_till">🧾 Master Counter Till (Cash Drawer &amp; Payments)</option>
                <option value="kds_display">👨‍🍳 Kitchen KDS Display Screen</option>
                <option value="secondary_till">🖥️ Secondary Counter Order Screen</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                Store Admin PIN (Required to Enroll Hardware)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter Admin / Owner PIN"
                className="w-full rounded-xl border border-amber-400/40 bg-black/60 px-3 py-2.5 text-center font-mono text-xl tracking-[0.35em] text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            {needPasskey && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                  Admin Master Passkey
                </label>
                <input
                  type="password"
                  value={adminPasskey}
                  onChange={(e) => setAdminPasskey(e.target.value)}
                  placeholder="Enter Admin Master Passkey"
                  className="w-full rounded-xl border border-amber-400/40 bg-black/60 px-3 py-2 text-center font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}

            {enrollError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-2.5 text-center text-xs font-bold text-rose-200">
                {enrollError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-amber-400 py-3 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:bg-amber-300 transition"
            >
              🛡️ Authorize &amp; Enroll Store Terminal &rarr;
            </button>
          </form>

          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs">
            <span className="text-slate-500">Signed in as {user.name} ({user.role})</span>
            <Link
              to="/"
              onClick={() => logout()}
              className="font-bold text-rose-300 hover:text-rose-200"
            >
              Sign Out &amp; Exit
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 6. Authorized: render the secured portal
  return <>{children}</>
}
