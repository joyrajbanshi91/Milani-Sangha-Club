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
 * Built on first use, not at import.
 *
 * This module is imported lazily, and only when the API has reported that it is in
 * Appwrite mode. But the two halves are configured separately — the project id here
 * is a build-time `VITE_` value, while the API's credentials are set on the function
 * — so they can disagree: an API pointed at Appwrite against a bundle built without
 * a project id. Constructing the client at import time would make that mismatch
 * surface as an opaque Appwrite network error. Named here instead, once, with the
 * variable to set.
 */
let client: Client | undefined
let accountService: Account | undefined

function getClient(): Client {
  if (!hasAppwriteConfig) {
    throw new Error(
      'The API is using Appwrite for sign-in, but this build has no Appwrite project ' +
        'id, so the browser cannot reach it. Set VITE_APPWRITE_PROJECT_ID in the ' +
        'Netlify dashboard and redeploy — it is compiled into the bundle, so editing ' +
        'it does not update a site that is already published. See docs/09-netlify.md.'
    )
  }

  client ??= new Client()
    .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
    .setProject(env.VITE_APPWRITE_PROJECT_ID)

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
