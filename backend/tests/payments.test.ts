import { describe, expect, it } from 'vitest'

import {
  buildEntryFor,
  canReview,
  decline,
  formatPaymentReference,
  markVerified,
  validatePaymentDraft,
  withdraw,
} from '../src/domain/payments.js'
import type { Payment, PaymentDraft } from '../src/domain/types.js'
import { CASH, FEES, MEMBER, PRESIDENT, TREASURER, VOLUNTEER } from './helpers/fixtures.js'

/**
 * The rules for a member's payment declaration.
 *
 * Tested as pure functions, with no database and no HTTP, because these are the
 * promises the club is actually relying on: that a claim by a member is not money,
 * that an officer cannot confirm their own payment, and that confirming one
 * produces an entry which still needs a second signature.
 */

const TODAY = '2026-06-15'

function draft(overrides: Partial<PaymentDraft> = {}): PaymentDraft {
  return {
    memberUid: MEMBER.uid,
    memberName: MEMBER.name,
    purpose: 'membership',
    method: 'upi',
    amountPaise: 50_000,
    paidOn: '2026-06-14',
    externalReference: '4471829930',
    ...overrides,
  }
}

let counter = 0

function makePayment(overrides: Partial<Payment> = {}): Payment {
  counter += 1
  return {
    id: `pay-${counter}`,
    reference: formatPaymentReference(2026, counter),
    status: 'pending_verification',
    memberUid: MEMBER.uid,
    memberName: MEMBER.name,
    purpose: 'membership',
    method: 'upi',
    amountPaise: 50_000,
    paidOn: '2026-06-14',
    externalReference: '4471829930',
    submittedAt: '2026-06-14T09:00:00.000Z',
    ...overrides,
  }
}

