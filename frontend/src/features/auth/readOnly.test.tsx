import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/authContext'
import { EntriesPage } from '@/pages/office/EntriesPage'
import { PaymentsPage } from '@/pages/office/PaymentsPage'

/**
 * The read-only office bearer — the Cultural Secretary and the Game Secretary.
 *
 * They can open every screen in the office area and press none of the buttons. The
 * server is what enforces that; this file covers the courtesy layer, which matters for
 * a different reason: an officer shown a button that always fails concludes the site is
 * broken and telephones the treasurer about it.
 *
 * So each test asserts two things together — the figures are **there**, and the control
 * is **not**. Half of that on its own would pass while the feature was wrong: hiding
 * everything would also hide the buttons, and it would be useless.
 *
 * The flag is `canRecordFinance`. `isFinanceOfficer` stays true for these roles, because
 * that is the one that opens the door.
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

function renderAs(ui: React.ReactElement, user: Record<string, unknown>) {
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

const CULTURAL_SECRETARY = {
  uid: 'u-cultural',
  name: 'Cultural Secretary',
  role: 'culturalSecretary',
  isFinanceOfficer: true,
  canRecordFinance: false,
}

const TREASURER = {
  uid: 'u-treasurer',
  name: 'Treasurer',
  role: 'treasurer',
  isFinanceOfficer: true,
  canRecordFinance: true,
}

const PENDING_ENTRY = {
  id: 'txn-1',
  reference: 'TXN-2026-000001',
  status: 'pending',
  kind: 'expense',
  amountPaise: 250_000,
  occurredOn: '2026-07-04',
  description: 'Pandal lighting',
  fundName: 'Cash box',
  categoryName: 'Puja expenses',
  enteredByName: 'Secretary',
  createdBy: 'u-secretary',
  approvals: [],
  approvalsRequired: 1,
}

const PENDING_PAYMENT = {
  id: 'pay-1',
  reference: 'REF-2026-000001',
  status: 'pending_verification',
  memberUid: 'u-member',
  memberName: 'Ordinary Member',
  purpose: 'membership',
  method: 'upi',
  amountPaise: 50_000,
  paidOn: '2026-06-10',
  periodStart: '2026-06',
  periodEnd: '2026-06',
  externalReference: '4471829930',
  submittedAt: '2026-06-10T09:00:00.000Z',
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    const path = String(url)
    if (path.includes('/finance/transactions')) {
      return Promise.resolve(json({ transactions: [PENDING_ENTRY] }))
    }
    if (path.includes('/finance/funds')) return Promise.resolve(json({ funds: [] }))
    if (path.includes('/finance/categories')) return Promise.resolve(json({ categories: [] }))
    return Promise.resolve(json({ payments: [PENDING_PAYMENT] }))
  })
})

describe('the entries screen', () => {
  it('shows the club’s entries to a read-only officer', async () => {
    renderAs(<EntriesPage />, CULTURAL_SECRETARY)

    expect(await screen.findByText('Pandal lighting')).toBeInTheDocument()
    // The sign and the figure share one element, so match the figure inside it.
    expect(screen.getByText(/2,500\.00/)).toBeInTheDocument()
  })

  it('gives them nothing to press, and says why once', async () => {
    renderAs(<EntriesPage />, CULTURAL_SECRETARY)

    await screen.findByText('Pandal lighting')

    expect(screen.queryByRole('button', { name: /record an entry/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve and post/i })).not.toBeInTheDocument()
    // Exact, because 'Rejected' is also the name of a filter tab, which stays.
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    expect(screen.getByText(/see the club’s accounts but not change them/i)).toBeInTheDocument()
  })

  it('leaves the treasurer’s own buttons alone', async () => {
    renderAs(<EntriesPage />, TREASURER)

    // The entry has to arrive first; the heading's button is there before it does.
    await screen.findByText('Pandal lighting')

    expect(screen.getByRole('button', { name: /record an entry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve and post/i })).toBeInTheDocument()
    expect(
      screen.queryByText(/see the club’s accounts but not change them/i)
    ).not.toBeInTheDocument()
  })
})

describe('the members’ payments queue', () => {
  it('shows a read-only officer the payment but not the verify button', async () => {
    renderAs(<PaymentsPage />, CULTURAL_SECRETARY)

    expect(await screen.findByText('Ordinary Member')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verify this payment/i })).not.toBeInTheDocument()
    expect(screen.getByText(/see the club’s accounts but not change them/i)).toBeInTheDocument()
  })

  it('still offers the button to an officer who may record', async () => {
    renderAs(<PaymentsPage />, TREASURER)

    expect(
      await screen.findByRole('button', { name: /verify this payment/i })
    ).toBeInTheDocument()
  })
})

describe('an older API that has not learned the new flag', () => {
  /**
   * During a deploy a newer browser talks to the old function for a few minutes, and it
   * sends `isFinanceOfficer` alone. Reading that as read-only would take the treasurer's
   * buttons away mid-deploy, which looks exactly like the site breaking.
   */
  it('treats a finance officer as able to record', async () => {
    const older = { uid: 'u-t', name: 'Treasurer', role: 'treasurer', isFinanceOfficer: true }

    renderAs(<EntriesPage />, older)
    await screen.findByText('Pandal lighting')

    expect(screen.getByRole('button', { name: /record an entry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve and post/i })).toBeInTheDocument()
  })
})
