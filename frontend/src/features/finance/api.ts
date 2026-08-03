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
 * Download the PDF statement.
 *
 * Fetched with the bearer token rather than opened as a plain link, because a
 * link cannot carry the Authorization header and the endpoint refuses anonymous
 * requests. The blob is handed to the browser as a normal download.
 */
export async function downloadStatementPdf(params: {
  month?: string
  from?: string
  to?: string
}): Promise<void> {
  const { resolveToken } = await import('@/lib/session')
  const { env } = await import('@/config/env')

  const token = await resolveToken()
  const response = await fetch(`${env.VITE_API_BASE_URL}/reports/period.pdf${toQuery(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) throw new Error('The statement could not be generated.')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download =
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
    'statement.pdf'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
