import { z } from 'zod'

/**
 * Validated view of the build-time environment.
 *
 * **Nothing here is required.** The site builds and runs with no environment
 * variables at all, which is what makes a first deploy a push rather than a
 * configuration exercise: the public website is entirely self-contained,
 * and the signed-in area follows whatever the API reports about itself.
 *
 * That was not always so. An earlier version required an Appwrite project id and
 * threw at boot without one, so a hosted build either failed in the build log or —
 * worse — succeeded and then refused to start in every visitor's browser. A
 * missing *optional* integration must degrade, not detonate.
 *
 * The two Appwrite values are needed only when the club points the app at a real
 * Appwrite project. Neither is a secret: the project id names the project and the
 * endpoint says which region hosts it. What a caller may do is decided by their
 * session and by table permissions, never by holding these.
 */
const envSchema = z.object({
  // Region-specific on Appwrite Cloud, e.g. https://fra.cloud.appwrite.io/v1.
  // Copy it from the console rather than guessing; the default is only a fallback
  // for a project in the default region.
  VITE_APPWRITE_ENDPOINT: z.string().default('https://cloud.appwrite.io/v1'),
  // Empty is a valid, supported state: it means demo sign-in.
  VITE_APPWRITE_PROJECT_ID: z.string().default(''),

  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_CLUB_NAME: z.string().min(1).default('New Barrackpore Milani Sangha Club'),
  VITE_CLUB_UPI_ID: z.string().optional(),
  VITE_SUPPORT_EMAIL: z.email().optional().or(z.literal('')),
})

export type Env = z.infer<typeof envSchema>

function parseEnv(): Env {
  // An empty string counts as unset, so a variable created in a hosting dashboard
  // without a value cannot shadow the default below it.
  const supplied = Object.fromEntries(
    Object.entries(import.meta.env).filter(([, value]) => value !== '')
  )

  const result = envSchema.safeParse(supplied)

  if (!result.success) {
    // Reachable only for a value that is present but malformed — a support address
    // that is not an email, say. Absence can no longer fail.
    const problems = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `Invalid frontend environment configuration:\n${problems}\n\n` +
        'These values are optional, so this means one that was set is malformed. ' +
        'See frontend/.env.example and docs/03-environment-variables.md.'
    )
  }

  return result.data
}

export const env = parseEnv()

/**
 * Can this build talk to a real Appwrite project?
 *
 * Consulted before the Appwrite SDK is used for anything. Without it the app runs
 * against the API's demo sign-in, which is a working state rather than an error —
 * so this is a question, not an assertion.
 */
export const hasAppwriteConfig = env.VITE_APPWRITE_PROJECT_ID !== ''

export const isDevelopment = import.meta.env.DEV
export const isProduction = import.meta.env.PROD
