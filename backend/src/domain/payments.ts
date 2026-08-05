import { ID_FORMATS } from '../config/constants.js'
import { isFinanceOfficer, type Outcome } from './approval.js'
import { isIsoDate } from './dates.js'
import {
  duesForMonths,
  financialYearOf,
  monthName,
  validateMembershipPeriod,
} from './membership.js'
import { formatPaise, MAX_AMOUNT_PAISE } from './money.js'
import type { Actor, Payment, PaymentDraft, TransactionDraft } from './types.js'

/**
 * Rules for a member's payment declaration — the "fund request".
 *
 * A member says "I paid ₹500 by UPI on Tuesday, here is the transaction id". That
 * claim is worth nothing on its own; the club's books must only ever contain money
 * an officer has confirmed arrived. So this module encodes the handover:
 *
 *   • A member may submit and may take their own submission back, nothing more.
 *   • Only a finance officer may accept or decline one.
 *   • **An officer may not accept their own declaration.** A treasurer who pays
 *     their subscription must have another officer confirm it, because the whole
 *     value of the step is that a second person checked whether the money is
 *     really there. Recording your own claim is not a check.
 *   • Accepting produces a *pending* ledger entry, so the existing two-person rule
 *     applies unchanged. A single officer can therefore never move a member's
 *     declaration all the way into a balance.
 *
 * Every function is pure: it returns the next state or an explanation. That is
 * what lets these rules be tested without a database, and why the same refusal
 * text can be shown in the interface before the request is made.
 */

function fail<T>(code: string, reason: string): Outcome<T> {
  return { ok: false, code, reason }
}

/** 'REF-2026-000042' — the acknowledgement the member quotes when they ask. */
export function formatPaymentReference(year: number, sequence: number): string {
  const { prefix, padding } = ID_FORMATS.paymentReference
  return `${prefix}-${year}-${String(sequence).padStart(padding, '0')}`
}

/** 'RCT-2026-000042' — the receipt, allocated only once the money is confirmed. */
export function formatReceiptNumber(year: number, sequence: number): string {
  const { prefix, padding } = ID_FORMATS.receipt
  return `${prefix}-${year}-${String(sequence).padStart(padding, '0')}`
}

/** A declaration nobody has acted on yet. The only state a member can change. */
export function isOpen(payment: Pick<Payment, 'status'>): boolean {
  return payment.status === 'pending_verification'
}

/**
 * Check a member's submission before it is written.
 *
 * `existing` is that member's own declarations, used only for the duplicate guard
 * below. It is never the whole club's — a member's browser must not learn that
 * anybody else has paid.
 */
export function validatePaymentDraft(
  draft: PaymentDraft,
  context: { today: string; existing: readonly Payment[] }
): Outcome<true> {
  if (!Number.isInteger(draft.amountPaise) || draft.amountPaise <= 0) {
    return fail('amount', 'Enter the amount you paid, greater than zero.')
  }
  if (draft.amountPaise > MAX_AMOUNT_PAISE) {
    return fail('amount', 'That amount is larger than this system accepts.')
  }
  if (!isIsoDate(draft.paidOn)) {
    return fail('paidOn', 'Enter a valid date, e.g. 2026-04-15.')
  }
  if (draft.paidOn > context.today) {
    // Not pedantry: a future date would ask the treasurer to confirm a payment
    // that has not happened, and there is no honest answer to that question.
    return fail('paidOn', 'The date you paid cannot be in the future.')
  }

  /**
   * Membership is priced by the month, so the months are part of the payment.
   *
   * Both halves are enforced — which months, and that the amount matches them —
   * because the register is derived from these declarations. A member who could
   * enter ₹50 against twelve months would appear paid up for a year, and the club
   * would find out at the end of it.
   */
  if (draft.purpose === 'membership') {
    const period = validateMembershipPeriod({
      periodStart: draft.periodStart ?? '',
      periodEnd: draft.periodEnd ?? '',
      existing: context.existing,
    })

    if (!period.ok) return fail(period.code, period.reason)

    const expected = duesForMonths(period.months.length)
    if (draft.amountPaise !== expected) {
      const count = period.months.length
      return fail(
        'amount',
        `${count} month${count === 1 ? '' : 's'} of membership ` +
          `(${monthName(period.months[0] as string)}${count > 1 ? ` to ${monthName(period.months[count - 1] as string)}` : ''}) ` +
          `is ${formatPaise(expected)}, not ${formatPaise(draft.amountPaise)}.`
      )
    }
  } else if (draft.periodStart ?? draft.periodEnd) {
    // Only membership buys months. A donation with a period attached would show up
    // in the register as though the year were settled.
    return fail('period', 'Only a membership payment covers particular months.')
  }

  if (draft.method === 'cash') {
    if (!draft.handedTo?.trim()) {
      return fail('handedTo', 'Say which office bearer you gave the cash to.')
    }
  } else if (!draft.externalReference?.trim()) {
    return fail(
      'externalReference',
      draft.method === 'upi'
        ? 'Enter the UPI transaction ID from your payment app.'
        : 'Enter the cheque number or bank reference.'
    )
  }

  /**
   * The same payment, declared twice.
   *
   * Usually a double submit or an impatient reload. Left unguarded it puts two
   * identical claims in the treasurer's queue, and recording both would credit the
   * club with money it received once — an error the ledger cannot see, because
   * both entries are individually perfectly plausible.
   */
  const duplicate = context.existing.find(
    (candidate) =>
      isOpen(candidate) &&
      candidate.amountPaise === draft.amountPaise &&
      candidate.paidOn === draft.paidOn &&
      candidate.method === draft.method
  )

  if (duplicate) {
    return fail(
      'duplicate',
      `You have already declared this payment (${duplicate.reference}) and it is still awaiting verification. ` +
        'There is no need to send it again.'
    )
  }

  return { ok: true, value: true }
}

