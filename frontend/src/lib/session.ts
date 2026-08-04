/**
 * The bearer token for API calls.
 *
 * Two very different things can supply it, so the API client asks a *provider*
 * rather than reading storage directly:
 *
 *   • **Demo mode** — an opaque session token the backend issued, kept in
 *     `sessionStorage`.
 *   • **Appwrite mode** — a short-lived JWT minted from the Appwrite session. This
 *     matters: those last fifteen minutes, and `getJwt()` re-mints one that is
 *     close to expiring. Holding a single token for a whole visit would mean the
 *     treasurer being signed out mid-entry, a quarter of an hour after signing in.
 *
 * `sessionStorage`, not `localStorage`: cleared when the tab closes, so a shared
 * computer does not leave the club's accounts signed in.
 */

const KEY = 'milani.session'

type TokenProvider = () => Promise<string | null>

let cached: string | null = null

/** Demo mode: read the stored opaque token. */
export function getToken(): string | null {
  if (cached) return cached
  try {
    cached = sessionStorage.getItem(KEY)
  } catch {
    // Private browsing can throw on storage access; treat as signed out.
    cached = null
  }
  return cached
}

export function setToken(token: string | null): void {
  cached = token
  try {
    if (token) sessionStorage.setItem(KEY, token)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Non-fatal: the token stays in memory for this page view.
  }
}

/** Default provider: the demo session token. */
let provider: TokenProvider = () => Promise.resolve(getToken())

/**
 * Replace how the token is obtained. Called when the auth mode is known, and again
 * after each sign-in — see `resetTokenProvider` for why "once" was not enough.
 */
export function setTokenProvider(next: TokenProvider): void {
  provider = next
}

/**
 * Put the default provider back: read the opaque token from `sessionStorage`.
 *
 * Used on sign-out instead of installing a provider that always answers null. That
 * looked equivalent and was not: replacing the provider with a permanent null left the
 * app unable to authenticate *ever again*, because the code that installs the Appwrite
 * provider runs once behind a ref guard and `mode` never changes to re-trigger it. The
 * symptom was a member signing out, signing back in successfully, and the page simply
 * re-rendering the sign-in form — every request after the new session went out with no
 * Authorization header at all.
 *
 * The default is safe as a resting state because it reads storage that sign-out has
 * just emptied, so it answers null until something is stored again — without poisoning
 * the module for the rest of the page's life.
 */
export function resetTokenProvider(): void {
  provider = () => Promise.resolve(getToken())
}

/** What the API client calls before every request. */
export function resolveToken(): Promise<string | null> {
  return provider()
}
