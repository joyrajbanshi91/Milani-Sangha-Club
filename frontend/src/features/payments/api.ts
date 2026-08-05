import type {
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
  Role,
} from '@/config/constants'
import { api } from '@/lib/api'
import type { Transaction } from '@/features/finance/api'
import { env } from '@/config/env'

/**
 * A member's declaration that they have paid the club something.
 *
 * Mirrors `Payment` in backend/src/domain/types.ts. Note what it is not: a ledger
 * entry. Until an officer verifies it, this is one member's claim and appears in no
 * balance anywhere.
 */
export interface Payment {
  id: string
  reference: string
  status: PaymentStatus

  memberUid: string
  memberName: string

  purpose: PaymentPurpose
  method: PaymentMethod
  amountPaise: number
  paidOn: string

  /** 'YYYY-MM', inclusive. Membership only. */
  periodStart?: string
  periodEnd?: string

  externalReference?: string
  handedTo?: string
  note?: string

  submittedAt: string

  reviewedAt?: string
  reviewedBy?: string
  reviewedByName?: string
  declineReason?: string

  transactionId?: string
  transactionReference?: string

  /** 'RCT-2026-000042'. Exists only once an officer has verified the payment. */
  receiptNumber?: string

  withdrawnAt?: string
}

export interface PaymentSubmission {
  purpose: PaymentPurpose
  method: PaymentMethod
  /** Rupees as the member typed them. The server converts to exact paise. */
  amount: string
  paidOn: string
  periodStart?: string
  periodEnd?: string
  externalReference?: string
  handedTo?: string
  note?: string
}

/** One box in the member's twelve-month year. Mirrors domain/membership.ts. */
export interface MonthStatus {
  month: string
  label: string
  short: string
  paid: boolean
  /** The month has begun and is unpaid — money the club is owed now. */
  overdue: boolean
  paymentId?: string
  paymentReference?: string
  receiptNumber?: string
}

export interface MembershipStatus {
  financialYear: string
  label: string
  months: MonthStatus[]

  monthsPaid: number
  monthsUnpaid: number
  monthsOverdue: number

  paidPaise: number
  outstandingPaise: number
  overduePaise: number

  paidInFull: boolean
  nothingPaid: boolean
}

export interface Dues {
  monthlyPaise: number
  yearlyPaise: number
}

/** One line of the officers' membership roster. */
export interface MemberRegisterRow {
  uid: string
  name: string
  email: string
  role: Role
  /** The account is gone; their money is not. Nothing about them is overdue. */
  former: boolean
  membership: MembershipStatus
  awaitingVerification: number
}

export interface Roster {
  members: MemberRegisterRow[]
  financialYear: string
  dues: Dues
  totals: {
    members: number
    paidInFull: number
    nothingPaid: number
    overduePaise: number
    outstandingPaise: number
    awaitingVerification: number
  }
}

/**
 * The member's own half. Every path is `/members/me/…`, which is the point: there
 * is no endpoint that takes somebody else's id, so a member cannot read or change
 * another member's payments by editing a URL.
 */
export const memberPaymentsApi = {
  list: () => api.get<{ payments: Payment[] }>('/members/me/payments'),

  membership: (year?: string) =>
    api.get<{ membership: MembershipStatus; dues: Dues }>(
      `/members/me/membership${year ? `?year=${year}` : ''}`
    ),

  submit: (body: PaymentSubmission) =>
    api.post<{ payment: Payment; message: string }>('/members/me/payments', body),

  withdraw: (id: string) =>
    api.post<{ payment: Payment; message: string }>(`/members/me/payments/${id}/withdraw`, {}),
}

/** The officers' half. Refused to a member by the API, whatever the browser shows. */
export const officePaymentsApi = {
  queue: (status: PaymentStatus | 'all' = 'pending_verification') =>
    api.get<{ payments: Payment[] }>(`/finance/payments?status=${status}`),

  roster: (year?: string) => api.get<Roster>(`/finance/members${year ? `?year=${year}` : ''}`),

  record: (id: string, body: { fundId: string; categoryId: string; note?: string }) =>
    api.post<{ payment: Payment; transaction: Transaction; message: string }>(
      `/finance/payments/${id}/record`,
      body
    ),

  decline: (id: string, reason: string) =>
    api.post<{ payment: Payment; message: string }>(`/finance/payments/${id}/decline`, { reason }),
}

/**
 * Download a receipt.
 *
 * Fetched with the bearer token rather than opened as a plain link, because a link
 * cannot carry an Authorization header and the endpoint refuses anonymous requests —
 * which it must, since a receipt names a member and what they paid.
 *
 * `scope` picks the route, not the permission: 'mine' is scoped to the caller's own
 * uid by the server, and 'office' is refused to anyone who is not an officer.
 */
export async function downloadReceipt(
  paymentId: string,
  scope: 'mine' | 'office' = 'mine'
): Promise<void> {
  const { resolveToken } = await import('@/lib/session')
  const { ApiError } = await import('@/lib/apiError')

  const path =
    scope === 'mine'
      ? `/members/me/payments/${paymentId}/receipt.pdf`
      : `/finance/payments/${paymentId}/receipt.pdf`

  const token = await resolveToken()
  const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    // The server's own words: "not verified yet" is a different thing from "no such
    // payment", and a member reading a generic failure would ask the wrong question.
    const body: unknown = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : null

    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      'That receipt could not be downloaded.'

    throw new ApiError(message, response.status)
  }

  saveBlob(
    await response.blob(),
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'receipt.pdf'
  )
}

/** Hand a fetched blob to the browser as an ordinary download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** How each status should read to the person looking at it. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_verification: 'Awaiting verification',
  approved: 'Verified',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
}

export const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending_verification: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-ink-100 text-ink-600',
}

export const PAYMENT_PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  membership: 'Membership',
  donation: 'Donation',
  event: 'Event',
  other: 'Other',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank: 'Bank transfer',
}
