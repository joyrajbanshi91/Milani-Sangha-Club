import { Account, Client } from 'appwrite'

import { env, hasAppwriteConfig } from '@/config/env'

/**
 * Appwrite in the browser — **authentication only**.
 *
 * The Databases client is deliberately not imported. Every figure the app shows
 * comes from the Express API, because the rules that matter cannot be expressed as
 * table permissions: the two-person approval, gapless reference numbers, the audit
 * trail. Giving the browser a database handle would create a second, weaker path to
 * the same data — which is also why `provision-appwrite.ts` creates every table
 * with no permissions at all.
 *
 * If a future feature genuinely needs live client reads — a notice board updating
 * without a refresh, say — import the Databases service in that feature's own
 * module so the cost lands only on the page that uses it.
 */
/**
 * Where Appwrite is, told to us at runtime by the API.
 *
 * `configureAppwrite()` is called by `useAuth` the moment `/auth/config` reports
 * Appwrite mode, before anything here is used. That ordering is what makes the
 * deployment simple: the browser no longer needs an Appwrite project id compiled into
 * it, so there is nothing to set in the Builds scope, nothing to rebuild after
 * changing, and no way for the bundle and the function to disagree about which
 * project they are talking to.
 *
 * A build-time `VITE_` value still wins if one is set, for a local frontend pointed at
 * a different project from whatever API it happens to be talking to.
 */
interface AppwriteTarget {
  endpoint: string
  projectId: string
}

let target: AppwriteTarget | undefined
let client: Client | undefined
let accountService: Account | undefined

export function configureAppwrite(next: AppwriteTarget): void {
  // Ignore an incomplete answer rather than building a client that cannot work.
  if (!next.projectId) return

  // Rebuild if the target actually changed, so a client is never left pointing at a
  // previous project — otherwise a signed-in session could be read from the wrong one.
  if (target && target.endpoint === next.endpoint && target.projectId === next.projectId) {
    return
  }

  target = next
  client = undefined
  accountService = undefined
}

function getClient(): Client {
  // A build that names its own project overrides whatever the API said. Both halves
  // are taken from the same source rather than mixed, so an endpoint can never end up
  // paired with a project id from somewhere else.
  const explicit: AppwriteTarget | undefined = hasAppwriteConfig
    ? { endpoint: env.VITE_APPWRITE_ENDPOINT, projectId: env.VITE_APPWRITE_PROJECT_ID }
    : undefined

  const resolved = explicit ?? target

  if (!resolved) {
    throw new Error(
      'The API reports it is using Appwrite for sign-in, but it did not say which ' +
        'project. Check GET /api/v1/auth/config — it should carry an "appwrite" block ' +
        'with an endpoint and a projectId. See docs/09-netlify.md.'
    )
  }

  client ??= new Client().setEndpoint(resolved.endpoint).setProject(resolved.projectId)

  return client
}

/** The Account service, built on first use. Mirrors `getTables()` on the API side. */
export function getAccount(): Account {
  accountService ??= new Account(getClient())
  return accountService
}

/**
 * A short-lived JWT proving who the caller is, for the API to verify.
 *
 * Appwrite JWTs last fifteen minutes, so one is minted on demand and reused until
 * it is close to expiring. Minting per request would add a round trip to every
 * call; caching it for its full life would sign the treasurer out mid-entry.
 *
 * Deliberately not persisted: it lives in this module for the page's lifetime. The
 * *session* is what Appwrite stores, and a JWT can always be minted again from it.
 */
const JWT_LIFETIME_MS = 15 * 60 * 1000
const REFRESH_MARGIN_MS = 5 * 60 * 1000

let cached: { jwt: string; expiresAt: number } | null = null

export async function getJwt(): Promise<string | null> {
  if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
    return cached.jwt
  }

  try {
    const { jwt } = await getAccount().createJWT()
    cached = { jwt, expiresAt: Date.now() + JWT_LIFETIME_MS }
    return jwt
  } catch {
    // No session, or the session has expired. Signed out is the correct reading:
    // the API will answer 401 and the app will show the sign-in page.
    cached = null
    return null
  }
}

/** Called on sign-out, so the next caller cannot reuse a token for the old member. */
export function clearJwt(): void {
  cached = null
}
