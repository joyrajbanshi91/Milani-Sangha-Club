import type {
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
} from '@/config/constants'
import { api } from '@/lib/api'
import type { Transaction } from '@/features/finance/api'

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

  withdrawnAt?: string
}

export interface PaymentSubmission {
  purpose: PaymentPurpose
  method: PaymentMethod
  /** Rupees as the member typed them. The server converts to exact paise. */
  amount: string
  paidOn: string
  externalReference?: string
  handedTo?: string
  note?: string
}

/**
 * The member's own half. Every path is `/members/me/…`, which is the point: there
 * is no endpoint that takes somebody else's id, so a member cannot read or change
 * another member's payments by editing a URL.
 */
export const memberPaymentsApi = {
  list: () => api.get<{ payments: Payment[] }>('/members/me/payments'),

  submit: (body: PaymentSubmission) =>
    api.post<{ payment: Payment; message: string }>('/members/me/payments', body),

  withdraw: (id: string) =>
    api.post<{ payment: Payment; message: string }>(`/members/me/payments/${id}/withdraw`, {}),
}

/** The officers' half. Refused to a member by the API, whatever the browser shows. */
export const officePaymentsApi = {
  queue: (status: PaymentStatus | 'all' = 'pending_verification') =>
    api.get<{ payments: Payment[] }>(`/finance/payments?status=${status}`),

  record: (id: string, body: { fundId: string; categoryId: string; note?: string }) =>
    api.post<{ payment: Payment; transaction: Transaction; message: string }>(
      `/finance/payments/${id}/record`,
      body
    ),

  decline: (id: string, reason: string) =>
    api.post<{ payment: Payment; message: string }>(`/finance/payments/${id}/decline`, { reason }),
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
