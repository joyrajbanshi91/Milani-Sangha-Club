/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_USE_FIREBASE_EMULATORS?: string
  readonly VITE_CLUB_NAME: string
  readonly VITE_CLUB_UPI_ID?: string
  readonly VITE_SUPPORT_EMAIL?: string
  // DEV_API_PROXY is intentionally absent: it has no VITE_ prefix, so Vite
  // keeps it out of the bundle and it is readable only in vite.config.ts.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
