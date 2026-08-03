import { z } from 'zod'

/**
 * Validated view of the build-time environment.
 *
 * Fail loudly and early: a missing Firebase key should stop the app at boot
 * with a readable message, not surface later as an opaque `auth/invalid-api-key`
 * in a member's browser.
 */
const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1, 'VITE_FIREBASE_API_KEY is required'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1, 'VITE_FIREBASE_AUTH_DOMAIN is required'),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1, 'VITE_FIREBASE_PROJECT_ID is required'),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1, 'VITE_FIREBASE_STORAGE_BUCKET is required'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z
    .string()
    .min(1, 'VITE_FIREBASE_MESSAGING_SENDER_ID is required'),
  VITE_FIREBASE_APP_ID: z.string().min(1, 'VITE_FIREBASE_APP_ID is required'),
  VITE_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  VITE_FIREBASE_VAPID_KEY: z.string().optional(),
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_USE_FIREBASE_EMULATORS: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
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
