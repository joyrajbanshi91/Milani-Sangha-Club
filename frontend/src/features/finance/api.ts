import { api } from '@/lib/api'

/** Shapes returned by the finance API. Mirrors backend/src/domain/types.ts. */

export interface Fund {
  id: string
  name: string
  kind: 'cash' | 'bank' | 'upi' | 'other'
  openingBalancePaise: number
  openingDate: string
  active: boolean
}

export interface Category {
  id: string
  name: string
  kind: 'income' | 'expense'
  active: boolean
}

export interface Approval {
  uid: string
  name: string
  role: string
  at: string
  note?: string
}

export interface Transaction {
  id: string
  reference: string
  kind: 'income' | 'expense' | 'transfer'
  status: 'pending' | 'posted' | 'rejected' | 'discarded' | 'reversed'
  date: string
  amountPaise: number
  fundId: string
  toFundId?: string
  categoryId?: string
  source: string
  description: string
  externalReference?: string
  createdBy: string
  createdByName: string
  createdAt: string
  approvals: Approval[]
  postedAt?: string
  rejectionReason?: string
  reverses?: string
  reversedBy?: string
  importBatchId?: string
}

export interface FundBalance {
  fundId: string
  fundName: string
  kind: Fund['kind']
  openingBalancePaise: number
  inPaise: number
  outPaise: number
  balancePaise: number
}

export interface Rollup {
  key: string
  label: string
  amountPaise: number
  sharePercent: number
  count: number
}

export interface Dashboard {
  period: { from: string; to: string }
  totalFundsPaise: number
  fundBalances: FundBalance[]
  totals: {
    incomePaise: number
    expensePaise: number
    netPaise: number
    transferPaise: number
    transactionCount: number
  }
  incomeByCategory: Rollup[]
  expenseByCategory: Rollup[]
  incomeBySource: Rollup[]
  expenseBySource: Rollup[]
  monthly: Array<{ month: string; incomePaise: number; expensePaise: number; netPaise: number }>
  pending: Transaction[]
  recent: Transaction[]
  overdrawnFunds: FundBalance[]
  /**
   * The financial year the club has moved into without saying what it starts with,
   * or null. This is the only thing that makes the year-end panel appear, which is
   * why it comes from the server rather than being worked out from today's date in
   * the browser — a laptop with the wrong clock should not close a club's year.
   */
  openingNeededFor: string | null
}

/** What a financial year was opened with. Mirrors domain/types.ts. */
export interface YearOpening {
  id: string
  financialYear: string
  /** Fund id → paise, as adopted. */
  balances: Record<string, number>
  suggestedTotalPaise: number
  note?: string
  createdAt: string
  createdBy: string
  createdByName: string
}

export interface CarryForwardSuggestion {
  financialYear: string
  /** The year being closed to produce it. */
  fromYear: string
  balances: FundBalance[]
  totalPaise: number
  /** Entries in that year still unapproved, so not in the figures. */
  pendingCount: number
}

export interface PeriodReport extends Omit<Dashboard, 'pending' | 'recent' | 'period'> {
  club: { name: string }
  period: { from: string; to: string; label: string }
  generatedAt: string
  generatedBy: string
  openingBalancePaise: number
  closingBalancePaise: number
  transactions: Transaction[]
  pendingCount: number
  reversalCount: number
}

export interface RowError {
  line: number
  column: string
  value: string
  message: string
}

export const financeApi = {
  dashboard: (params: { month?: string; from?: string; to?: string } = {}) =>
    api.get<Dashboard>(`/finance/dashboard${toQuery(params)}`),

  funds: () => api.get<{ funds: Fund[] }>('/finance/funds'),
  categories: () => api.get<{ categories: Category[] }>('/finance/categories'),

  transactions: (params: { status?: string; from?: string; to?: string; search?: string } = {}) =>
    api.get<{ transactions: Transaction[] }>(`/finance/transactions${toQuery(params)}`),

  createEntry: (body: {
    kind: string
    date: string
    amount: string
    fundId: string
    toFundId?: string
    categoryId?: string
    source: string
    description: string
    externalReference?: string
  }) => api.post<{ transaction: Transaction; message: string }>('/finance/transactions', body),

  approve: (id: string, note?: string) =>
    api.post<{ transaction: Transaction; message: string }>(
      `/finance/transactions/${id}/approve`,
      note ? { note } : {}
    ),

  reject: (id: string, reason: string) =>
    api.post<{ transaction: Transaction; message: string }>(
      `/finance/transactions/${id}/reject`,
      { reason }
    ),

  withdraw: (id: string) =>
    api.post<{ transaction: Transaction; message: string }>(
      `/finance/transactions/${id}/withdraw`,
      {}
    ),

  reverse: (id: string, reason: string) =>
    api.post<{ transaction: Transaction; message: string }>(
      `/finance/transactions/${id}/reverse`,
      { reason }
    ),

  report: (params: { month?: string; from?: string; to?: string }) =>
    api.get<PeriodReport>(`/reports/period${toQuery(params)}`),

  years: (suggestFor?: string) =>
    api.get<{ years: YearOpening[]; suggestion?: CarryForwardSuggestion }>(
      `/finance/years${suggestFor ? `?suggestFor=${suggestFor}` : ''}`
    ),

  openYear: (body: {
    financialYear: string
    /** Fund id → rupees as typed. The server converts to exact paise. */
    balances: Record<string, string>
    note?: string
  }) => api.post<{ year: YearOpening; message: string }>('/finance/years', body),

  reopenYear: (financialYear: string) =>
    api.delete<{ message: string }>(`/finance/years/${financialYear}`),
}

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

/**
 * Which statement to print.
 *
 * **summary** merges every member's subscription into its category, so what goes to
 * a committee meeting is the club's position rather than a page of names.
 * **detailed** lists every entry, for checking the books against the bank.
 */
export type ReportDetail = 'summary' | 'detailed'

/**
 * Download the PDF statement.
 *
 * Fetched with the bearer token rather than opened as a plain link, because a
 * link cannot carry the Authorization header and the endpoint refuses anonymous
 * requests. The server decides the filename — it carries the club, which report,
 * the period and the day it was issued, so two downloads of the same month do not
 * arrive as statement.pdf and statement(1).pdf.
 */
export async function downloadStatementPdf(params: {
  month?: string
  from?: string
  to?: string
  detail?: ReportDetail
}): Promise<void> {
  const { resolveToken } = await import('@/lib/session')
  const { env } = await import('@/config/env')
  const { saveBlob } = await import('@/features/payments/api')

  const token = await resolveToken()
  const response = await fetch(`${env.VITE_API_BASE_URL}/reports/period.pdf${toQuery(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) throw new Error('The statement could not be generated.')

  saveBlob(
    await response.blob(),
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'statement.pdf'
  )
}
