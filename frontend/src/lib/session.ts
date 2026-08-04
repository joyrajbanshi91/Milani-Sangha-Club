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
 * Replace how the token is obtained. Called once, when the auth mode is known.
 */
export function setTokenProvider(next: TokenProvider): void {
  provider = next
}

/** What the API client calls before every request. */
export function resolveToken(): Promise<string | null> {
  return provider()
}
