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

  /**
   * Set when an officer entered this for a member who cannot use the app.
   *
   * It is still the member's payment — their uid, their months, their receipt. What
   * this records is that an officer, not the member, is the one who put it forward,
   * which is why a *different* officer has to accept it. Shown wherever the payment
   * appears, including on the member's own page: somebody who does eventually sign in
   * must not find a payment they never declared with no explanation of where it
   * came from.
   */
  recordedOnBehalf?: boolean
  recordedBy?: string
  recordedByName?: string
  recordedByRole?: Role

  submittedAt: string

  reviewedAt?: string
  reviewedBy?: string
  reviewedByName?: string
  declineReason?: string

  transactionId?: string
  transactionReference?: string

  /** 'RCT-2026-000042'. Exists only once an officer has verified the payment. */
  receiptNumber?: string

  /**
   * The unguessable code printed on the receipt, e.g. '4K7P2WQ9XB'.
   *
   * The reference number is sequential and therefore guessable: anybody holding one
   * genuine receipt can write a plausible number on a document the club never issued.
   * This code cannot be guessed, so the office can confirm a receipt is theirs.
   */
  securityCode?: string

  withdrawnAt?: string
}

/**
 * What an officer sends when recording a payment for a member.
 *
 * The member's own submission plus the one thing it cannot carry: whose payment it is.
 * Everything else the server decides — the reference, the status, the security code,
 * and who recorded it, which comes from the officer's token and never from here.
 */
export interface OnBehalfSubmission extends PaymentSubmission {
  memberUid: string
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

  /**
   * Record a payment for a member who cannot use the app.
   *
   * It joins the same queue as a member's own declaration, so the money's route into
   * the books is unchanged — only who may accept it. The officer who calls this cannot
   * be the one who verifies it, and the server refuses them if they try.
   */
  recordFor: (body: OnBehalfSubmission) =>
    api.post<{ payment: Payment; message: string }>('/finance/payments', body),

  record: (id: string, body: { fundId: string; categoryId: string; note?: string }) =>
    api.post<{ payment: Payment; transaction: Transaction; message: string }>(
      `/finance/payments/${id}/record`,
      body
    ),

  decline: (id: string, reason: string) =>
    api.post<{ payment: Payment; message: string }>(`/finance/payments/${id}/decline`, { reason }),

  /**
   * Is this receipt the club's?
   *
   * `payment` is null for a code the club has no record of, which is an answer rather
   * than an error — the officer asked a fair question about a piece of paper in front
   * of them.
   */
  verifyCode: (code: string) =>
    api.get<{ payment: Payment | null; message: string }>(
      `/finance/payments/verify?code=${encodeURIComponent(code)}`
    ),
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
  scope: 'mine' | 'office' = 'mine',
  /**
   * What to call the file if the server's own name cannot be read.
   *
   * The name travels in `Content-Disposition`, which a browser hides from a
   * cross-origin fetch unless the API exposes it — and when it did not, every receipt
   * a member downloaded was called `receipt.pdf`. The API exposes it now; this is the
   * belt to that braces, built from what the caller already has on screen.
   */
  naming?: { receiptNumber?: string | undefined; paidOn?: string | undefined }
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

  const fallback = [naming?.paidOn, naming?.receiptNumber].filter(Boolean).join('_')

  saveBlob(
    await response.blob(),
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
      (fallback ? `Receipt_${fallback}.pdf` : 'Receipt.pdf')
  )
}

/**
 * '4K7P-2WQ9-XB' from '4K7P2WQ9XB'.
 *
 * Display only. What is stored and looked up is always the ungrouped code, so a member
 * reading the hyphens back over the telephone cannot fail a check. Mirrors
 * `formatSecurityCode` in backend/src/lib/securityCode.ts.
 */
export function formatSecurityCode(code: string): string {
  return code.replace(/(.{4})(.{4})(.*)/, '$1-$2-$3').replace(/-+$/, '')
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