describe('what a member may declare', () => {
  it('accepts an ordinary UPI payment', () => {
    expect(validatePaymentDraft(draft(), { today: TODAY, existing: [] }).ok).toBe(true)
  })

  it('refuses a payment dated in the future', () => {
    // There is no honest answer to "did this arrive?" for a day that has not
    // happened, so the treasurer must never be asked.
    const result = validatePaymentDraft(draft({ paidOn: '2026-06-16' }), {
      today: TODAY,
      existing: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('paidOn')
  })

  it('accepts a backdated payment, which is ordinary', () => {
    expect(
      validatePaymentDraft(draft({ paidOn: '2026-04-02' }), { today: TODAY, existing: [] }).ok
    ).toBe(true)
  })

  it.each([0, -1, 1.5])('refuses the amount %s', (amountPaise) => {
    const result = validatePaymentDraft(draft({ amountPaise }), { today: TODAY, existing: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('amount')
  })

  it('needs a transaction id for UPI, because that is what gets matched', () => {
    const result = validatePaymentDraft(draft({ externalReference: '  ' }), {
      today: TODAY,
      existing: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('externalReference')
      expect(result.reason).toMatch(/UPI transaction ID/i)
    }
  })

  it('needs a cheque or bank reference for a bank transfer', () => {
    const result = validatePaymentDraft(draft({ method: 'bank', externalReference: undefined }), {
      today: TODAY,
      existing: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/cheque number or bank reference/i)
  })

  it('needs to know who took the cash, not a transaction id', () => {
    const missing = validatePaymentDraft(
      draft({ method: 'cash', externalReference: undefined }),
      { today: TODAY, existing: [] }
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.code).toBe('handedTo')

    const given = validatePaymentDraft(
      draft({ method: 'cash', externalReference: undefined, handedTo: 'Secretary' }),
      { today: TODAY, existing: [] }
    )
    expect(given.ok).toBe(true)
  })

  it('refuses the same payment declared twice while the first is still queued', () => {
    // A double submit or an impatient reload. Two identical claims in the queue is
    // how a club ends up crediting itself with money it received once.
    const existing = [makePayment()]

    const result = validatePaymentDraft(draft(), { today: TODAY, existing })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('duplicate')
      expect(result.reason).toContain(existing[0]?.reference as string)
    }
  })

  it('allows the same amount again once the first has been dealt with', () => {
    // Two ₹500 payments on the same day is unusual but perfectly possible, and the
    // guard is against an accidental repeat, not against paying twice.
    for (const status of ['approved', 'rejected', 'withdrawn'] as const) {
      const result = validatePaymentDraft(draft(), {
        today: TODAY,
        existing: [makePayment({ status })],
      })
      expect(result.ok, status).toBe(true)
    }
  })

  it('does not treat a different amount or day as a duplicate', () => {
    const existing = [makePayment()]

    expect(validatePaymentDraft(draft({ amountPaise: 50_001 }), { today: TODAY, existing }).ok).toBe(
      true
    )
    expect(validatePaymentDraft(draft({ paidOn: '2026-06-13' }), { today: TODAY, existing }).ok).toBe(
      true
    )
  })
})

describe('withdrawing your own declaration', () => {
  it('lets the member who submitted it take it back', () => {
    const result = withdraw(makePayment(), MEMBER, '2026-06-15T10:00:00.000Z')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBe('withdrawn')
      expect(result.value.withdrawnAt).toBe('2026-06-15T10:00:00.000Z')
    }
  })

  it('refuses somebody else, officers included', () => {
    for (const actor of [TREASURER, PRESIDENT, VOLUNTEER]) {
      const result = withdraw(makePayment(), actor, '2026-06-15T10:00:00.000Z')
      expect(result.ok, actor.role).toBe(false)
      if (!result.ok) expect(result.code).toBe('not_owner')
    }
  })

  it('refuses once an officer has entered it in the books', () => {
    const result = withdraw(
      makePayment({ status: 'approved' }),
      MEMBER,
      '2026-06-15T10:00:00.000Z'
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/already been verified/i)
  })
})

describe('who may verify a declaration', () => {
  it('admits the three finance officers', () => {
    for (const actor of [TREASURER, PRESIDENT]) {
      expect(canReview(makePayment(), actor).ok, actor.role).toBe(true)
    }
  })

  it('refuses a member and a volunteer', () => {
    for (const actor of [MEMBER, VOLUNTEER]) {
      const result = canReview(makePayment(), actor)
      expect(result.ok, actor.role).toBe(false)
      if (!result.ok) expect(result.code).toBe('not_officer')
    }
  })

  /**
   * The rule the whole feature turns on.
   *
   * A treasurer pays their own subscription like everybody else. If they could
   * confirm it themselves, the verification step would be a person agreeing with
   * themselves — and the two-person rule downstream would not help, because the
   * question being answered here is not "should this be recorded?" but "did this
   * money actually arrive?".
   */
  it('refuses an officer verifying their own payment', () => {
    const own = makePayment({ memberUid: TREASURER.uid, memberName: TREASURER.name })

    const result = canReview(own, TREASURER)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('self_verification')

    // Any other officer may.
    expect(canReview(own, PRESIDENT).ok).toBe(true)
  })

  it('refuses a second review of one that has been dealt with', () => {
    for (const status of ['approved', 'rejected', 'withdrawn'] as const) {
      const result = canReview(makePayment({ status }), TREASURER)
      expect(result.ok, status).toBe(false)
      if (!result.ok) expect(result.code).toBe('not_open')
    }
  })
})

describe('the ledger entry a declaration becomes', () => {
  it('is income to the fund and category the officer chose', () => {
    const payment = makePayment()
    const entry = buildEntryFor(payment, TREASURER, { fundId: CASH.id, categoryId: FEES.id })

    expect(entry.kind).toBe('income')
    expect(entry.amountPaise).toBe(payment.amountPaise)
    expect(entry.fundId).toBe(CASH.id)
    expect(entry.categoryId).toBe(FEES.id)
  })

  it('is dated when the member paid, not when the officer got round to it', () => {
    const entry = buildEntryFor(makePayment({ paidOn: '2026-04-02' }), TREASURER, {
      fundId: CASH.id,
      categoryId: FEES.id,
    })

    expect(entry.date).toBe('2026-04-02')
  })

  it('is attributed to the officer who recorded it, so they cannot approve it', () => {
    const entry = buildEntryFor(makePayment(), TREASURER, {
      fundId: CASH.id,
      categoryId: FEES.id,
    })

    expect(entry.createdBy).toBe(TREASURER.uid)
    expect(entry.createdByName).toBe(TREASURER.name)
  })

  it('carries the member and the declaration into the ledger, so it can be traced', () => {
    const payment = makePayment()
    const entry = buildEntryFor(payment, TREASURER, { fundId: CASH.id, categoryId: FEES.id })

    expect(entry.source).toBe(MEMBER.name)
    expect(entry.description).toContain(payment.reference)
    expect(entry.description).toContain(MEMBER.name)
    expect(entry.externalReference).toBe(payment.externalReference)
  })

  it('names the method in words a committee member would use', () => {
    const upi = buildEntryFor(makePayment(), TREASURER, { fundId: CASH.id, categoryId: FEES.id })
    expect(upi.description).toContain('by UPI')

    const cash = buildEntryFor(makePayment({ method: 'cash' }), TREASURER, {
      fundId: CASH.id,
      categoryId: FEES.id,
    })
    expect(cash.description).toContain('by cash')

    const bank = buildEntryFor(makePayment({ method: 'bank' }), TREASURER, {
      fundId: CASH.id,
      categoryId: FEES.id,
    })
    expect(bank.description).toContain('by bank transfer')
  })
})

describe('marking a declaration verified', () => {
  it('records who checked it and which entry it produced', () => {
    const saved = markVerified(makePayment(), TREASURER, '2026-06-15T12:00:00.000Z', {
      id: 'txn-9',
      reference: 'TXN-2026-000009',
    })

    expect(saved.status).toBe('approved')
    expect(saved.reviewedBy).toBe(TREASURER.uid)
    expect(saved.reviewedByName).toBe(TREASURER.name)
    expect(saved.reviewedAt).toBe('2026-06-15T12:00:00.000Z')
    expect(saved.transactionId).toBe('txn-9')
    expect(saved.transactionReference).toBe('TXN-2026-000009')
  })
})

describe('declining a declaration', () => {
  it('needs a reason the member can act on', () => {
    const result = decline(makePayment(), TREASURER, '2026-06-15T12:00:00.000Z', 'no')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('reason_required')
  })

  it('records the reason and who declined it', () => {
    const result = decline(
      makePayment(),
      TREASURER,
      '2026-06-15T12:00:00.000Z',
      '  No payment with that ID reached the club account.  '
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBe('rejected')
      expect(result.value.declineReason).toBe('No payment with that ID reached the club account.')
      expect(result.value.reviewedBy).toBe(TREASURER.uid)
    }
  })

  it('applies the same who-may-review rules as recording', () => {
    const own = makePayment({ memberUid: TREASURER.uid })
    const result = decline(own, TREASURER, '2026-06-15T12:00:00.000Z', 'Changed my mind')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('self_verification')
  })
})

describe('the acknowledgement reference', () => {
  it('is the year and a zero-padded sequence', () => {
    expect(formatPaymentReference(2026, 42)).toBe('REF-2026-000042')
  })

  it('does not collide with a ledger reference, which uses TXN', () => {
    expect(formatPaymentReference(2026, 1)).not.toContain('TXN')
  })
})
