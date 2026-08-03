import dotenv from 'dotenv'
import { z } from 'zod'

// quiet: suppress dotenv's startup banner so it cannot interleave with the
// structured JSON log stream.
dotenv.config({ quiet: true })

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5055),
  APP_VERSION: z.string().default('0.1.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  APP_BASE_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Firebase Admin credentials are optional so that the service can boot (and
  // report health) before credentials are provisioned. Any route that touches
  // Firestore calls getFirestore(), which fails loudly if they are absent.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanish,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  CLUB_NAME: z.string().default('Milani Sangha Club'),
  CLUB_UPI_ID: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(
    `Invalid backend environment configuration:\n${details}\n\n` +
      'Copy backend/.env.example to backend/.env and fill in the values ' +
      '(see docs/03-environment-variables.md).'
  )
}

export const env: Env = parsed.data

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
export const isDevelopment = env.NODE_ENV === 'development'

/**
 * Are we running inside Google's own infrastructure?
 *
 * Cloud Run sets K_SERVICE, Cloud Functions sets FUNCTION_TARGET, and both set
 * GAE_ENV on App Engine. In those runtimes the service account is supplied
 * implicitly as Application Default Credentials — there is no key file and no
 * FIREBASE_PRIVATE_KEY, which is the *safer* arrangement, not a missing one.
 *
 * Without this check the API would decide it had no credentials, fall back to the
 * in-memory demo store, and that store refuses to run in production — so every
 * cloud deployment would crash at boot with a confusing message.
 */
export const isGoogleCloudRuntime = Boolean(
  process.env.K_SERVICE ?? process.env.FUNCTION_TARGET ?? process.env.GAE_ENV
)

/**
 * Running as a short-lived function rather than a long-lived server?
 *
 * Netlify and AWS Lambda set AWS_LAMBDA_FUNCTION_NAME; Cloud Functions sets
 * FUNCTION_TARGET; Vercel sets VERCEL. Used to pick the Firestore transport, where
 * the right answer differs between a process that lives for weeks and one that
 * handles a single request.
 */
export const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ?? process.env.FUNCTION_TARGET ?? process.env.VERCEL
)

/** Whether Firebase Admin can be initialised with the current configuration. */
export const hasFirebaseCredentials =
  isGoogleCloudRuntime ||
  Boolean(env.GOOGLE_APPLICATION_CREDENTIALS) ||
  Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) ||
  Boolean(process.env.FIRESTORE_EMULATOR_HOST)
