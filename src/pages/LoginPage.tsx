import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { loginWithPin, loginWithCredentials, loginWithGoogle, getCurrentUser, homePortalForRole, type Role } from '../services/authStore'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

type LoginTab = 'staff' | 'admin' | 'customer'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect') || '/'

  useDocumentMeta({
    title: 'Staff & Portal Sign In',
    description: 'Sign in to the Just Spuds Kitchen Display System (KDS) or Management Console.',
  })

  const [tab, setTab] = useState<LoginTab>('staff')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Post-login routing lives in authStore so every role lands somewhere useful;
  // customers (no portal) go back to wherever they came from.
  const destinationForRole = (role?: Role): string => homePortalForRole(role) ?? redirect

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin.trim()) return
    const res = loginWithPin(pin)
    if (res.ok) {
      navigate(destinationForRole(res.user?.role))
    } else {
      setError(res.message)
    }
  }

  const handleCredSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    const res = loginWithCredentials(email, password)
    if (res.ok) {
      navigate(destinationForRole(res.user?.role))
    } else {
      setError(res.message)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true)
    setError(null)
    try {
      const res = await loginWithGoogle()
      if (res.ok && res.user) {
        navigate(destinationForRole(res.user.role))
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

  return (
    <div className="min-h-screen bg-stock pb-32 pt-[110px] sm:pt-[130px] flex flex-col items-center justify-center px-4">
      {/* Return to Site Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 font-body text-xs font-bold text-ink shadow-sm hover:bg-paper transition"
        >
          <span>←</span>
          <span>Back to Just Spuds Official Site</span>
        </Link>
        <Link
          to="/menu"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-400/20 px-4 py-2 font-body text-xs font-bold text-amber-900 shadow-sm hover:bg-amber-400 transition"
        >
          <span>🥔</span>
          <span>Order Menu</span>
        </Link>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-ink/10 bg-white p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-glow">
            {tab === 'staff' ? '👨‍🍳' : tab === 'admin' ? '📊' : '👤'}
          </div>
          <h1 className="display text-2xl sm:text-3xl text-ink font-bold">
            {tab === 'staff' ? 'Kitchen Staff PIN' : tab === 'admin' ? 'Admin Management Login' : 'Customer Account'}
          </h1>
          <p className="font-body text-xs text-slate-500 mt-1">
            Just Spuds Aylesbury &bull; Market Square Portal
          </p>
        </div>

        {/* Role Tab Selector */}
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-ink/10 bg-paper p-1 text-center font-body text-xs font-bold">
          <button
            type="button"
            onClick={() => { setTab('staff'); setError(null) }}
            className={`rounded-xl py-2 transition ${tab === 'staff' ? 'bg-amber-400 text-ink shadow font-black' : 'text-slate-600 hover:text-ink'}`}
          >
            Staff KDS
          </button>
          <button
            type="button"
            onClick={() => { setTab('admin'); setError(null) }}
            className={`rounded-xl py-2 transition ${tab === 'admin' ? 'bg-amber-400 text-ink shadow font-black' : 'text-slate-600 hover:text-ink'}`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => { setTab('customer'); setError(null) }}
            className={`rounded-xl py-2 transition ${tab === 'customer' ? 'bg-amber-400 text-ink shadow font-black' : 'text-slate-600 hover:text-ink'}`}
          >
            Customer
          </button>
        </div>

        {/* Current status if already logged in */}
        {currentUser && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 flex items-center justify-between">
            <div>
              <p className="font-bold">Signed in as {currentUser.name}</p>
              <p className="text-[11px]">Role: {currentUser.role}</p>
            </div>
            <Link
              to={destinationForRole(currentUser.role)}
              className="rounded-lg bg-emerald-700 text-white px-3 py-1 text-[11px] font-bold"
            >
              Continue →
            </Link>
          </div>
        )}

        {/* TAB 1: STAFF QUICK PIN */}
        {tab === 'staff' && (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <label className="block text-center font-body text-xs font-bold text-slate-600">
              Enter 4-Digit Staff PIN
            </label>
            <input
              type="password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border border-ink/20 bg-paper py-3 text-center font-mono text-3xl tracking-[0.5em] text-ink focus:border-amber-500 focus:outline-none"
            />

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPin((prev) => (prev.length < 4 ? prev + num : prev))}
                  className="rounded-xl border border-ink/10 bg-white py-3 font-mono text-lg font-bold text-ink hover:bg-paper active:scale-95 shadow-xs"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                className="rounded-xl border border-red-200 bg-red-50 py-3 font-body text-xs font-bold text-red-600 hover:bg-red-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setPin((prev) => (prev.length < 4 ? prev + '0' : prev))}
                className="rounded-xl border border-ink/10 bg-white py-3 font-mono text-lg font-bold text-ink hover:bg-paper"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin((prev) => prev.slice(0, -1))}
                className="rounded-xl border border-ink/10 bg-white py-3 font-body text-xs font-bold text-ink hover:bg-paper"
              >
                ⌫
              </button>
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 border border-red-200 p-2.5 font-body text-xs text-red-600 text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
            >
              Access Kitchen KDS →
            </button>
          </form>
        )}

        {/* TAB 2: ADMIN CREDENTIALS */}
        {tab === 'admin' && (
          <form onSubmit={handleCredSubmit} className="space-y-4">
            <div>
              <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Admin Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@justspuds.uk"
                className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-body text-[10px] font-bold uppercase text-slate-500 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 font-body text-xs text-ink focus:border-amber-500 focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 border border-red-200 p-2.5 font-body text-xs text-red-600 text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
            >
              Sign In to Management Console →
            </button>
          </form>
        )}

        {/* TAB 3: CUSTOMER GOOGLE SIGN IN */}
        {tab === 'customer' && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent p-4 space-y-2">
              <p className="font-body text-xs font-black uppercase tracking-wider text-amber-900">
                ✨ Fast 1-Click Customer Access
              </p>
              <p className="font-body text-xs text-slate-600 leading-relaxed">
                Continue with your Google account for live GPS order tracking, 1-click checkout, and instant loyalty rewards.
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-body space-y-2 text-left">
                <p className="font-semibold">{error}</p>
                {error.includes('Authorized domains') ? (
                  <a
                    href="https://console.firebase.google.com/project/just-spuds/authentication/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 underline"
                  >
                    Open Firebase Authorized Domains Settings &rarr;
                  </a>
                ) : error.includes('Firebase Console') ? (
                  <a
                    href="https://console.firebase.google.com/project/just-spuds/authentication/providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 underline"
                  >
                    Open Firebase Console Sign-in settings &rarr;
                  </a>
                ) : null}
              </div>
            )}

            <button
              type="button"
              disabled={loadingGoogle}
              onClick={handleGoogleSignIn}
              className="w-full rounded-2xl border border-slate-300 bg-white py-4 px-4 font-body text-sm font-bold text-slate-800 shadow-md hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] transition flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
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

            <p className="text-center font-body text-[11px] text-slate-400">
              No passwords required &bull; Powered by Google Firebase
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
