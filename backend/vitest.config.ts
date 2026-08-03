import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '5055',
      CORS_ORIGINS: 'http://localhost:5173',
      LOG_LEVEL: 'silent',

      /**
       * Force demo mode for the whole suite.
       *
       * Without this the tests inherit whatever is in backend/.env: once a
       * developer configures real Firebase credentials, the API switches to
       * Firestore and Firebase Auth, `demo-login` starts returning 400, and
       * eighteen tests fail for reasons that have nothing to do with the code.
       *
       * Set to empty strings rather than deleted, because dotenv does not
       * overwrite a key that is already present in process.env — an empty value
       * is "present" and falsy, which is exactly what is wanted. Tests then run
       * against the in-memory store on every machine and in CI alike.
       */
      GOOGLE_APPLICATION_CREDENTIALS: '',
      FIREBASE_PROJECT_ID: '',
      FIREBASE_CLIENT_EMAIL: '',
      FIREBASE_PRIVATE_KEY: '',
      FIRESTORE_EMULATOR_HOST: '',
    },
  },
})
