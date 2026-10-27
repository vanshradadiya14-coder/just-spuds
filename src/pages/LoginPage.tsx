import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  loginWithPin,
  loginAdminConsole,
  loginWithGoogle,
  getCurrentUser,
  homePortalForRole,
  isAdminConsoleRole,
  ADMIN_CONSOLE_ROLES,
  MANAGEMENT_ROLES,
  SHOP_FLOOR_ROLES,
} from '../services/authStore'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import FixedAmbientBackdrop from '../components/FixedAmbientBackdrop'
import { detectSubdomain } from '../App'
import { playPOSTouchTone } from '../services/printerBridge'
import FullscreenButton from '../components/FullscreenButton'
import {
  getLocalDeviceName,
  isTerminalEnrolled,
  isStoreHardwareLockEnforced,
  hasAdminPasskey,
} from '../services/terminalLockStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const subdomain = detectSubdomain()
  const tabParam = params.get('tab')
  const rawRedirect = params.get('redirect') || ''

  const portalMode: 'admin' | 'pos' | 'customer' =
    subdomain === 'admin' || tabParam === 'admin' || rawRedirect.startsWith('/admin')
      ? 'admin'
      : subdomain === 'pos' ||
        tabParam === 'staff' ||
        ['/pos', '/till', '/staff', '/cfd', '/customer-display', '/driver'].some((p) => rawRedirect.startsWith(p))
      ? 'pos'
      : 'customer'

  const isDriverTarget = rawRedirect.startsWith('/driver')
  const defaultTarget =
    portalMode === 'admin'
      ? subdomain === 'admin'
        ? '/'
        : rawRedirect || '/admin'
      : portalMode === 'pos'
      ? subdomain === 'pos'
        ? '/'
        : rawRedirect || '/pos'
      : rawRedirect || '/'

  useDocumentMeta({
    title:
      portalMode === 'pos'
        ? 'Store Till & POS Station Sign In | Just Spuds'
        : portalMode === 'admin'
        ? 'Store Admin Security Gate | Just Spuds'
        : 'Sign In | Just Spuds Aylesbury',
    description: 'Secure sign in for Just Spuds Aylesbury portals.',
  })

  // PIN & Passkey state
  const [pin, setPin] = useState('')
  const [passkey, setPasskey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [timeStr, setTimeStr] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  )

  const terminalEnrolled = isTerminalEnrolled()
  const hardwareLockActive = isStoreHardwareLockEnforced() && !isDriverTarget
  const requirePasskey = portalMode === 'admin' && hasAdminPasskey()

  // Keep live clock running for POS terminal aesthetic
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const submitPinLogin = useCallback(
    (pinToUse: string) => {
      const cleanPin = pinToUse.trim()
      if (!cleanPin) return

      if (portalMode === 'admin') {
        const res = loginAdminConsole(cleanPin, requirePasskey ? passkey : undefined)
        if (res.ok) {
          playPOSTouchTone('action')
          navigate(defaultTarget, { replace: true })
        } else {
          setError(res.message || 'Invalid Admin PIN. Only Store Admin can access this console.')
          playPOSTouchTone('numpad')
          setPin('')
        }
        return
      }

      if (portalMode === 'pos') {
        // If this physical device is NOT enrolled as an in-store terminal, only the Store Admin PIN can open it to enroll hardware!
        if (hardwareLockActive && !terminalEnrolled) {
          const adminRes = loginAdminConsole(cleanPin)
          if (adminRes.ok) {
            playPOSTouchTone('action')
            navigate(defaultTarget, { replace: true })
          } else {
            setError(
              '🔒 In-Store Hardware Lock: This device is not enrolled as a store terminal. Only the Store Admin PIN can authorize new store hardware.',
            )
            playPOSTouchTone('numpad')
            setPin('')
          }
          return
        }

        const allowedRoles = isDriverTarget ? (['DRIVER', ...MANAGEMENT_ROLES] as const) : SHOP_FLOOR_ROLES
        const res = loginWithPin(cleanPin, [...allowedRoles])
        if (res.ok) {
          playPOSTouchTone('action')
          navigate(defaultTarget, { replace: true })
        } else {
          if (!isDriverTarget && (cleanPin === '7777' || cleanPin === '7778' || cleanPin === '7779')) {
            setError('🚫 Delivery Driver PIN detected. In-store till register is reserved for counter & kitchen staff.')
          } else {
            setError(res.message || 'Invalid PIN.')
          }
          playPOSTouchTone('numpad')
          setPin('')
        }
      }
    },
    [portalMode, requirePasskey, passkey, defaultTarget, navigate, hardwareLockActive, terminalEnrolled, isDriverTarget],
  )

  const handleKeypadPress = useCallback((num: string) => {
    playPOSTouchTone('numpad')
    setError(null)
    setPin((prev) => (prev.length < 8 ? prev + num : prev))
  }, [])

  const handleClear = useCallback(() => {
    playPOSTouchTone('tap')
    setPin('')
    setError(null)
  }, [])

  const handleBackspace = useCallback(() => {
    playPOSTouchTone('tap')
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }, [])

  // Support physical keyboard numpad on POS & Admin login screens
  useEffect(() => {
    if (portalMode === 'customer') return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (/^\d$/.test(e.key)) {
        e.preventDefault()
        handleKeypadPress(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClear()
      } else if (e.key === 'Enter' && pin.length >= 4) {
        e.preventDefault()
        submitPinLogin(pin)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [portalMode, pin, handleKeypadPress, handleBackspace, handleClear, submitPinLogin])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitPinLogin(pin)
  }

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true)
    setError(null)
    try {
      const res = await loginWithGoogle()
      if (res.ok && res.user) {
        navigate(defaultTarget || homePortalForRole(res.user.role) || '/')
      } else {
        setError(res.message || 'Google sign in failed.')
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during Google sign in.')
    } finally {
      setLoadingGoogle(false)
    }
  }

  const currentUser = getCurrentUser()

  /* =========================================================================
     VIEW 1: DEDICATED IN-STORE POS & STAFF TERMINAL (/pos, /staff, /driver)
     - 100% viewport height, NO scrollbar, NO customer links, NO admin tabs.
     - Enforces Store Hardware Enrollment for in-store till & KDS.
     ========================================================================= */
  if (portalMode === 'pos') {
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden flex flex-col justify-between items-center bg-slate-950 font-body text-slate-100 select-none p-3 sm:p-4">
        <FixedAmbientBackdrop variant="portal" />

        {/* TOP STATUS BAR */}
        <header className="relative z-10 w-full flex items-center justify-between border-b border-white/10 pb-2 px-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-xl font-black text-ink shadow-sm">
              🥔
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-black tracking-wider text-white">JUST SPUDS</span>
                <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 border border-amber-400/30">
                  {isDriverTarget ? 'COURIER DISPATCH' : 'IN-STORE POS REGISTER'}
                </span>
                {!isDriverTarget && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                      terminalEnrolled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {terminalEnrolled ? '✓ Store Hardware Enrolled' : '🔒 Unenrolled Hardware'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {getLocalDeviceName()} &bull; Market Square, Aylesbury
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-amber-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{timeStr}</span>
            </div>
            <FullscreenButton />
          </div>
        </header>

        {/* CENTER AUTHENTICATION CARD (FITS 100% WITHOUT SCROLLING) */}
        <main className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center py-2">
          <div className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-slate-900/95 p-4 sm:p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-center">
            {/* Terminal Title */}
            <div className="text-center mb-3">
              <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-lg ring-2 ring-amber-400/50">
                {isDriverTarget ? '🛵' : '👨‍🍳'}
              </div>
              <h1 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                {isDriverTarget ? 'Courier Hub Sign-In' : 'In-Store Till Sign-In'}
              </h1>
              <p className="text-[11px] text-slate-400">
                {hardwareLockActive && !terminalEnrolled
                  ? '🔒 Device not enrolled — Enter Store Admin PIN to enroll this store machine'
                  : 'Enter your 4–8 digit PIN to unlock store terminal'}
              </p>
            </div>

            {/* If currently signed in on an enrolled terminal, offer fast continue */}
            {currentUser && SHOP_FLOOR_ROLES.includes(currentUser.role) && (!hardwareLockActive || terminalEnrolled) && (
              <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-2 text-center text-xs text-emerald-200 flex items-center justify-between">
                <span>Signed in as <strong>{currentUser.name}</strong></span>
                <button
                  type="button"
                  onClick={() => navigate(defaultTarget, { replace: true })}
                  className="rounded-lg bg-emerald-600 px-2 py-0.5 font-bold text-white text-[11px] hover:bg-emerald-500"
                >
                  Open Till &rarr;
                </button>
              </div>
            )}

            {/* PIN Dots Indicator (supports 4–8 digits) */}
            <div className="mb-3 flex justify-center gap-2.5">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, idx) => {
                const filled = pin.length > idx
                return (
                  <div
                    key={idx}
                    className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                      filled
                        ? 'border-amber-400 bg-amber-400 shadow-glow scale-110'
                        : 'border-slate-600 bg-slate-800'
                    }`}
                  />
                )
              })}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-3 rounded-xl border border-red-500/40 bg-red-950/60 p-2 text-center text-[11px] font-semibold text-red-200">
                {error}
              </div>
            )}

            {/* Numeric Keypad (Optimized Touch Targets) */}
            <form onSubmit={handleManualSubmit} className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="h-11 sm:h-12 rounded-2xl border border-white/10 bg-slate-800/80 font-mono text-lg sm:text-xl font-black text-white hover:bg-slate-700 active:scale-95 active:bg-amber-400 active:text-slate-950 transition shadow-sm"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-11 sm:h-12 rounded-2xl border border-rose-500/30 bg-rose-950/40 font-body text-xs font-bold text-rose-300 hover:bg-rose-900/60 active:scale-95 transition"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="h-11 sm:h-12 rounded-2xl border border-white/10 bg-slate-800/80 font-mono text-lg sm:text-xl font-black text-white hover:bg-slate-700 active:scale-95 active:bg-amber-400 active:text-slate-950 transition shadow-sm"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="h-11 sm:h-12 rounded-2xl border border-white/10 bg-slate-800/80 font-body text-sm font-bold text-amber-300 hover:bg-slate-700 active:scale-95 transition"
                  title="Backspace"
                >
                  ⌫
                </button>
              </div>

              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full rounded-2xl bg-amber-400 py-2.5 sm:py-3 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:bg-amber-300 active:scale-[0.99] transition mt-2 disabled:opacity-40"
              >
                {hardwareLockActive && !terminalEnrolled
                  ? 'Verify Admin & Enroll Store Hardware →'
                  : 'Unlock Store Terminal →'}
              </button>
            </form>
          </div>
        </main>

        {/* BOTTOM TERMINAL FOOTER */}
        <footer className="relative z-10 w-full border-t border-white/10 pt-2 px-2 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span>In-Store Authorized Hardware Only &bull; Single Authority Mode</span>
          <span className="font-mono text-slate-400">Ver 2.5.0 &bull; Hardware Guard Active</span>
        </footer>
      </div>
    )
  }

  /* =========================================================================
     VIEW 2: DEDICATED STORE ADMIN SECURITY VAULT (/admin)
     - Strictly Admin / Owner ONLY (No Cashiers, Kitchen Staff, Drivers, or Supervisors).
     - Enforces Admin Vault session + optional Secondary Admin Master Passkey.
     ========================================================================= */
  if (portalMode === 'admin') {
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden flex flex-col justify-between items-center bg-slate-950 font-body text-slate-100 select-none p-4">
        <FixedAmbientBackdrop variant="portal" />

        <header className="relative z-10 w-full flex items-center justify-between border-b border-white/10 pb-2 px-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-xl font-black text-ink shadow-sm">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-black tracking-wider text-white">JUST SPUDS</span>
                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300 border border-rose-500/30">
                  ADMIN VAULT ONLY
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Strictly Store Owner / Admin Access &bull; Auto-Locks After 15m Idle</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-amber-300">
            <span>{timeStr}</span>
          </div>
        </header>

        <main className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center py-2">
          <div className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-center">
            <div className="text-center mb-4">
              <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-lg ring-2 ring-amber-400/50">
                🔒
              </div>
              <h1 className="text-xl font-black text-white uppercase tracking-wider">Store Admin Vault</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Restricted exclusively to Store Owner / Admin ({ADMIN_CONSOLE_ROLES.length} authorized roles)
              </p>
            </div>

            {currentUser && !isAdminConsoleRole(currentUser.role) && (
              <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-950/50 p-2 text-center text-[11px] text-amber-200">
                ⚠️ Currently signed in on till as <strong>{currentUser.name} ({currentUser.role})</strong>. Only an Admin PIN can unlock this console.
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-xl border border-red-500/40 bg-red-950/60 p-2.5 text-center text-xs font-semibold text-red-200">
                {error}
              </div>
            )}

            {/* PIN Dots (4–8 digits) */}
            <div className="mb-3 flex justify-center gap-2.5">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                    pin.length > idx
                      ? 'border-amber-400 bg-amber-400 shadow-glow scale-110'
                      : 'border-slate-600 bg-slate-800'
                  }`}
                />
              ))}
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-2.5">
              {requirePasskey && (
                <div>
                  <input
                    type="password"
                    value={passkey}
                    onChange={(e) => setPasskey(e.target.value)}
                    placeholder="Admin Master Passkey (Required)"
                    aria-label="Admin Master Passkey"
                    className="w-full rounded-xl border border-amber-400/40 bg-slate-950 px-3 py-2 text-center font-mono text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="h-11 rounded-2xl border border-white/10 bg-slate-800/80 font-mono text-xl font-bold text-white hover:bg-slate-700 active:scale-95 active:bg-amber-400 active:text-slate-950 transition"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-11 rounded-2xl border border-rose-500/30 bg-rose-950/40 font-body text-xs font-bold text-rose-300 hover:bg-rose-900/60 active:scale-95 transition"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="h-11 rounded-2xl border border-white/10 bg-slate-800/80 font-mono text-xl font-bold text-white hover:bg-slate-700 active:scale-95 active:bg-amber-400 active:text-slate-950 transition"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="h-11 rounded-2xl border border-white/10 bg-slate-800/80 font-body text-sm font-bold text-amber-300 hover:bg-slate-700 active:scale-95 transition"
                >
                  ⌫
                </button>
              </div>

              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full rounded-2xl bg-amber-400 py-3 font-body text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:bg-amber-300 transition mt-2 disabled:opacity-40"
              >
                Unlock Admin Vault &rarr;
              </button>
            </form>
          </div>
        </main>

        <footer className="relative z-10 w-full border-t border-white/10 pt-2 px-2 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Cryptographic Session Guard &bull; Admin-Only Policy</span>
          <span className="font-mono text-slate-400">Admin Security Vault</span>
        </footer>
      </div>
    )
  }

  /* =========================================================================
     VIEW 3: PUBLIC STOREFRONT CUSTOMER LOGIN (www.justspuds.uk)
     - 1-Click Google sign in, customer favorites and order history.
     ========================================================================= */
  return (
    <div className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 py-12 select-none overflow-hidden">
      <FixedAmbientBackdrop variant="login" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-amber-400/35 bg-white/95 backdrop-blur-xl p-6 sm:p-8 shadow-warm-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-3xl shadow-lg ring-2 ring-amber-400/60">
            🥔
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-black text-ink">Customer Account</h1>
          <p className="font-body text-xs text-slate-500 mt-1">
            Just Spuds Aylesbury &bull; Fast Checkout &amp; Order Tracker
          </p>
        </div>

        {currentUser && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 flex items-center justify-between">
            <div>
              <p className="font-bold">Signed in as {currentUser.name}</p>
              <p className="text-[11px] text-slate-600">{currentUser.email}</p>
            </div>
            <Link
              to="/menu"
              className="rounded-lg bg-emerald-700 text-white px-3 py-1 text-[11px] font-bold hover:bg-emerald-600"
            >
              Order Menu &rarr;
            </Link>
          </div>
        )}

        <div className="space-y-4 pt-1">
          <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent p-4 space-y-2">
            <p className="font-body text-xs font-black uppercase tracking-wider text-amber-900">
              ✨ Fast 1-Click Customer Access
            </p>
            <p className="font-body text-xs text-slate-600 leading-relaxed">
              Sign in with Google to pre-fill your delivery details and access live potato order tracking.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-body">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loadingGoogle}
            onClick={handleGoogleSignIn}
            className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-4 font-body text-sm font-bold text-slate-800 shadow-md hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] transition flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {loadingGoogle ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <span>Signing in with Google...</span>
              </div>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        <div className="border-t border-slate-100 pt-4 text-center">
          <Link to="/" className="text-xs text-amber-700 hover:text-amber-900 font-bold">
            &larr; Return to Just Spuds Menu &amp; Ordering
          </Link>
        </div>
      </div>
    </div>
  )
}
