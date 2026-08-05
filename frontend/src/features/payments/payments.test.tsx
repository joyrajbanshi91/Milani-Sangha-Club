import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/authContext'
import type { MembershipStatus, Payment } from '@/features/payments/api'
import { MembersPage } from '@/pages/office/MembersPage'
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
 * The officers' membership register.
 *
 * The screen a committee meets over, so what it must never do is quietly omit a
 * member. A roster built from the payments table would leave out exactly the people
 * who have paid nothing — the rows the meeting is about.
 */
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
