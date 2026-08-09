import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/authContext'
import type { MembershipStatus, Payment } from '@/features/payments/api'
import { MembersPage } from '@/pages/office/MembersPage'
import { OfficeDashboardPage } from '@/pages/office/OfficeDashboardPage'
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
    periodStart: '2026-06',
    periodEnd: '2026-06',
    externalReference: '4471829930',
    submittedAt: '2026-06-10T09:00:00.000Z',
    ...overrides,
  }
}

/** A membership register with the given months paid. */
function register(paidMonths: string[] = []): MembershipStatus {
  const months = Array.from({ length: 12 }, (_, index) => {
    const absolute = 3 + index
    const month = `${2026 + Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`
    const paid = paidMonths.includes(month)

    return {
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      short: month,
      paid,
      overdue: !paid && month <= '2026-08',
      ...(paid ? { receiptNumber: 'RCT-2026-000001' } : {}),
    }
  })

  const paid = months.filter((month) => month.paid).length

  return {
    financialYear: '2026-27',
    label: 'April 2026 to March 2027',
    months,
    monthsPaid: paid,
    monthsUnpaid: 12 - paid,
    monthsOverdue: months.filter((month) => month.overdue).length,
    paidPaise: paid * 5_000,
    outstandingPaise: (12 - paid) * 5_000,
    overduePaise: months.filter((month) => month.overdue).length * 5_000,
    paidInFull: paid === 12,
    nothingPaid: paid === 0,
  }
}

const DUES = { monthlyPaise: 5_000, yearlyPaise: 60_000 }

