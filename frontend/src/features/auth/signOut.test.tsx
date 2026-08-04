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

function renderAuth() {
  let auth: ReturnType<typeof useAuth> | undefined
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

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