/**
 * Take back one's own declaration.
 *
 * Available only while nobody has acted on it. Once an officer has recorded or
 * declined it, the record must show what happened rather than quietly vanishing.
 */
export function withdraw(payment: Payment, actor: Actor, now: string): Outcome<Payment> {
  if (payment.memberUid !== actor.uid) {
    return fail('not_owner', 'You can only withdraw a payment you submitted yourself.')
  }
  if (!isOpen(payment)) {
    return fail(
      'not_open',
      payment.status === 'approved'
        ? 'This payment has already been verified and entered in the books.'
        : `This payment is ${payment.status.replace('_', ' ')}, so there is nothing to withdraw.`
    )
  }

  return { ok: true, value: { ...payment, status: 'withdrawn', withdrawnAt: now } }
}

/** May this officer act on this declaration? Shared by accept and decline. */
export function canReview(payment: Payment, actor: Actor): Outcome<true> {
  if (!isFinanceOfficer(actor.role)) {
    return fail(
      'not_officer',
      'Only the president, secretary or treasurer may verify a member’s payment.'
    )
  }
  if (!isOpen(payment)) {
    return fail(
      'not_open',
      `This payment is already ${payment.status.replace('_', ' ')}, so it cannot be reviewed again.`
    )
  }
  if (payment.memberUid === actor.uid) {
    return fail(
      'self_verification',
      'This is your own payment, so another officer must verify it. Confirming your own ' +
        'payment would defeat the check.'
    )
  }

  return { ok: true, value: true }
}

/**
 * The ledger entry a declaration becomes.
 *
 * Income, from the member, into the fund and category the officer chose. The
 * member's own reference travels into the entry's description and external
 * reference, so an auditor reading the ledger can find the declaration it came
 * from without knowing this table exists.
 */
export function buildEntryFor(
  payment: Payment,
  actor: Actor,
  choice: { fundId: string; categoryId: string }
): TransactionDraft {
  const method =
    payment.method === 'upi' ? 'UPI' : payment.method === 'bank' ? 'bank transfer' : 'cash'

  // Which months, when it is membership. An auditor reading the ledger a year later
  // should not have to open another table to see what the subscription bought.
  const period = periodLabel(payment)

  return {
    kind: 'income',
    date: payment.paidOn,
    amountPaise: payment.amountPaise,
    fundId: choice.fundId,
    categoryId: choice.categoryId,
    source: payment.memberName,
    description:
      `${PURPOSE_LABEL[payment.purpose]} from ${payment.memberName}` +
      `${period ? ` for ${period}` : ''} by ${method} (${payment.reference})`,
    ...(payment.externalReference ? { externalReference: payment.externalReference } : {}),
    createdBy: actor.uid,
    createdByName: actor.name,
  }
}

/** 'April 2026' or 'April 2026 to March 2027'. Empty when no months are covered. */
export function periodLabel(payment: Pick<Payment, 'periodStart' | 'periodEnd'>): string {
  const { periodStart, periodEnd } = payment
  if (!periodStart || !periodEnd) return ''
  return periodStart === periodEnd
    ? monthName(periodStart)
    : `${monthName(periodStart)} to ${monthName(periodEnd)}`
}

/** '2026-27', or empty when the payment covers no membership months. */
export function financialYearLabel(payment: Pick<Payment, 'periodStart'>): string {
  return payment.periodStart ? financialYearOf(payment.periodStart) : ''
}

const PURPOSE_LABEL = {
  membership: 'Membership payment',
  donation: 'Donation',
  event: 'Event payment',
  other: 'Payment',
} as const

/**
 * Mark a declaration verified, pointing at the entry it produced.
 *
 * The entry is created first and passed in: if the write to the ledger fails there
 * must be no declaration claiming it succeeded.
 */
export function markVerified(
  payment: Payment,
  actor: Actor,
  now: string,
  entry: { id: string; reference: string },
  receiptNumber: string
): Payment {
  return {
    ...payment,
    status: 'approved',
    reviewedAt: now,
    reviewedBy: actor.uid,
    reviewedByName: actor.name,
    transactionId: entry.id,
    transactionReference: entry.reference,
    receiptNumber,
  }
}

/** Decline a declaration. One officer's refusal is enough — nothing was created. */
export function decline(
  payment: Payment,
  actor: Actor,
  now: string,
  reason: string
): Outcome<Payment> {
  const permitted = canReview(payment, actor)
  if (!permitted.ok) return permitted

  if (reason.trim().length < 3) {
    return fail(
      'reason_required',
      'Please say why, so the member knows what to do and the record explains itself later.'
    )
  }

  return {
    ok: true,
    value: {
      ...payment,
      status: 'rejected',
      reviewedAt: now,
      reviewedBy: actor.uid,
      reviewedByName: actor.name,
      declineReason: reason.trim(),
    },
  }
}
