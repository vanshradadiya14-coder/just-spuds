import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getCurrentUser,
  subscribeAuth,
  logout,
  hasRole,
  homePortalForRole,
  INTERNAL_ROLES,
  MANAGEMENT_ROLES,
  type AuthUser,
} from '../services/authStore'

const PORTALS: Record<string, { label: string; icon: string }> = {
  '/admin': { label: 'Admin Console', icon: '📊' },
  '/staff': { label: 'Kitchen KDS', icon: '👨‍🍳' },
  '/pos': { label: 'Till / POS', icon: '🧾' },
  '/driver': { label: 'Driver Hub', icon: '🛵' },
}

export default function StaffPortalDock() {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser())
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  useEffect(() => {
    return subscribeAuth((u) => setUser(u))
  }, [])

  // Do not show on internal portal routes themselves
  const isInternalRoute = ['/staff', '/admin', '/pos', '/till', '/cfd', '/customer-display', '/driver', '/login'].some((p) =>
    location.pathname.startsWith(p),
  )

  if (!user || isInternalRoute) return null

  // Only show if user has staff, manager, admin, or driver privileges
  if (!hasRole(user, INTERNAL_ROLES)) return null

  const primaryPath = homePortalForRole(user.role) ?? '/staff'
  const primary = { path: primaryPath, ...(PORTALS[primaryPath] ?? { label: 'Staff Portal', icon: '⚡' }) }
  const isManagement = hasRole(user, MANAGEMENT_ROLES)

  return (
    <aside
      aria-label="Staff and admin portal quick dock"
      className="fixed bottom-28 lg:bottom-6 right-4 sm:right-6 z-[90] flex items-center shadow-2xl transition-all"
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 rounded-full border border-amber-400/70 bg-slate-950/95 px-3.5 py-2 text-xs font-bold text-amber-300 shadow-glow backdrop-blur-xl hover:bg-slate-900 transition"
          title="Expand Staff Portal Quick Dock"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{primary.icon} Staff Dock</span>
          <span className="text-white/60">◀</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl sm:rounded-full border border-amber-400/80 bg-slate-950/95 p-2 sm:px-4 sm:py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 pr-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <div className="text-left leading-tight hidden sm:block">
              <p className="text-[10px] uppercase tracking-wider text-amber-400 font-black">
                {user.role.replace('_', ' ')} SESSION
              </p>
              <p className="text-[11px] text-white/90 truncate max-w-[140px] font-medium">
                {user.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              to={primary.path}
              className="flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
            >
              <span>{primary.icon}</span>
              <span>Back to {primary.label} →</span>
            </Link>

            {isManagement && primary.path !== '/staff' && (
              <Link
                to="/staff"
                className="hidden md:flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/80 hover:bg-white/15 transition"
                title="Open Kitchen Display"
              >
                <span>👨‍🍳 KDS</span>
              </Link>
            )}

            {isManagement && primary.path !== '/admin' && (
              <Link
                to="/admin"
                className="hidden md:flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/80 hover:bg-white/15 transition"
                title="Open Admin Console"
              >
                <span>📊 Admin</span>
              </Link>
            )}

            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-red-500/30 bg-red-950/30 px-2.5 py-1.5 text-[10px] font-bold text-red-300 hover:bg-red-900/50 transition"
              title="Lock / Sign Out"
            >
              🔒
            </button>

            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="grid h-6 w-6 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white text-xs"
              title="Minimize dock"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
