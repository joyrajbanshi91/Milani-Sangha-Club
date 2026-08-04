import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'

import {
  AuthContext,
  type AuthConfig,
  type AuthState,
  type SignedInUser,
} from '@/features/auth/authContext'
import { ApiError, api } from '@/lib/api'
import { getToken, setToken, setTokenProvider } from '@/lib/session'

/**
 * Who is signed in.
 *
 * The user is fetched from `/auth/me` rather than decoded from the token in the
 * browser: the role must come from the server that verified it. A token the client
 * could read and trust is a token the client could edit.
 *
 * Both sign-in modes are handled here, chosen by what the API reports:
 *
 *   • **appwrite** — Appwrite holds the session. We register a token provider that
 *     mints a short-lived JWT for each request (cached, see lib/appwrite.ts).
 *   • **demo** — an opaque token from the backend, held in sessionStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const appwriteReady = useRef(false)

  const config = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/auth/config', { anonymous: true }),
    staleTime: Infinity,
    retry: 1,
  })

  const mode = config.data?.mode
  const appwriteTarget = config.data?.appwrite

  /**
   * In Appwrite mode, point the API client at the SDK.
   *
   * The Appwrite module is imported lazily so a visitor who only reads the public
   * website never downloads the SDK.
   *
   * `configureAppwrite` comes first, and must: it hands the SDK the endpoint and
   * project id the *server* reported, which is what removed the build-time
   * `VITE_APPWRITE_PROJECT_ID` from the deployment. Nothing below can mint a JWT
   * until the client knows which project to mint it against.
   *
   * There is no session listener to register: unlike Firebase, Appwrite has no
   * `onAuthStateChanged`. Every call that changes the session below invalidates the
   * `['auth', 'me']` query itself, which is the same effect with one less moving
   * part — and a restored session is picked up by that query on first load anyway.
   */
  useEffect(() => {
    if (mode !== 'appwrite' || appwriteReady.current) return
    appwriteReady.current = true

    void (async () => {
      const { configureAppwrite, getJwt } = await import('@/lib/appwrite')
      if (appwriteTarget) configureAppwrite(appwriteTarget)
      setTokenProvider(getJwt)
      // The provider was not in place when ['auth','me'] first ran, so that
      // attempt went out unauthenticated. Ask again now that it can be signed.
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    })()
  }, [mode, appwriteTarget, queryClient])

  const me = useQuery({
    queryKey: ['auth', 'me'],
    enabled: mode !== undefined,
    queryFn: async () => {
      // Demo mode can answer without a network call when there is no token.
      if (mode === 'demo' && !getToken()) return null

      try {
        const response = await api.get<{ user: SignedInUser }>('/auth/me')
        return response.user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          if (mode === 'demo') setToken(null)
          return null
        }
        throw error
      }
    },
    retry: false,
  })

  /** Appwrite email and password sign-in. */
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { getAccount, clearJwt } = await import('@/lib/appwrite')

      // A stale JWT from a previous member on a shared computer must not be sent
      // as though it were this one's.
      clearJwt()

      try {
        await getAccount().createEmailPasswordSession({ email: email.trim(), password })
      } catch (error) {
        // `cause` keeps the original Appwrite error for the console.
        throw new Error(describeAppwriteError(error), { cause: error })
      }

      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    [queryClient]
  )

  const requestPasswordReset = useCallback(async (email: string) => {
    const { getAccount } = await import('@/lib/appwrite')

    try {
      await getAccount().createRecovery({
        email: email.trim(),
        // Where the emailed link lands. Appwrite appends the userId and secret it
        // needs, which the reset page reads back.
        url: `${window.location.origin}/reset-password`,
      })
    } catch (error) {
      // A 404 is deliberately swallowed: telling a stranger which addresses have
      // accounts is an information leak, and the member sees the same
      // confirmation either way.
      const status = (error as { code?: number } | null)?.code
      if (status !== 404) {
        // `cause` keeps the original Appwrite error for the console.
        throw new Error(describeAppwriteError(error), { cause: error })
      }
    }
  }, [])

  const signInDemo = useCallback(
    async (email: string) => {
      const response = await api.post<{ token: string; user: SignedInUser }>(
        '/auth/demo-login',
        { email },
        { anonymous: true }
      )
      setToken(response.token)
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    [queryClient]
  )

  const signOut = useCallback(async () => {
    if (mode === 'appwrite') {
      const { getAccount, clearJwt } = await import('@/lib/appwrite')
      try {
        await getAccount().deleteSession({ sessionId: 'current' })
      } catch {
        // An already-expired session is not a failure to sign out.
      }
      clearJwt()
    } else {
      try {
        await api.post('/auth/logout')
      } catch {
        // Signing out locally matters more than telling the server about it.
      }
      setToken(null)
    }

    // Clear every cached query: finance figures must not survive a sign-out.
    queryClient.clear()
  }, [mode, queryClient])

  const value = useMemo<AuthState>(
    () => ({
      user: me.data ?? null,
      loading: config.isLoading || (mode !== undefined && me.isLoading),
      config: config.data,
      signIn,
      requestPasswordReset,
      signInDemo,
      signOut,
    }),
    [
      me.data,
      me.isLoading,
      config.isLoading,
      config.data,
      mode,
      signIn,
      requestPasswordReset,
      signInDemo,
      signOut,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Turn an Appwrite error into something a member can act on.
 *
 * Wrong email and wrong password give the same message on purpose — distinguishing
 * them tells an attacker which addresses are registered. Appwrite helps here: it
 * returns one `user_invalid_credentials` for both.
 */
function describeAppwriteError(error: unknown): string {
  const { type, code } = (error ?? {}) as { type?: string; code?: number }

  switch (type) {
    case 'user_invalid_credentials':
    case 'user_not_found':
      return 'Those details did not match. Check your email and password, or reset it below.'
    case 'user_blocked':
      return 'This account has been disabled. Please contact the club office.'
    case 'user_email_not_whitelisted':
    case 'general_argument_invalid':
      return 'That email address does not look right.'
    case 'user_session_already_exists':
      return 'You are already signed in. Reload the page.'
    default:
      break
  }

  if (code === 429) return 'Too many attempts. Please wait a few minutes and try again.'
  if (code === 401) {
    return 'Those details did not match. Check your email and password, or reset it below.'
  }
  // No code at all is the shape of a network failure rather than a rejection.
  if (code === undefined) return 'Could not reach the sign-in service. Check your connection.'

  return 'Sign-in failed. Please try again.'
}
