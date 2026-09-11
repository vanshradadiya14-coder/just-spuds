import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAOANJE03YZtwv0bU9q6WIJ9YiDJOkulsw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'just-spuds.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'just-spuds',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'just-spuds.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '168671709253',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:168671709253:web:5bd832c692b39319ff3b2c',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-Y4WE3WMB3X',
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  )
}

export let app: FirebaseApp | null = null
export let auth: Auth | null = null
export let analytics: Analytics | null = null
export let googleProvider: GoogleAuthProvider | null = null

if (typeof window !== 'undefined' && isFirebaseConfigured()) {
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
    auth = getAuth(app)
    googleProvider = new GoogleAuthProvider()
    googleProvider.setCustomParameters({
      prompt: 'select_account',
    })

    isSupported().then((supported) => {
      if (supported && app) {
        analytics = getAnalytics(app)
      }
    }).catch(() => {
      // Analytics not supported in this environment
    })
  } catch (err) {
    console.warn('[Firebase] Initialization error:', err)
  }
}

export interface GoogleAuthResult {
  ok: boolean
  user?: {
    uid: string
    displayName: string
    email: string
    photoURL?: string
  }
  message?: string
}

/**
 * Executes Google Sign In with Firebase Authentication.
 * If Firebase environment variables are not yet configured, provides a smooth fallback.
 */
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (!isFirebaseConfigured() || !auth || !googleProvider) {
    // If not configured in .env, prompt user or use mock fallback
    console.warn('[Firebase] Firebase is not yet configured with VITE_FIREBASE_API_KEY in .env')
    return {
      ok: false,
      message: 'Firebase configuration missing. Please add VITE_FIREBASE_API_KEY and credentials to your .env file.',
    }
  }

  try {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    return {
      ok: true,
      user: {
        uid: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Customer',
        email: user.email || '',
        photoURL: user.photoURL || undefined,
      },
    }
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      return { ok: false, message: 'Sign in popup was closed.' }
    }
    if (error.code === 'auth/cancelled-popup-request') {
      return { ok: false, message: 'Popup request was cancelled.' }
    }
    if (error.code === 'auth/configuration-not-found') {
      return {
        ok: false,
        message: 'Google Sign-In needs to be enabled: Go to Firebase Console -> Authentication -> Sign-in method -> Enable "Google".',
      }
    }
    if (error.code === 'auth/unauthorized-domain') {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'justspuds.uk'
      return {
        ok: false,
        message: `Domain not authorized: Add "${currentHost}" in Firebase Console -> Authentication -> Settings -> Authorized domains.`,
      }
    }
    return { ok: false, message: error.message || 'Google sign in failed.' }
  }
}

export async function signOutFromFirebase(): Promise<void> {
  if (auth) {
    try {
      await signOut(auth)
    } catch {
      // Ignore
    }
  }
}