/** Answers the endpoints every portal render needs, so tests only mock what they test. */
function portalDefaults(paidMonths: string[] = []) {
  return (url: string): Response | null => {
    if (url.includes('/members/me/membership')) {
      return json({ membership: register(paidMonths), dues: DUES })
    }
    if (url.includes('/members/me/payments')) return json({ payments: [] })
    if (url.includes('/members/me')) return json({ profile: null })
    return null
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
      return Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.type(await screen.findByLabelText(/UPI transaction ID/i), '4471829930')
    await userEvent.click(screen.getByRole('button', { name: /send for verification/i }))

    const posted = await waitFor(() => {
      const found = calls().find(
        (call) => call.method === 'POST' && call.url.includes('/members/me/payments')
      )
      expect(found).toBeDefined()
      return found
    })

    /**
     * The months travel with the payment, and the amount is derived from them.
     *
     * A member who has paid nothing is offered their first unpaid month — April —
     * priced at the club's monthly rate. There is no amount field to type into for
     * membership: the server refuses a figure that does not match the months, so
     * letting them type one could only ever produce a rejected form.
     */
    expect(posted?.body).toMatchObject({
      purpose: 'membership',
      method: 'upi',
      periodStart: '2026-04',
      periodEnd: '2026-04',
      amount: '50.00',
      externalReference: '4471829930',
    })
  })

  it('prices the whole remaining year at the yearly rate, without asking for a figure', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/members/me/payments') && init?.method === 'POST') {
        return Promise.resolve(json({ payment: payment(), message: 'Sent.' }, 201))
      }
      return Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    // Wait for the register before touching the form: the months on offer come from
    // it, so choosing "the rest of the year" before it arrives chooses nothing.
    await screen.findByText('0 of 12 months paid')

    // Nothing paid, so "the rest of the year" is all twelve months — ₹600, the yearly
    // rate rather than twelve times the monthly one.
    await userEvent.click(screen.getByRole('button', { name: /The rest of the year/ }))

    // The figure in the "Amount to pay" panel, not the rate sentence elsewhere on the
    // page — that one also says ₹600.00 and would make this pass without the select.
    const panel = screen.getByText('Amount to pay').parentElement as HTMLElement
    expect(panel.textContent).toContain('₹600.00')
    expect(panel.textContent).toContain('12 months')

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
      periodStart: '2026-04',
      periodEnd: '2027-03',
      amount: '600.00',
    })
  })

  it('offers the first month the member has not paid, not the first of the year', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults(['2026-04', '2026-05'])(String(url)) ?? json({}))
    )

    renderWith(<MemberPortalPage />, MEMBER)

    // April and May are paid, so the next one to offer is June — and it is already
    // selected, so a member who just wants to pay this month can submit at once.
    expect(await screen.findByRole('button', { name: /Next month — June 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /June 2026 — selected/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('lets the member click months, and prices the run as they go', async () => {
    // The bug this replaced: choosing particular months left the amount at ₹0.00 and
    // the submit button disabled, because the month inputs started empty.
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    )

    renderWith(<MemberPortalPage />, MEMBER)
    await screen.findByText('0 of 12 months paid')

    const panel = () => screen.getByText('Amount to pay').parentElement as HTMLElement

    // One click: one month.
    await userEvent.click(screen.getByRole('button', { name: /June 2026 — click to select/ }))
    expect(panel().textContent).toContain('₹50.00')
    expect(panel().textContent).toContain('1 month')

    // A second click extends the run.
    await userEvent.click(screen.getByRole('button', { name: /August 2026 — click to select/ }))
    expect(panel().textContent).toContain('₹150.00')
    expect(panel().textContent).toContain('June 2026 to August 2026')

    expect(screen.getByRole('button', { name: /send for verification/i })).toBeEnabled()
  })

  it('extends backwards too, so the order of the two clicks does not matter', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    )

    renderWith(<MemberPortalPage />, MEMBER)
    await screen.findByText('0 of 12 months paid')

    await userEvent.click(screen.getByRole('button', { name: /August 2026 — click to select/ }))
    await userEvent.click(screen.getByRole('button', { name: /June 2026 — click to select/ }))

    const panel = screen.getByText('Amount to pay').parentElement as HTMLElement
    expect(panel.textContent).toContain('June 2026 to August 2026')
    expect(panel.textContent).toContain('₹150.00')
  })

  it('will not let a run cross a month that is already paid', async () => {
    // The server refuses it; saying so at the month is better than a rejected form.
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults(['2026-06'])(String(url)) ?? json({}))
    )

    renderWith(<MemberPortalPage />, MEMBER)
    await screen.findByText('1 of 12 months paid')

    // June is paid, so it cannot be clicked at all.
    expect(screen.getByRole('button', { name: /June 2026 — already paid/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /May 2026 — click to select/ }))
    await userEvent.click(screen.getByRole('button', { name: /July 2026 — click to select/ }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((node) => node.textContent).join(' ')).toMatch(/June 2026 is already paid/)
    expect(screen.getByRole('button', { name: /send for verification/i })).toBeDisabled()
  })

  it('asks for a typed amount for a donation, which has no months', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    )

    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.selectOptions(await screen.findByLabelText(/what was it for/i), 'donation')

    expect(screen.getByLabelText(/amount paid/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/which months/i)).not.toBeInTheDocument()
  })

  it('shows the member which months they have paid and what is left', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults(['2026-04', '2026-05', '2026-06'])(String(url)) ?? json({}))
    )

    renderWith(<MemberPortalPage />, MEMBER)

    expect(await screen.findByText('3 of 12 months paid')).toBeInTheDocument()
    // "How many months are left" is stated as both the count and what it costs.
    expect(screen.getByText(/9 months left, costing ₹450.00/)).toBeInTheDocument()
  })

  it('asks who took the cash instead of a transaction id', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    )
    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.click(screen.getByRole('button', { name: /In cash/i }))

    expect(screen.getByLabelText(/given to/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/UPI transaction ID/i)).not.toBeInTheDocument()
  })

  it('shows the member what happened to each declaration', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/members/me/payments')) {
        return Promise.resolve(
          json({
            payments: [
              payment({
                id: 'pay-2',
                status: 'approved',
                reviewedByName: 'Treasurer',
                receiptNumber: 'RCT-2026-000007',
              }),
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
      }
      return Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('Not accepted')).toBeInTheDocument()
    expect(screen.getByText(/reached the club account/)).toBeInTheDocument()

    // Verified is the only status that promises a receipt, because it is the only one
    // where a receipt exists — and the button to fetch it is offered with it.
    expect(screen.getByText(/receipt is ready to download/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download receipt/i })).toBeInTheDocument()
    expect(screen.getByText('RCT-2026-000007')).toBeInTheDocument()

    // The declined one gets no receipt button at all.
    expect(screen.getAllByRole('button', { name: /download receipt/i })).toHaveLength(1)
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
      return Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    await userEvent.type(await screen.findByLabelText(/UPI transaction ID/i), '4471829930')
    await userEvent.click(screen.getByRole('button', { name: /send for verification/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((node) => node.textContent).join(' ')).toMatch(
      /already declared this payment/i
    )
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

/**
 * Recording a payment for a member who cannot use the app.
 *
 * The club has members with an account they have never signed into who pay in cash at
 * the club as they always have. The tests here are mostly about the way it could go
 * wrong: this is the one route where an *officer* is the maker of a payment, and the
 * two-person rule has to hold on it just as firmly as everywhere else.
 */
describe('recording a payment for a member', () => {
  const ROSTER = {
    members: [
      {
        uid: 'u-member',
        name: 'Ordinary Member',
        email: 'member@example.org',
        role: 'member',
        former: false,
        membership: register(),
        awaitingVerification: 0,
      },
      {
        // The officer using the form. Must not be offered to themselves.
        uid: 'u-treasurer',
        name: 'Treasurer',
        email: 'treasurer@example.org',
        role: 'treasurer',
        former: false,
        membership: register(),
        awaitingVerification: 0,
      },
      {
        // Gone from the club. Their money stays in the books; new money does not.
        uid: 'u-former',
        name: 'Former Member',
        email: 'former@example.org',
        role: 'member',
        former: true,
        membership: register(),
        awaitingVerification: 0,
      },
    ],
    financialYear: '2026-27',
    dues: DUES,
    totals: {
      members: 3,
      paidInFull: 0,
      nothingPaid: 3,
      overduePaise: 0,
      outstandingPaise: 0,
      awaitingVerification: 0,
    },
  }

  function officeDefaults(url: string): Response | null {
    if (url.includes('/finance/members')) return json(ROSTER)
    if (url.includes('/finance/payments')) return json({ payments: [] })
    return null
  }

  it('posts against the chosen member, with the months and the computed amount', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.includes('/finance/payments') && init?.method === 'POST') {
        return Promise.resolve(
          json({ payment: payment({ recordedOnBehalf: true }), message: 'Recorded.' }, 201)
        )
      }
      return Promise.resolve(officeDefaults(path) ?? json({}))
    })

    renderWith(<PaymentsPage />, TREASURER)

    await userEvent.click(
      await screen.findByRole('button', { name: /record a payment for a member/i })
    )
    await userEvent.selectOptions(await screen.findByLabelText(/which member/i), 'u-member')
    await userEvent.click(screen.getByRole('button', { name: /record it/i }))

    const posted = await waitFor(() => {
      const found = calls().find(
        (call) => call.method === 'POST' && call.url.includes('/finance/payments')
      )
      expect(found).toBeDefined()
      return found
    })

    /**
     * The member's uid travels with it, and the amount is derived from the months
     * exactly as on the member's own form — the server refuses a subscription whose
     * amount does not match its months, so a typed figure could only be rejected.
     */
    expect(posted?.body).toMatchObject({
      memberUid: 'u-member',
      purpose: 'membership',
      method: 'cash',
      periodStart: '2026-04',
      periodEnd: '2026-04',
      amount: '50.00',
      // Cash has to name who took it, and the officer entering it is the honest
      // default — they are the one holding the money.
      handedTo: 'Treasurer',
    })
  })

  it('does not offer the officer themselves, or anybody who has left', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(officeDefaults(String(url)) ?? json({}))
    )

    renderWith(<PaymentsPage />, TREASURER)
    await userEvent.click(
      await screen.findByRole('button', { name: /record a payment for a member/i })
    )

    const select = await screen.findByLabelText(/which member/i)
    const names = Array.from(select.querySelectorAll('option')).map((option) => option.textContent)

    // Their own name, because the server refuses it — an officer declares their own
    // subscription on their own page. A former member, because the club has no more
    // subscriptions to take from them.
    expect(names.join(' ')).toContain('Ordinary Member')
    expect(names.join(' ')).not.toContain('Treasurer')
    expect(names.join(' ')).not.toContain('Former Member')
  })

  it('says up front that somebody else has to accept it', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(officeDefaults(String(url)) ?? json({}))
    )

    renderWith(<PaymentsPage />, TREASURER)
    await userEvent.click(
      await screen.findByRole('button', { name: /record a payment for a member/i })
    )

    // Before the form, not after a refusal. An officer who expects a receipt to appear
    // and gets a queue entry instead concludes the software is broken.
    expect(await screen.findByText(/another office bearer must accept it/i)).toBeInTheDocument()
  })

  it('refuses the officer who recorded it the Verify button', async () => {
    // The self-check on `memberUid` cannot catch this: the payment belongs to the
    // member. Without the check on `recordedBy`, the treasurer would be both maker and
    // checker and the money would post on one signature.
    fetchMock.mockImplementation((url: string) => {
      const path = String(url)
      if (path.includes('/finance/members')) return Promise.resolve(json(ROSTER))
      return Promise.resolve(
        json({
          payments: [
            payment({
              recordedOnBehalf: true,
              recordedBy: TREASURER.uid,
              recordedByName: TREASURER.name,
            }),
          ],
        })
      )
    })

    renderWith(<PaymentsPage />, TREASURER)

    expect(await screen.findByText(/you recorded this for ordinary member/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verify this payment/i })).not.toBeInTheDocument()
  })

  it('lets a different officer accept it, and marks it as recorded for the member', async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url)
      if (path.includes('/finance/members')) return Promise.resolve(json(ROSTER))
      return Promise.resolve(
        json({
          payments: [
            payment({
              recordedOnBehalf: true,
              recordedBy: 'u-secretary',
              recordedByName: 'Secretary',
            }),
          ],
        })
      )
    })

    renderWith(<PaymentsPage />, TREASURER)

    // The badge is not decoration: it is what tells the bearer about to accept this
    // that the member did not send it in, which is what decides whether they may.
    expect(await screen.findByText(/recorded for the member/i)).toBeInTheDocument()
    expect(screen.getByText('Secretary')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify this payment/i })).toBeInTheDocument()
  })

  it('explains itself on the member’s own page', async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url)
      if (path.includes('/members/me/payments')) {
        return Promise.resolve(
          json({
            payments: [
              payment({
                recordedOnBehalf: true,
                recordedBy: 'u-treasurer',
                recordedByName: 'Treasurer',
              }),
            ],
          })
        )
      }
      return Promise.resolve(portalDefaults()(path) ?? json({}))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    // Somebody signing in for the first time in a year must not find a payment they
    // never made and have no way to explain it — or to know who to ask about it.
    expect(await screen.findByText(/entered for you at the club by treasurer/i)).toBeInTheDocument()
  })
})

