import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/authContext'
import type { Payment } from '@/features/payments/api'
import { PaymentsPage } from '@/pages/office/PaymentsPage'
import { MemberPortalPage } from '@/pages/portal/MemberPortalPage'

/**
 * The member payment flow, from both ends.
 *
 * The single most important thing here is that the member's form **stores
 * something**. It shipped for a while as a shell that validated, showed the
 * intended sequence and threw the input away — the sort of screen that looks
 * finished, so nobody notices until a member asks where their money went. The first
 * test therefore asserts the POST, not the confirmation text.
 *
 * The second is that the officer screen refuses to let somebody verify their own
 * payment before they try, because the server refuses it afterwards and an
 * unexplained failure at the end of a filled-in form is how a treasurer concludes
 * the software is broken.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

/** A JSON response, shaped the way lib/api.ts expects to read one. */
function json(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    reference: 'REF-2026-000001',
    status: 'pending_verification',
    memberUid: 'u-member',
    memberName: 'Ordinary Member',
    purpose: 'membership',
    method: 'upi',
    amountPaise: 50_000,
    paidOn: '2026-06-10',
    externalReference: '4471829930',
    submittedAt: '2026-06-10T09:00:00.000Z',
    ...overrides,
  }
}

function renderWith(
  ui: React.ReactElement,
  user: { uid: string; name: string; role: string; isFinanceOfficer: boolean }
) {
  const value = {
    user,
    loading: false,
    config: { mode: 'appwrite', store: 'appwrite' },
    signIn: async () => null,
    signOut: async () => {},
    requestPasswordReset: async () => {},
    signInDemo: async () => {},
  } as unknown as AuthState

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={value}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const MEMBER = { uid: 'u-member', name: 'Ordinary Member', role: 'member', isFinanceOfficer: false }
const TREASURER = { uid: 'u-treasurer', name: 'Treasurer', role: 'treasurer', isFinanceOfficer: true }

/** Every request the page under test makes, in order. */
function calls(): Array<{ url: string; method: string; body: unknown }> {
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

describe('the member’s payment form', () => {
  it('really sends the payment, rather than only saying it would', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/members/me/payments') && init?.method === 'POST') {
        return Promise.resolve(
          json({ payment: payment(), message: 'Sent to the office bearers. REF-2026-000001' }, 201)
        )
      }
      return Promise.resolve(json({ payments: [], profile: null }))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.type(screen.getByLabelText(/amount paid/i), '500')
    await userEvent.type(screen.getByLabelText(/UPI transaction ID/i), '4471829930')
    await userEvent.click(screen.getByRole('button', { name: /send for verification/i }))

    const posted = await waitFor(() => {
      const found = calls().find(
        (call) => call.method === 'POST' && call.url.includes('/members/me/payments')
      )
      expect(found).toBeDefined()
      return found
    })

    expect(posted?.body).toMatchObject({
      purpose: 'membership',
      method: 'upi',
      amount: '500',
      externalReference: '4471829930',
    })
  })

  it('asks who took the cash instead of a transaction id', async () => {
    fetchMock.mockResolvedValue(json({ payments: [] }))
    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.click(screen.getByRole('button', { name: /In cash/i }))

    expect(screen.getByLabelText(/given to/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/UPI transaction ID/i)).not.toBeInTheDocument()
  })

  it('shows the member what happened to each declaration', async () => {
    fetchMock.mockResolvedValue(
      json({
        payments: [
          payment({ id: 'pay-2', status: 'approved', reviewedByName: 'Treasurer' }),
          payment({
            id: 'pay-3',
            reference: 'REF-2026-000003',
            status: 'rejected',
            reviewedByName: 'Treasurer',
            declineReason: 'No payment with that ID reached the club account.',
          }),
        ],
      })
    )

    renderWith(<MemberPortalPage />, MEMBER)

    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('Not accepted')).toBeInTheDocument()
    expect(screen.getByText(/reached the club account/)).toBeInTheDocument()
    // "Verified" must not be allowed to read as "receipted": the ledger entry it
    // created is still waiting for a second officer.
    expect(screen.getByText(/second officer has approved/i)).toBeInTheDocument()
  })

  it('reports the server’s refusal rather than pretending it worked', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/members/me/payments') && init?.method === 'POST') {
        return Promise.resolve(
          json(
            {
              error: {
                code: 'duplicate',
                message: 'You have already declared this payment (REF-2026-000001).',
              },
            },
            409
          )
        )
      }
      return Promise.resolve(json({ payments: [] }))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.type(screen.getByLabelText(/amount paid/i), '500')
    await userEvent.type(screen.getByLabelText(/UPI transaction ID/i), '4471829930')
    await userEvent.click(screen.getByRole('button', { name: /send for verification/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already declared this payment/i)
  })
})

