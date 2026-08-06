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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

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

  // Appwrite — the backing store and the identity provider. Optional so the service
  // can boot and report health before one is provisioned; without these it serves the
  // embedded demo ledger and says so.
  //
  // APPWRITE_API_KEY is a server credential — see config/appwrite.ts.
  //
  // The endpoint is region-specific on Appwrite Cloud
  // (https://<region>.cloud.appwrite.io/v1); the default is only a sensible
  // starting point and should be set explicitly for a real project.
  APPWRITE_ENDPOINT: z.url().default('https://cloud.appwrite.io/v1'),
  APPWRITE_PROJECT_ID: z.string().optional(),
  APPWRITE_API_KEY: z.string().optional(),
  APPWRITE_DATABASE_ID: z.string().default('club'),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanish,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  CLUB_NAME: z.string().default('New Barrackpore Milani Sangha Club'),
  CLUB_UPI_ID: z.string().optional(),

  /**
   * The letterhead on the receipts and the statements.
   *
   * Both are printed by the API, which cannot read the website's content file — so
   * the club's address is stated here for the documents that leave the building.
   * Optional on purpose: unset, the documents print the club's name alone, which is
   * true, rather than an address somebody invented.
   *
   * Keep them in step with section 1 of frontend/src/content/site.ts by hand. Two
   * homes for one fact is a real cost, and the alternative — a service that must
   * fetch the website to print a receipt — is a worse one.
   */
  CLUB_ADDRESS: z.string().optional(),
  CLUB_REGISTRATION_NUMBER: z.string().optional(),

  /**
   * Where the website's contact form sends enquiries.
   *
   * Deliberately here and not in the request: a form that carries its own recipient is
   * an open mail relay, and automated scanners find those within days. Unset, the club's
   * own SMTP user receives them, which is the sensible default when both are the same
   * mailbox.
   *
   * Keep it in step with `club.contact.email` in frontend/src/content/site.ts — that is
   * the address printed on the page, and a visitor who is told one address while the
   * message goes to another has been misled.
   */
  CONTACT_TO: z.string().optional(),
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
 * Running as a short-lived function rather than a long-lived server?
 *
 * **Appwrite** sets APPWRITE_FUNCTION_ID, which is the case that matters here —
 * functions/api/main.mjs is how this API is deployed. AWS Lambda sets
 * AWS_LAMBDA_FUNCTION_NAME, Cloud Functions sets FUNCTION_TARGET and Vercel sets
 * VERCEL; the others are kept so the same code reports itself honestly wherever it
 * is put.
 *
 * Used only to decide how loudly to talk about a missing database. `buildStore()`
 * once used it to *refuse* to start without credentials, which turned a first
 * deploy into 500s from every route; it now logs a warning naming the variables to
 * set instead. The distinction between a warning and a crash is the difference
 * between a site the club can look at and one they cannot.
 */
export const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ??
  process.env.FUNCTION_TARGET ??
  process.env.VERCEL ??
  process.env.APPWRITE_FUNCTION_ID
)

/**
 * Which Appwrite project, worked out rather than demanded.
 *
 * Appwrite injects `APPWRITE_FUNCTION_PROJECT_ID` into every function execution, so
 * the API running as a function already knows which project it belongs to. An
 * explicit `APPWRITE_PROJECT_ID` still wins — that is how a local shell, a script or
 * a differently-hosted deployment points itself somewhere — but one fewer variable
 * to set by hand is one fewer to set wrongly, and a project id that cannot disagree
 * with its own host cannot be mismatched.
 *
 * An empty string counts as unset, so a variable created in a dashboard without a
 * value cannot shadow what the platform supplied.
 */
export const appwriteProjectId =
  env.APPWRITE_PROJECT_ID?.trim() || process.env.APPWRITE_FUNCTION_PROJECT_ID?.trim() || undefined

/**
 * Whether the Appwrite server SDK can be initialised.
 *
 * Both halves are required and neither is useful alone: the project id says
 * *which* project, the API key is what authorises writing to it.
 */
export const hasAppwriteCredentials = Boolean(appwriteProjectId && env.APPWRITE_API_KEY)