/**
 * The officers' membership register.
 *
 * The screen a committee meets over, so what it must never do is quietly omit a
 * member. A roster built from the payments table would leave out exactly the people
 * who have paid nothing — the rows the meeting is about.
 */
describe('the member’s own verification code', () => {
  it('is shown beside their payment, so they can answer “is this genuine?”', async () => {
    // Printed on the receipt and shown here, because the commonest thing a member does
    // with a receipt is photograph it and send it on.
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/members/me/payments')) {
        return Promise.resolve(
          json({ payments: [payment({ securityCode: 'PMV49WED9A' })] })
        )
      }
      return Promise.resolve(portalDefaults()(String(url)) ?? json({}))
    })

    renderWith(<MemberPortalPage />, MEMBER)

    // Grouped for reading down a telephone, and stored ungrouped.
    expect(await screen.findByText('PMV4-9WED-9A')).toBeInTheDocument()
  })
})

/**
 * The code that makes a receipt checkable.
 *
 * The club raised the problem: every reference this system issues is sequential, so
 * anybody holding one genuine receipt knows roughly where the counter is and can put a
 * plausible number on a document the club never issued. The security code cannot be
 * guessed, and this is the screen where an officer uses it.
 */
describe('checking a receipt’s verification code', () => {
  it('finds the payment behind a genuine code, and shows what to compare', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/payments/verify')) {
        return Promise.resolve(
          json({
            payment: payment({ securityCode: 'PMV49WED9A', receiptNumber: 'RCT-2026-000004' }),
            message: 'Issued to Ordinary Member on 2026-06-10.',
          })
        )
      }
      return Promise.resolve(json({ payments: [] }))
    })

    renderWith(<PaymentsPage />, TREASURER)

    await userEvent.click(
      await screen.findByRole('button', { name: /check a receipt.s verification code/i })
    )
    await userEvent.type(screen.getByLabelText(/verification code/i), 'pmv4-9wed-9a')
    await userEvent.click(screen.getByRole('button', { name: /^check$/i }))

    expect(await screen.findByText(/in the club's records/i)).toBeInTheDocument()
    // The figures to compare against the paper, not merely a green tick: a genuine
    // code beside a different amount is the forgery worth catching.
    expect(screen.getByText('₹500.00')).toBeInTheDocument()
    expect(screen.getByText('RCT-2026-000004')).toBeInTheDocument()

    // Typed with hyphens and in lower case; the server is asked for it as typed and
    // normalises — the browser must not silently drop what the officer entered.
    expect(calls().some((call) => call.url.includes('/payments/verify?code='))).toBe(true)
  })

  it('says plainly when no receipt carries that code', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/payments/verify')) {
        return Promise.resolve(
          json({ payment: null, message: 'No receipt in the club’s records carries that code.' })
        )
      }
      return Promise.resolve(json({ payments: [] }))
    })

    renderWith(<PaymentsPage />, TREASURER)

    await userEvent.click(
      await screen.findByRole('button', { name: /check a receipt.s verification code/i })
    )
    await userEvent.type(screen.getByLabelText(/verification code/i), 'ZZZZ9999ZZ')
    await userEvent.click(screen.getByRole('button', { name: /^check$/i }))

    expect(await screen.findByText(/no receipt in the club/i)).toBeInTheDocument()
  })
})

