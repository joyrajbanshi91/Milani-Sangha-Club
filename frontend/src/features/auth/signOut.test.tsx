import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/features/auth/useAuth'
import { useAuth } from '@/features/auth/authContext'
import { getToken, resolveToken, setToken } from '@/lib/session'

/**
 * Sign-out must never reject, and must always clear this browser's credentials.
 *
 * The bug these tests exist for: `signOut` awaited a lazily-imported chunk outside any
 * try/catch, so a cache miss or a flaky connection made it throw before doing anything
 * — and the caller's `.then(() => navigate('/login'))` therefore never ran. The button
 * did nothing at all, with no error shown anywhere, and the member stayed signed in.
 *
 * So the contract is: whatever the network does, the promise settles and the local
 * token is gone. Telling the server is best effort on top of that, never a
 * precondition for it.
 */

// Force the Appwrite branch, and make the lazily-imported module fail the way a stale
// service worker or an offline browser makes it fail.
vi.mock('@/lib/appwrite', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

function Harness({ onReady }: { onReady: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth()
  useEffect(() => {
    onReady(auth)
  }, [auth, onReady])
  return null
}

let clientRef: QueryClient | undefined

function renderAuth() {
  let auth: ReturnType<typeof useAuth> | undefined
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clientRef = client

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Harness
          onReady={(value) => {
            auth = value
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  )

  return () => auth
}

describe('signOut', () => {
  beforeEach(() => {
    setToken(null)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('resolves even when the Appwrite module cannot be loaded', async () => {
    const auth = renderAuth()
    setToken('a-stale-demo-token')

    // The assertion is simply that this settles. Before the fix it rejected, and the
    // caller never navigated.
    await act(async () => {
      await expect(auth()?.signOut()).resolves.toBeUndefined()
    })
  })

  it('clears the stored token even when telling the server fails', async () => {
    const auth = renderAuth()
    setToken('a-stale-demo-token')
    expect(getToken()).toBe('a-stale-demo-token')

    await act(async () => {
      await auth()?.signOut()
    })

    expect(getToken()).toBeNull()
  })

  it('does not refetch a mounted finance query, which is what showed a 401 error', async () => {
    /**
     * The bug this reproduces: signing out removed every cached query, and TanStack
     * refetches an *active* query when it is removed. The office dashboard was still
     * mounted, so its figures query went out again with the token already cleared, came
     * back 401, and the page rendered "The figures could not be loaded. Is the API
     * running?" — accusing the API of being down mid-sign-out, while it was fine.
     */
    const auth = renderAuth()
    const client = clientRef!

    let fetches = 0
    const financeQuery = {
      queryKey: ['finance', 'dashboard', '2026-08'],
      queryFn: () => {
        fetches += 1
        return Promise.resolve({ total: 1 })
      },
    }

    // Observe it, which is what a mounted page does.
    const unobserve = client.getQueryCache().subscribe(() => {})
    await client.fetchQuery(financeQuery)
    const observer = client
      .getQueryCache()
      .find({ queryKey: ['finance', 'dashboard', '2026-08'] })
    expect(observer).toBeDefined()
    expect(fetches).toBe(1)

    await act(async () => {
      await auth()?.signOut()
    })

    expect(
      fetches,
      'signing out refetched the figures query, which is what produced the 401 error'
    ).toBe(1)

    unobserve()
  })

  it("removes the SDK's cookieFallback, or the next sign-in is refused", async () => {
    /**
     * The Appwrite web SDK stores its session in localStorage under `cookieFallback`
     * whenever the browser refuses its third-party cookie, and never removes it —
     * `removeItem` appears nowhere in the shipped SDK. Left behind, the browser still
     * presents a session credential and Appwrite refuses the next sign-in with
     * `user_session_already_exists`: "You are already signed in", on the page that has
     * just signed you out.
     *
     * Asserted against the literal key because that is the contract with the SDK. If a
     * future version renames it this test fails, which is the point — otherwise the
     * cleanup would stop working in silence.
     */
    const auth = renderAuth()
    window.localStorage.setItem('cookieFallback', '{"a_session_x":"stale"}')

    await act(async () => {
      await auth()?.signOut()
    })

    expect(window.localStorage.getItem('cookieFallback')).toBeNull()
  })

  it('leaves no way to obtain a token afterwards', async () => {
    // The token *provider* matters as much as the stored token: in Appwrite mode it
    // mints a fresh JWT on demand, so leaving it in place would let the very next
    // request re-authenticate a member who had just signed out.
    const auth = renderAuth()

    await act(async () => {
      await auth()?.signOut()
    })

    await expect(resolveToken()).resolves.toBeNull()
  })
})
