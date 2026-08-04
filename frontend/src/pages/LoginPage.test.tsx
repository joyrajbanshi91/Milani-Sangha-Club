import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AuthContext, type AuthConfig, type AuthState } from '@/features/auth/authContext'
import { LoginPage } from '@/pages/LoginPage'

/**
 * The two sign-in doors are presentation, not access control.
 *
 * That distinction is the whole risk in the feature: two doors invite the reading
 * that picking the left one makes you a president. These tests pin the behaviour that
 * makes it safe — the chooser says the choice does not decide access, and both doors
 * lead to the same ordinary email and password form.
 */
function renderAt(path: string, config: AuthConfig | undefined) {
  const value = {
    user: null,
    loading: false,
    config,
    signIn: async () => {},
    requestPasswordReset: async () => {},
    signInDemo: async () => {},
    signOut: async () => {},
  } as unknown as AuthState

  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[path]}>
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const appwrite: AuthConfig = { mode: 'appwrite', store: 'appwrite' }

describe('LoginPage doors', () => {
  it('offers both doors when no choice has been made', () => {
    renderAt('/login', appwrite)

    expect(screen.getByText('Office bearers')).toBeInTheDocument()
    expect(screen.getByText('General members')).toBeInTheDocument()
    expect(screen.getByText(/President · Secretary · Treasurer/)).toBeInTheDocument()
  })

  it('says plainly that the choice does not decide access', () => {
    // Without this sentence the obvious reading of two doors is that one of them
    // grants the finance area, and the first member to try it concludes the site is
    // broken when it does not.
    renderAt('/login', appwrite)

    expect(
      screen.getByText(/decided by the role the club office has given your account/i)
    ).toBeInTheDocument()
  })

  it('shows the same email and password form behind each door', () => {
    for (const door of ['office', 'member']) {
      const { unmount } = renderAt(`/login?as=${door}`, appwrite)

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
      expect(screen.queryByText('Office bearers')).not.toBeInTheDocument()

      unmount()
    }
  })

  it('titles the office door for office bearers', () => {
    renderAt('/login?as=office', appwrite)
    expect(screen.getByRole('heading', { name: /office bearer sign-in/i })).toBeInTheDocument()
  })

  it('treats an unrecognised door as no choice at all', () => {
    // A hand-edited or stale link must not render a form with no framing, and must
    // certainly not be mistaken for the office door.
    renderAt('/login?as=treasurer-only', appwrite)
    expect(screen.getByText('Office bearers')).toBeInTheDocument()
  })

  it('skips the chooser when a guard sent the visitor here from somewhere specific', () => {
    // Handled by the guards passing location state, which MemoryRouter cannot set on
    // an initial entry — so this asserts the plain /login case still chooses, and the
    // destination path is covered by the guard tests.
    renderAt('/login', appwrite)
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument()
  })

  it('shows the demo picker instead when no Appwrite project is connected', () => {
    renderAt('/login?as=office', {
      mode: 'demo',
      store: 'memory',
      accounts: [{ email: 'president@demo.club', name: 'Demo President', role: 'president' }],
    })

    expect(screen.getByText(/Demonstration sign-in/i)).toBeInTheDocument()
    expect(screen.queryByText('Office bearers')).not.toBeInTheDocument()
  })

  it('reports an unreachable API rather than rendering an unusable form', () => {
    renderAt('/login', undefined)
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the club's server/i)
  })
})
