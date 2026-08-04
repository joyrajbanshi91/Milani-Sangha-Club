import { z } from 'zod'

/**
 * Validated view of the build-time environment.
 *
 * Fail loudly and early: a missing Appwrite project id should stop the app at boot
 * with a readable message, not surface later as an opaque network error in a
 * member's browser.
 *
 * Only two values are needed to reach Appwrite, and neither is a secret. The
 * project id names the project; the endpoint says which region hosts it. What a
 * caller is allowed to do is decided by their session and by table permissions,
 * never by holding these.
 */
const envSchema = z.object({
  // Region-specific on Appwrite Cloud, e.g. https://syd.cloud.appwrite.io/v1.
  // The default is a starting point; set it explicitly for a real project.
  VITE_APPWRITE_ENDPOINT: z.string().min(1).default('https://cloud.appwrite.io/v1'),
  VITE_APPWRITE_PROJECT_ID: z.string().min(1, 'VITE_APPWRITE_PROJECT_ID is required'),

  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_CLUB_NAME: z.string().min(1).default('Milani Sangha Club'),
  VITE_CLUB_UPI_ID: z.string().optional(),
  VITE_SUPPORT_EMAIL: z.email().optional().or(z.literal('')),
})

export type Env = z.infer<typeof envSchema>

/**
 * Values Appwrite Sites supplies about itself, baked in by vite.config.ts.
 *
 * `typeof` rather than a direct read: under vitest there is no `define` step, so
 * the identifier does not exist. `typeof` on an undeclared name is safe where
 * reading it would throw.
 */
declare const __APPWRITE_PROJECT_ID__: string
declare const __APPWRITE_ENDPOINT__: string

function fromHost(): Record<string, string> {
  const values: Record<string, string> = {}

  if (typeof __APPWRITE_PROJECT_ID__ === 'string' && __APPWRITE_PROJECT_ID__ !== '') {
    values.VITE_APPWRITE_PROJECT_ID = __APPWRITE_PROJECT_ID__
  }
  if (typeof __APPWRITE_ENDPOINT__ === 'string' && __APPWRITE_ENDPOINT__ !== '') {
    values.VITE_APPWRITE_ENDPOINT = __APPWRITE_ENDPOINT__
  }

  return values
}

function parseEnv(): Env {
  // The host's own values fill only the gaps: anything set explicitly wins, and an
  // empty string counts as unset so a variable created without a value in a
  // dashboard cannot shadow what Appwrite already told us.
  const supplied = Object.fromEntries(
    Object.entries(import.meta.env).filter(([, value]) => value !== '')
  )

  const result = envSchema.safeParse({ ...fromHost(), ...supplied })

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `Invalid frontend environment configuration:\n${missing}\n\n` +
        'Copy frontend/.env.example to frontend/.env.local and fill in the values ' +
        '(see docs/03-environment-variables.md).'
    )
  }

  return result.data
}

export const env = parseEnv()

export const isDevelopment = import.meta.env.DEV
export const isProduction = import.meta.env.PROD
