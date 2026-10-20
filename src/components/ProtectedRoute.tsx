import { useState, useEffect } from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import {
  getCurrentUser,
  subscribeAuth,
  hasRole,
  logout,
  type AuthUser,
  type Role,
} from '../services/authStore'
import FixedAmbientBackdrop from './FixedAmbientBackdrop'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: Role[]
  portalName: string
  loginTab?: 'staff' | 'admin' | 'customer'
}

/**
 * Route protection wrapper.
 * Ensures unauthenticated visitors cannot view internal portals (/admin, /pos, /staff, /driver).
 * Automatically redirects to /login with return intent, and blocks unauthorized roles with a clear switch screen.
 */
export default function ProtectedRoute({
  children,
  allowedRoles,
  portalName,
  loginTab = 'staff',
}: ProtectedRouteProps) {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())
  const location = useLocation()

  useEffect(() => {
    return subscribeAuth((u) => setUser(u))
  }, [])

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
            Sign Out & Switch Account
          </button>
        </div>
      </div>
    )
  }

  // 3. Role check: signed in, but lacks permission for this specific portal (e.g. Cashier opening /admin)
  const isAuthorized = hasRole(user, allowedRoles)
  if (!isAuthorized) {
    return (
      <div className="relative min-h-screen bg-portal-dark text-slate-100 flex flex-col items-center justify-center p-6 select-none overflow-hidden">
        <FixedAmbientBackdrop variant="portal" />
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-amber-500/40 bg-slate-900/95 backdrop-blur-xl p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/20 text-3xl border border-amber-500/40 text-amber-400">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Restricted Access</h1>
          <p className="text-sm text-slate-300 mb-4">
            Management authorization is required to access the <span className="font-bold text-amber-300">{portalName}</span>.
          </p>
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-xs space-y-1">
            <p className="text-slate-400">Current User: <span className="font-semibold text-white">{user.name}</span></p>
            <p className="text-slate-400">Current Role: <span className="font-semibold text-amber-400">{user.role}</span></p>
            <p className="text-slate-400">Required: <span className="font-mono text-slate-300">{allowedRoles.join(', ')}</span></p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                logout()
                const redirectUrl = encodeURIComponent(location.pathname + location.search)
                window.location.href = `/login?redirect=${redirectUrl}&tab=${loginTab}`
              }}
              className="flex-1 rounded-2xl bg-amber-400 px-4 py-3 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-amber-300 transition"
            >
              🔑 Switch PIN / Login as Manager
            </button>
            <Link
              to="/pos"
              className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-body text-xs font-bold text-white hover:bg-white/20 transition flex items-center justify-center"
            >
              Go to Till POS
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 4. Authorized: render the secured portal
  return <>{children}</>
}
