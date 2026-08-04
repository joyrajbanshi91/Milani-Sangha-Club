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

function parseEnv(): Env {
  const result = envSchema.safeParse(import.meta.env)

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
