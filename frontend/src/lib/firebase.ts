import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'

import { env, isDevelopment } from '@/config/env'

/**
 * Firebase in the browser — **authentication only**.
 *
 * Client Firestore and Storage are deliberately not imported. Every figure the
 * app shows comes from the Express API, because the rules that matter cannot be
 * expressed in a security rule: the two-person approval, gapless reference
 * numbers, the audit trail. Giving the browser a Firestore handle would create a
 * second, weaker path to the same data.
 *
 * It is also 377 kB of JavaScript (112 kB compressed) that would otherwise be
 * downloaded, parsed and never called — on a phone, on mobile data.
 *
 * If a future feature genuinely needs live client reads — a notice board updating
 * without a refresh, say — import `firebase/firestore` in that feature's own
 * module so the cost lands only on the page that uses it.
 */
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  ...(env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
}

// getApps() guards against re-initialisation during hot module replacement.
export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(firebaseApp)

if (env.VITE_USE_FIREBASE_EMULATORS && isDevelopment) {
  // Port must match the "emulators" block in firebase.json.
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  console.warn('[firebase] using the local Auth emulator')
}
