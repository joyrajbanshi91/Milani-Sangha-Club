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
 *   • **firebase** — the Firebase SDK holds the session. We register a token
 *     provider that asks it for a fresh ID token per request, and watch
 *     `onAuthStateChanged` so a sign-in, a sign-out or a restored session all
 *     refresh the user.
 *   • **demo** — an opaque token from the backend, held in sessionStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const firebaseReady = useRef(false)

  const config = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<AuthConfig>('/auth/config', { anonymous: true }),
    staleTime: Infinity,
    retry: 1,
  })

  const mode = config.data?.mode

  /**
   * In Firebase mode, point the API client at the SDK and follow the session.
   *
   * The Firebase modules are imported lazily so a visitor who only reads the
   * public website never downloads the SDK.
   */
  useEffect(() => {
    if (mode !== 'firebase' || firebaseReady.current) return
    firebaseReady.current = true

    let unsubscribe: (() => void) | undefined

    void (async () => {
      const [{ auth }, { onAuthStateChanged }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/auth'),
      ])

      // getIdToken() returns the cached token and refreshes it when it is close
      // to expiring, so long sessions do not break an hour in.
      setTokenProvider(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null))

      unsubscribe = onAuthStateChanged(auth, () => {
        void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      })
    })()

    return () => unsubscribe?.()
  }, [mode, queryClient])

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

  /** Firebase email and password sign-in. */
  const signIn = useCallback(
    async (email: string, password: string) => {
      const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/auth'),
      ])

      try {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } catch (error) {
        // `cause` keeps the original Firebase error for the console.
        throw new Error(describeFirebaseError(error), { cause: error })
      }

      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    [queryClient]
  )

  const requestPasswordReset = useCallback(async (email: string) => {
    const [{ auth }, { sendPasswordResetEmail }] = await Promise.all([
      import('@/lib/firebase'),
      import('firebase/auth'),
    ])

    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch (error) {
      // `auth/user-not-found` is deliberately swallowed: telling a stranger which
      // addresses have accounts is an information leak, and the member sees the
      // same confirmation either way.
      const code = (error as { code?: string } | null)?.code
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') {
        // `cause` keeps the original Firebase error for the console.
        throw new Error(describeFirebaseError(error), { cause: error })
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
    if (mode === 'firebase') {
      const [{ auth }, { signOut: firebaseSignOut }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/auth'),
      ])
      await firebaseSignOut(auth)
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
 * Turn a Firebase error code into something a member can act on.
 *
 * Wrong email and wrong password give the same message on purpose — distinguishing
 * them tells an attacker which addresses are registered.
 */
function describeFirebaseError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? ''

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact the club office.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Those details did not match. Check your email and password, or reset it below.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection.'
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not enabled on the Firebase project yet.'
    default:
      return 'Sign-in failed. Please try again.'
  }
}