describe('the membership register', () => {
  function roster(rows: Array<{ name: string; email: string; paid: string[]; role?: string }>) {
    const members = rows.map((row, index) => ({
      uid: `u-${index}`,
      name: row.name,
      email: row.email,
      role: row.role ?? 'member',
      membership: register(row.paid),
      awaitingVerification: 0,
    }))

    return {
      members: [...members].sort(
        (a, b) => b.membership.monthsOverdue - a.membership.monthsOverdue
      ),
      financialYear: '2026-27',
      dues: DUES,
      totals: {
        members: members.length,
        paidInFull: members.filter((row) => row.membership.paidInFull).length,
        nothingPaid: members.filter((row) => row.membership.nothingPaid).length,
        overduePaise: members.reduce((sum, row) => sum + row.membership.overduePaise, 0),
        outstandingPaise: members.reduce((sum, row) => sum + row.membership.outstandingPaise, 0),
        awaitingVerification: 0,
      },
    }
  }

  const ROWS = [
    { name: 'Bristi Ghosh', email: 'bristi@example.org', paid: [] as string[] },
    {
      name: 'Ashoke Banerjee',
      email: 'ashoke@example.org',
      paid: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
      role: 'president',
    },
  ]

  it('lists every member with their months paid and what is left', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(roster(ROWS))))

    renderWith(<MembersPage />, TREASURER)

    expect(await screen.findByText('Bristi Ghosh')).toBeInTheDocument()
    expect(screen.getByText('Ashoke Banerjee')).toBeInTheDocument()

    // Months paid out of twelve, for each of them.
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('₹350.00 left')).toBeInTheDocument()
    expect(screen.getByText('₹600.00 left')).toBeInTheDocument()
  })

  it('flags who is overdue, and puts them first', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(roster(ROWS))))

    renderWith(<MembersPage />, TREASURER)

    expect(await screen.findByText('5 months overdue')).toBeInTheDocument()

    // Bristi has paid nothing, so she is above the president who is up to date.
    const names = screen.getAllByText(/Bristi Ghosh|Ashoke Banerjee/).map((node) => node.textContent)
    expect(names[0]).toBe('Bristi Ghosh')
  })

  it('can be narrowed to the members still owing something', async () => {
    const paidUp = [
      ROWS[0] as { name: string; email: string; paid: string[] },
      {
        name: 'Ratna Das',
        email: 'ratna@example.org',
        paid: register([]).months.map((month) => month.month),
      },
    ]

    fetchMock.mockImplementation(() => Promise.resolve(json(roster(paidUp))))

    renderWith(<MembersPage />, TREASURER)

    expect(await screen.findByText('Ratna Das')).toBeInTheDocument()
    // 'nothing due' rather than the 'Paid in full' badge: that phrase is also the
    // filter button's label, so it matches twice.
    expect(screen.getByText('nothing due')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Still owing' }))

    expect(screen.getByText('Bristi Ghosh')).toBeInTheDocument()
    expect(screen.queryByText('Ratna Das')).not.toBeInTheDocument()
  })

  it('finds a member by name without asking the server again', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(roster(ROWS))))

    renderWith(<MembersPage />, TREASURER)
    await screen.findByText('Bristi Ghosh')

    const before = fetchMock.mock.calls.length
    await userEvent.type(screen.getByLabelText(/find a member/i), 'ashoke')

    expect(screen.getByText('Ashoke Banerjee')).toBeInTheDocument()
    expect(screen.queryByText('Bristi Ghosh')).not.toBeInTheDocument()
    // Filtering is local: a search box that refetched on every keystroke would put
    // one request per character on a club's free-tier database.
    expect(fetchMock.mock.calls.length).toBe(before)
  })

  it('reports an unreachable API rather than an empty register', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ error: { message: 'nope' } }, 500)))

    renderWith(<MembersPage />, TREASURER)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
  })
})

