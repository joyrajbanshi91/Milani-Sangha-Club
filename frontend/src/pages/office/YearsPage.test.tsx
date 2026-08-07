import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthState } from '@/features/auth/authContext'
import type { CarryForwardSuggestion, Fund, YearOpening } from '@/features/finance/api'
import { YearsPage } from '@/pages/office/YearsPage'

/**
 * Club years, from the treasurer's side.
 *
 * This page exists because the club could not find the year end. It was a panel at the
 * foot of the statements page which, for eleven months of every twelve, said only that
 * there was nothing to do — so "where do I start the new year with its opening balance"
 * had no answer on screen.
 *
 * These assert the three things an office bearer came for: that a year the club could
 * start is offered, that a year it cannot start yet says when and shows the figure
 * building up towards it, and that closing a year does not hide it.
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

const FUNDS: Fund[] = [
  {
    id: 'fund-cash',
    name: 'Cash box',
    kind: 'cash',
    openingBalancePaise: 0,
    openingDate: '2026-04-01',
    active: true,
  },
  {
    id: 'fund-bank',
    name: 'Bank account',
    kind: 'bank',
    openingBalancePaise: 0,
    openingDate: '2026-04-01',
    active: true,
  },
]

function opening(overrides: Partial<YearOpening> = {}): YearOpening {
  return {
    id: 'open-1',
    financialYear: '2027-28',
    balances: { 'fund-cash': 250_00, 'fund-bank': 1_750_00 },
    suggestedTotalPaise: 2_000_00,
    note: 'Adopted at the AGM on 12 April',
    createdAt: '2027-04-12T09:00:00.000Z',
    createdBy: 'u-treasurer',
    createdByName: 'Treasurer',
    ...overrides,
  }
}

function suggestion(overrides: Partial<CarryForwardSuggestion> = {}): CarryForwardSuggestion {
  return {
    financialYear: '2027-28',
    fromYear: '2026-27',
    period: { from: '2026-04-01', to: '2027-03-31' },
    openingTotalPaise: 0,
    totals: {
      incomePaise: 500_00,
      expensePaise: 120_00,
      netPaise: 380_00,
      transferPaise: 0,
      transactionCount: 9,
    },
    balances: [
      {
        fundId: 'fund-cash',
        fundName: 'Cash box',
        kind: 'cash',
        openingBalancePaise: 0,
        inPaise: 200_00,
        outPaise: 120_00,
        balancePaise: 80_00,
      },
      {
        fundId: 'fund-bank',
        fundName: 'Bank account',
        kind: 'bank',
        openingBalancePaise: 0,
        inPaise: 300_00,
        outPaise: 0,
        balancePaise: 300_00,
      },
    ],
    totalPaise: 380_00,
    pendingCount: 0,
    ...overrides,
  }
}

/** Answer the two requests the page makes: the openings, and the fund names. */
function serve(years: YearOpening[]) {
  fetchMock.mockImplementation((input: string) => {
    const url = String(input)

    if (url.includes('/finance/funds')) return Promise.resolve(json({ funds: FUNDS }))
    if (url.includes('/finance/years')) {
      return Promise.resolve(
        json({ years, ...(url.includes('suggestFor=') ? { suggestion: suggestion() } : {}) })
      )
    }
    return Promise.resolve(json({}))
  })
}

/** The treasurer, unless a test says otherwise. Starting a year is their job. */
const TREASURER = {
  uid: 'u-treasurer',
  name: 'Treasurer',
  role: 'treasurer',
  isFinanceOfficer: true,
  canRecordFinance: true,
}

function renderPage(user: Record<string, unknown> = TREASURER) {
  const auth = {
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
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <YearsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-05T09:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('starting a new club year', () => {
  it('says when the next year can be started, and what would carry into it', async () => {
    // The club's first year is under way, so nothing can be opened: opening 2027-28
    // would close 2026-27 and freeze the books the club is still writing in. The
    // treasurer must still be able to see where the opening balance gets declared.
    serve([])
    renderPage()

    expect(await screen.findByText(/can be started from/i)).toHaveTextContent('1 April 2027')
    expect(await screen.findByText(/Would carry into 2027-28/i)).toBeInTheDocument()
    expect(await screen.findByText('₹380.00')).toBeInTheDocument()

    // Per fund, because a club starts its year with a cash box and a bank account
    // rather than with a single number.
    expect(await screen.findByText(/Cash box ₹80.00 · Bank account ₹300.00/)).toBeInTheDocument()
  })

  it('offers the year to start once the calendar has turned', async () => {
    vi.setSystemTime(new Date('2027-05-01T09:00:00.000Z'))
    serve([])
    renderPage()

    const choose = await screen.findByLabelText(/summarise a year and start the next/i)
    expect(Array.from(choose.querySelectorAll('option')).map((node) => node.textContent)).toContain(
      'Start 2027-28 (closing 2026-27)'
    )
  })
})

describe('a read-only officer', () => {
  /**
   * The cultural and game secretaries see the club's years. Closing one adopts figures
   * and settles the books, which is not something they are here to do — so the chooser
   * is replaced by the sentence that says so, and Reopen is not offered either.
   */
  const CULTURAL_SECRETARY = {
    uid: 'u-cultural',
    name: 'Cultural Secretary',
    role: 'culturalSecretary',
    isFinanceOfficer: true,
    canRecordFinance: false,
  }

  it('reads the years and cannot start or reopen one', async () => {
    vi.setSystemTime(new Date('2027-05-01T09:00:00.000Z'))
    serve([opening()])
    renderPage(CULTURAL_SECRETARY)

    expect(await screen.findByText('2026-27')).toBeInTheDocument()
    expect(await screen.findByText(/Opened with ₹2,000.00/)).toBeInTheDocument()

    expect(
      screen.queryByLabelText(/summarise a year and start the next/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reopen/i })).not.toBeInTheDocument()
    expect(screen.getByText(/see the club’s accounts but not change them/i)).toBeInTheDocument()
  })
})

describe('the years the club has kept', () => {
  it('keeps a closed year readable, with what it opened with and who adopted it', async () => {
    vi.setSystemTime(new Date('2027-05-01T09:00:00.000Z'))
    serve([opening()])
    renderPage()

    // Both years are listed — closing 2026-27 settles it, it does not archive it.
    expect(await screen.findByText('2026-27')).toBeInTheDocument()
    expect(await screen.findByText(/Opened with ₹2,000.00/)).toBeInTheDocument()
    expect(await screen.findByText(/Adopted by Treasurer/)).toBeInTheDocument()
    expect(await screen.findByText(/Cash box ₹250.00 · Bank account ₹1,750.00/)).toBeInTheDocument()
    expect(await screen.findByText('Adopted at the AGM on 12 April')).toBeInTheDocument()

    // And every year, opened or not, leads to its own figures in full.
    const links = await screen.findAllByRole('link', { name: /see the whole year/i })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/office?year=2027-28', '/office?year=2026-27'])
    )
  })

  it('marks the year the club is in, and the one that is settled', async () => {
    vi.setSystemTime(new Date('2027-05-01T09:00:00.000Z'))
    serve([opening()])
    renderPage()

    expect(await screen.findByText('This year')).toBeInTheDocument()
    expect(await screen.findByText('Closed')).toBeInTheDocument()
  })
})