describe('the officers’ queue', () => {
  it('shows what the officer has to match the payment against', async () => {
    fetchMock.mockResolvedValue(json({ payments: [payment({ note: 'Paid for my brother too' })] }))

    renderWith(<PaymentsPage />, TREASURER)

    expect(await screen.findByText('Ordinary Member')).toBeInTheDocument()
    expect(screen.getByText('4471829930')).toBeInTheDocument()
    expect(screen.getByText(/Paid for my brother too/)).toBeInTheDocument()
    expect(screen.getByText('₹500.00')).toBeInTheDocument()
  })

  /**
   * The rule the feature turns on, shown before the officer wastes a form on it.
   * The server refuses this too — this is the layer that explains why.
   */
  it('refuses to let an officer verify their own payment, and says why', async () => {
    fetchMock.mockResolvedValue(
      json({
        payments: [payment({ memberUid: TREASURER.uid, memberName: TREASURER.name })],
      })
    )

    renderWith(<PaymentsPage />, TREASURER)

    expect(await screen.findByText(/another officer must verify it/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verify this payment/i })).not.toBeInTheDocument()
  })

  it('will not record anything without a fund and a category', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/finance/funds')) {
        return Promise.resolve(json({ funds: [] }))
      }
      if (String(url).includes('/finance/categories')) {
        return Promise.resolve(json({ categories: [] }))
      }
      return Promise.resolve(json({ payments: [payment()] }))
    })

    renderWith(<PaymentsPage />, TREASURER)

    await userEvent.click(await screen.findByRole('button', { name: /verify this payment/i }))

    expect(await screen.findByText(/no funds set up yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter in the books/i })).toBeDisabled()
  })

  it('records against the chosen fund and category, and says a second officer is needed', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url)

      if (path.includes('/finance/funds')) {
        return Promise.resolve(
          json({
            funds: [
              { id: 'fund-cash', name: 'Cash box', kind: 'cash', active: true },
              { id: 'fund-bank', name: 'Bank account', kind: 'bank', active: true },
            ],
          })
        )
      }
      if (path.includes('/finance/categories')) {
        return Promise.resolve(
          json({
            categories: [
              { id: 'cat-fees', name: 'Membership fees', kind: 'income', active: true },
              // An expense category must not be offered: a member's payment is
              // money coming in, so this could only ever file it wrongly.
              { id: 'cat-ground', name: 'Ground maintenance', kind: 'expense', active: true },
            ],
          })
        )
      }
      if (path.includes('/record') && init?.method === 'POST') {
        return Promise.resolve(
          json(
            {
              payment: payment({ status: 'approved' }),
              transaction: { id: 'txn-9', reference: 'TXN-2026-000009', status: 'pending' },
              message:
                'Verified and entered as TXN-2026-000009. It needs a second officer’s approval before it affects any balance.',
            },
            201
          )
        )
      }
      return Promise.resolve(json({ payments: [payment()] }))
    })

    renderWith(<PaymentsPage />, TREASURER)

    await userEvent.click(await screen.findByRole('button', { name: /verify this payment/i }))

    const category = await screen.findByLabelText(/category/i)
    expect(screen.queryByRole('option', { name: 'Ground maintenance' })).not.toBeInTheDocument()

    await userEvent.selectOptions(await screen.findByLabelText(/which fund/i), 'fund-bank')
    await userEvent.selectOptions(category, 'cat-fees')
    await userEvent.click(screen.getByRole('button', { name: /enter in the books/i }))

    const recorded = await waitFor(() => {
      const found = calls().find((call) => call.method === 'POST' && call.url.includes('/record'))
      expect(found).toBeDefined()
      return found
    })

    expect(recorded?.body).toMatchObject({ fundId: 'fund-bank', categoryId: 'cat-fees' })
    expect(await screen.findByRole('status')).toHaveTextContent(/needs a second officer/i)
  })
})
