import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

import { env, hasFirebaseCredentials, isGoogleCloudRuntime, isServerless } from './env.js'
import { logger } from '../lib/logger.js'

let app: App | undefined
let firestore: Firestore | undefined

/**
 * Initialise Firebase Admin lazily.
 *
 * Lazily, because the process must be able to start and answer a health check
 * before credentials exist — otherwise a misconfigured secret takes down the
 * whole service instead of failing the one route that needs the database.
 *
 * Note that the Admin SDK bypasses Firestore and Storage security rules. Every
 * privileged operation in this codebase — verifying a payment, allocating a
 * receipt number, writing an audit log — runs here, and must perform its own
 * authorisation check first.
 */
export function getFirebaseApp(): App {
  if (app) return app

  if (!hasFirebaseCredentials) {
    throw new Error(
      'Firebase Admin is not configured. Set GOOGLE_APPLICATION_CREDENTIALS, or ' +
        'FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, in backend/.env.'
    )
  }

  const existing = getApps()
  if (existing.length > 0 && existing[0]) {
    app = existing[0]
    return app
  }

  // On Cloud Run or Cloud Functions, initializeApp() with no credential picks up
  // the runtime service account. Passing a cert there would be wrong as well as
  // unnecessary — there is no key to pass.
  const useInlineCredential =
    !isGoogleCloudRuntime &&
    Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY)

  app = initializeApp({
    ...(useInlineCredential
      ? {
          credential: cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            // Secret managers and .env files store the key with escaped
            // newlines; the SDK needs real ones.
            privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        }
      : {}),
    ...(env.FIREBASE_PROJECT_ID ? { projectId: env.FIREBASE_PROJECT_ID } : {}),
    ...(env.FIREBASE_STORAGE_BUCKET ? { storageBucket: env.FIREBASE_STORAGE_BUCKET } : {}),
  })

  logger.info(
    { projectId: env.FIREBASE_PROJECT_ID ?? '(from credential)' },
    'firebase admin initialised'
  )

  return app
}

export function getDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp())
    firestore.settings({
      ignoreUndefinedProperties: true,
      /**
       * Use REST instead of gRPC when running as a serverless function.
       *
       * gRPC opens a long-lived HTTP/2 channel, which pays off in a
       * continuously-running server but is wasted in a function that handles one
       * request and freezes: establishing it dominates the cold start, and the
       * channel is often torn down before it is reused. REST is markedly faster to
       * the first query in that shape.
       *
       * Left on gRPC locally, where the process stays alive and the channel is
       * genuinely reused.
       */
      preferRest: isServerless,
    })
  }
  return firestore
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseApp())
}

export function getBucket() {
  return getStorage(getFirebaseApp()).bucket()
}