/**
 * The period control on the officer screens.
 *
 * Two bugs and one omission are covered here.
 *
 * `<input type="month">` looked obvious and was the bug: Safari does not support it, so
 * it renders as a text box, the first character typed becomes the value, and the
 * request goes out as `?month=2`. The API correctly refuses a malformed month and the
 * dashboard said "Is the API running?" while the API was running perfectly. Two selects
 * cannot produce a value the server will reject.
 *
 * The omission was that a month was *all* the dashboard could show. A committee asking
 * how the year went had to open twelve screens and add up on paper, so the whole club
 * year is now what it opens on, with a month a click away.
 */
describe('choosing the period on the dashboard', () => {
  function dashboard(month: string) {
    return {
      period: { from: `${month}-01`, to: `${month}-28` },
      totalFundsPaise: 100_000,
      fundBalances: [],
      totals: {
        incomePaise: 0,
        expensePaise: 0,
        netPaise: 0,
        transferPaise: 0,
        transactionCount: 0,
      },
      incomeByCategory: [],
      expenseByCategory: [],
      incomeBySource: [],
      expenseBySource: [],
      monthly: [],
      pending: [],
      recent: [],
      overdrawnFunds: [],
      openingNeededFor: null,
    }
  }

  function answer(url: string): Response {
    if (url.includes('/finance/dashboard')) {
      // A whole year goes as a date range, which is all a year is.
      if (url.includes('from=')) return json(dashboard('2026-08'))

      const month = /month=([\d-]+)/.exec(url)?.[1] ?? '2026-08'
      // The real API refuses anything that is not YYYY-MM, so the mock does too — a
      // test that accepted rubbish could not catch the bug this replaced.
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return json({ error: { code: 'bad_request', message: 'month must be in the format YYYY-MM' } }, 400)
      }
      return json(dashboard(month))
    }
    if (url.includes('/finance/payments')) return json({ payments: [] })
    return json({})
  }

  it('opens on the whole club year, so the year’s figures need no adding up', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(answer(String(url))))

    renderWith(<OfficeDashboardPage />, TREASURER)
    await screen.findByText('Club finances')

    // 1 April to 31 March, asked for as a range.
    await waitFor(() => {
      expect(
        calls().some(
          (call) =>
            call.url.includes('/finance/dashboard') &&
            call.url.includes('from=2026-04-01') &&
            call.url.includes('to=2027-03-31')
        )
      ).toBe(true)
    })
  })

  it('offers the whole year and whole months by name, so a bad value cannot be sent', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(answer(String(url))))

    renderWith(<OfficeDashboardPage />, TREASURER)
    await screen.findByText('Club finances')

    // A club year and what to show of it, not a free-text date field.
    expect(screen.getByLabelText(/club year/i)).toBeInTheDocument()
    const showing = screen.getByLabelText(/^showing$/i)
    expect(showing.tagName).toBe('SELECT')

    // The whole year first, then every real month of it.
    const names = Array.from(showing.querySelectorAll('option')).map((node) => node.textContent)
    expect(names).toHaveLength(13)
    expect(names[0]).toBe('The whole year (2026-27)')
    expect(names[1]).toBe('April 2026')
    expect(names[12]).toBe('March 2027')
  })

  it('reloads the figures for the month chosen, without an error', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(answer(String(url))))

    renderWith(<OfficeDashboardPage />, TREASURER)
    await screen.findByText('Club finances')

    await userEvent.selectOptions(screen.getByLabelText(/^showing$/i), '2026-06')

    await waitFor(() => {
      expect(
        calls().some((call) => call.url.includes('month=2026-06'))
      ).toBe(true)
    })

    // The figures are there, not the failure message.
    expect(await screen.findByText('Club finances')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('goes back to the whole year, and says which twelve months that is', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(answer(String(url))))

    renderWith(<OfficeDashboardPage />, TREASURER)
    await screen.findByText('Club finances')

    await userEvent.selectOptions(screen.getByLabelText(/^showing$/i), '2026-06')
    await userEvent.selectOptions(screen.getByLabelText(/^showing$/i), 'year')

    // The club's year is not the calendar's, so the months it covers are spelled out.
    expect(await screen.findByText(/April 2026 – March 2027/)).toBeInTheDocument()
  })

  it('never offers a year the club has no books for', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(answer(String(url))))

    renderWith(<OfficeDashboardPage />, TREASURER)
    await screen.findByText('Club finances')

    const years = Array.from(
      screen.getByLabelText(/club year/i).querySelectorAll('option')
    ).map((node) => node.textContent)

    expect(years).toContain('2026-27')
    expect(years).not.toContain('2024-25')
    expect(years).not.toContain('2027-28')
  })

  it('says what the server said, rather than blaming the server', async () => {
    // The old message sent the club looking for a broken API when the API had simply
    // refused a bad request.
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/finance/dashboard')) {
        return Promise.resolve(
          json({ error: { code: 'bad_request', message: 'month must be in the format YYYY-MM' } }, 400)
        )
      }
      return Promise.resolve(json({}))
    })

    renderWith(<OfficeDashboardPage />, TREASURER)

    expect(await screen.findByRole('alert')).toHaveTextContent(/month must be in the format/i)
  })
})
