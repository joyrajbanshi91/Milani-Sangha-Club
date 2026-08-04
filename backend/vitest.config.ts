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
       * developer configures real credentials, the API switches to the real
       * database and real authentication, `demo-login` starts returning 400, and
       * a dozen tests fail for reasons that have nothing to do with the code.
       *
       * Set to empty strings rather than deleted, because dotenv does not
       * overwrite a key that is already present in process.env — an empty value
       * is "present" and falsy, which is exactly what is wanted. Tests then run
       * against the in-memory store on every machine and in CI alike.
       *
       * The Appwrite pair was added after exactly the failure this comment
       * predicted: configuring a real project broke seventeen tests, because the
       * list had not grown when the backing store changed. Anything new that
       * `hasAppwriteCredentials`-style checks read belongs here on the same day it
       * is introduced.
       */
      GOOGLE_APPLICATION_CREDENTIALS: '',
      FIREBASE_PROJECT_ID: '',
      FIREBASE_CLIENT_EMAIL: '',
      FIREBASE_PRIVATE_KEY: '',
      FIRESTORE_EMULATOR_HOST: '',
      APPWRITE_PROJECT_ID: '',
      APPWRITE_API_KEY: '',
    },
  },
})
