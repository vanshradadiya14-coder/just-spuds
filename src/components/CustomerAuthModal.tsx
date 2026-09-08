import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentUser, loginWithGoogle, logout, subscribeAuth, type AuthUser } from '../services/authStore'
import { getCustomerPlacedOrderIds, getActiveCustomerOrderId } from '../services/orderStore'

interface CustomerAuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CustomerAuthModal({ isOpen, onClose }: CustomerAuthModalProps) {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setUser(getCurrentUser())
    const unsub = subscribeAuth((u) => setUser(u))
    return unsub
  }, [])

  if (!isOpen) return null

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await loginWithGoogle()
      if (res.ok && res.user) {
        setMessage(`Welcome, ${res.user.name}!`)
        setTimeout(() => {
          onClose()
          setMessage(null)
        }, 800)
      } else {
        setError(res.message || 'Google sign in failed.')
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during Google sign in.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    setMessage('Logged out successfully.')
    setTimeout(() => {
      setMessage(null)
    }, 1000)
  }

  const activeOrderId = getActiveCustomerOrderId()
  const orderCount = getCustomerPlacedOrderIds().length

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-ink/80 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white text-ink shadow-2xl border border-ink/10 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 bg-paper/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-400 text-lg shadow-glow">
              👤
            </span>
            <div>
              <h3 className="display text-xl font-bold text-ink leading-tight">
                {user ? 'My Customer Account' : 'Sign In with Google'}
              </h3>
              <p className="font-body text-[11px] text-slate-500">
                Just Spuds Aylesbury &bull; Market Square
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink/5 hover:text-ink transition"
          >
            ✕
          </button>
        </div>

        {message && (
          <div className="bg-emerald-500 px-4 py-2.5 text-center font-body text-xs font-bold text-white shadow-inner">
            {message}
          </div>
        )}

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {user ? (
            /* LOGGED IN VIEW */
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.name}
                        className="h-11 w-11 rounded-full object-cover border-2 border-amber-400 shadow-sm"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-400 font-bold text-ink text-base">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h4 className="font-body text-sm font-black text-ink">{user.name}</h4>
                      <p className="font-body text-xs text-slate-600">{user.email}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-body text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                    Google Account
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-400/20 text-center font-body">
                  <div className="rounded-xl bg-white p-2.5 shadow-xs">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Spud Rewards</p>
                    <p className="text-lg font-black text-amber-600">🥔 150 Pts</p>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 shadow-xs">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Orders Placed</p>
                    <p className="text-lg font-black text-ink">📦 {orderCount} Orders</p>
                  </div>
                </div>
              </div>

              {/* Active Order Quick Link */}
              {activeOrderId && (
                <Link
                  to={`/track/${activeOrderId}`}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-2xl border border-amber-400 bg-amber-400/20 p-4 font-body text-xs font-black text-ink shadow-glow transition hover:bg-amber-400"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping" />
                    <span>🛵 Track Active Order Live</span>
                  </div>
                  <span>➔</span>
                </Link>
              )}

              <div className="space-y-2 font-body text-xs">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-xl border border-red-200 bg-red-50 py-3 font-bold text-red-700 hover:bg-red-100 transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            /* LOGGED OUT VIEW - CLEAN GOOGLE SIGN-IN */
            <div className="space-y-5">
              {/* Rewards & Benefits Card */}
              <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-900 font-body text-xs font-black uppercase tracking-wider">
                  <span>✨ Customer Benefits</span>
                </div>
                <ul className="space-y-2 font-body text-xs text-slate-700">
                  <li className="flex items-center gap-2.5">
                    <span className="text-amber-500 font-bold">✓</span>
                    <span><strong>1-Click Sign In</strong> — no passwords to remember</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="text-amber-500 font-bold">✓</span>
                    <span><strong>Fast Checkout</strong> with automatic name &amp; email auto-fill</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="text-amber-500 font-bold">✓</span>
                    <span><strong>Live Order Tracking</strong> synced across your phone and laptop</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="text-amber-500 font-bold">✓</span>
                    <span><strong>Earn 10 Spud Points</strong> for every £1 spent on jackets &amp; meal deals</span>
                  </li>
                </ul>
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

              {/* Prominent Continue with Google Button */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full rounded-2xl border border-slate-300 bg-white py-4 px-4 font-body text-sm font-bold text-slate-800 shadow-md hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] transition flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
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
                  Secure sign-in powered by Google Firebase
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
