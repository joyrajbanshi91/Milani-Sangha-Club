import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DemoDataNotice } from '@/components/layout/DemoDataNotice'
import { AuthContext, type AuthConfig, type AuthState } from '@/features/auth/authContext'

/**
 * This banner is a safety mechanism, not decoration, so it is worth a test.
 *
 * The API used to refuse to start without database credentials, so that a club could
 * never mistake a demo ledger for its own accounts. That guard also meant a fresh
 * deployment answered 500 from every route and could not be looked at, so it was
 * removed — and this banner is what took over the job. If it silently stops
 * rendering, a treasurer can enter a month of real figures into a store that
 * discards them, and nothing else in the application would say so.
 *
 * The negative cases matter as much as the positive one: a banner that appears over a
 * real ledger teaches people to ignore it.
 */
function renderWithStore(store: AuthConfig['store'] | undefined, hasConfig = true) {
  const value = {
    user: null,
    loading: false,
    config: hasConfig ? ({ mode: 'demo', store } satisfies AuthConfig) : undefined,
    signIn: async () => {},
    requestPasswordReset: async () => {},
    signInDemo: async () => {},
    signOut: async () => {},
  } as unknown as AuthState

  return render(
    <AuthContext.Provider value={value}>
      <DemoDataNotice />
    </AuthContext.Provider>
  )
}

const bannerText = /sample data/i

describe('DemoDataNotice', () => {
  it('warns when the API reports the in-memory store', () => {
    renderWithStore('memory')

    expect(screen.getByRole('status')).toHaveTextContent(bannerText)
    expect(screen.getByRole('status')).toHaveTextContent(/nothing is saved/i)
  })

  it('stays hidden against a real Appwrite ledger', () => {
    renderWithStore('appwrite')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stays hidden while the config request is still in flight', () => {
    // A network hiccup must not make a real ledger look like a demo one, so only an
    // explicit 'memory' shows the banner — never the absence of an answer.
    renderWithStore(undefined, false)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stays hidden when the API is too old to report a store', () => {
    renderWithStore(undefined)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers no way to dismiss it', () => {
    // Deliberate: a banner dismissed in the morning is not protecting anyone in the
    // afternoon. Contrast DraftContentNotice, which is dismissible by design.
    renderWithStore('memory')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
