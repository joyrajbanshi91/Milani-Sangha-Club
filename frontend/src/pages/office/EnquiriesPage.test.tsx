import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/authContext'
import type { Enquiry } from '@/features/enquiries/api'
import { EnquiriesPage, EnquiriesWaiting } from '@/pages/office/EnquiriesPage'

/**
 * The club's enquiries, on the office's side.
 *
 * Two of these cover bugs the club found within minutes of the feature going live, and
 * both were mine:
 *
 *   • The **Enquiries** menu item showed the finance dashboard, because the route was
 *     never added and `/office/enquiries` fell through to the catch-all. Guarded now by
 *     app/router.test.ts, which checks every menu entry has a route.
 *   • Clicking the **notification** on the dashboard landed on the sign-in page, because
 *     it was a plain `<a href>`: a full page load, and the officer guard runs before the
 *     session has been re-established. The test below clicks it and expects to arrive.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function json(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function enquiry(overrides: Partial<Enquiry> = {}): Enquiry {
  return {
    id: 'enq-1',
    reference: 'ENQ-2026-000001',
    status: 'new',
    name: 'Bristi Ghosh',
    email: 'bristi@example.org',
    subject: 'Joining the club',
    message: 'I live on Station Road and would like to know how to become a member.',
    receivedAt: '2026-08-05T09:00:00.000Z',
    ...overrides,
  }
}

const SECRETARY = { uid: 'u-sec', name: 'Ratna Das', role: 'secretary', isFinanceOfficer: true }
const TREASURER = { uid: 'u-tre', name: 'Debabrata Roy', role: 'treasurer', isFinanceOfficer: true }

function renderWith(ui: React.ReactElement, user: typeof SECRETARY, path = '/office/enquiries') {
  const value = { user, loading: false, config: { mode: 'appwrite', store: 'appwrite' } } as unknown as AuthState

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

function calls() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: String((init as RequestInit | undefined)?.method ?? 'GET'),
    body: (init as RequestInit | undefined)?.body
      ? JSON.parse(String((init as RequestInit).body))
      : undefined,
  }))
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('the notification on the dashboard', () => {
  it('goes to the enquiries page rather than reloading the application', async () => {
    /**
     * The bug this replaces: a plain `<a href>` reloaded the whole app, the session was
     * still being re-established when the officer guard ran, and the club landed on the
     * sign-in page. Arriving at the destination inside the same router proves it is a
     * client-side navigation.
     */
    fetchMock.mockResolvedValue(json({ enquiries: [], counts: { new: 2, resolved: 0 } }))

    renderWith(
      <Routes>
        <Route path="/office" element={<EnquiriesWaiting />} />
        <Route path="/office/enquiries" element={<h1>Enquiries</h1>} />
      </Routes>,
      SECRETARY,
      '/office'
    )

    await userEvent.click(await screen.findByRole('link', { name: /2 enquiries from the website/i }))

    expect(await screen.findByRole('heading', { name: 'Enquiries' })).toBeInTheDocument()
  })

  it('shows nothing at all to a treasurer', () => {
    fetchMock.mockResolvedValue(json({ enquiries: [], counts: { new: 5, resolved: 0 } }))

    renderWith(<EnquiriesWaiting />, TREASURER, '/office')

    // Not merely hidden: the request is never made, because the server would refuse it.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the enquiries page', () => {
  it('shows the message a visitor actually wrote', async () => {
    fetchMock.mockResolvedValue(
      json({ enquiries: [enquiry()], counts: { new: 1, resolved: 0 } })
    )

    renderWith(<EnquiriesPage />, SECRETARY)

    expect(await screen.findByText('Joining the club')).toBeInTheDocument()
    expect(screen.getByText(/Station Road/)).toBeInTheDocument()
    expect(screen.getByText('ENQ-2026-000001')).toBeInTheDocument()

    // Replying is one click, with the reference already in the subject.
    const reply = screen.getByRole('link', { name: /bristi@example\.org/ })
    expect(reply.getAttribute('href')).toContain('mailto:bristi@example.org')
    expect(reply.getAttribute('href')).toContain('ENQ-2026-000001')
  })

  it('records what was done when it is marked dealt with', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(json({ enquiry: enquiry(), message: 'ok' }))
      return Promise.resolve(json({ enquiries: [enquiry()], counts: { new: 1, resolved: 0 } }))
    })

    renderWith(<EnquiriesPage />, SECRETARY)

    await userEvent.click(await screen.findByRole('button', { name: /mark dealt with/i }))
    await userEvent.type(screen.getByLabelText(/what was done/i), 'Rang and explained the fee.')
    await userEvent.click(screen.getByRole('button', { name: /^mark dealt with$/i }))

    const posted = await waitFor(() => {
      const found = calls().find((call) => call.method === 'POST' && call.url.includes('/resolve'))
      expect(found).toBeDefined()
      return found
    })

    // The note is the whole reason this beats a mailbox.
    expect(posted?.body).toMatchObject({ note: 'Rang and explained the fee.' })
  })

  it('tells a treasurer who to ask, rather than showing them the club’s post', async () => {
    renderWith(<EnquiriesPage />, TREASURER)

    expect(await screen.findByText(/kept for the secretary and the president/i)).toBeInTheDocument()
    // And asks the server for nothing, because it would be refused.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
