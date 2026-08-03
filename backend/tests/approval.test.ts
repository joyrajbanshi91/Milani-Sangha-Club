import { describe, expect, it } from 'vitest'

import {
  approve,
  approvalsOutstanding,
  buildReversal,
  canApprove,
  discard,
  isFinanceOfficer,
  reject,
  validateDraft,
} from '../src/domain/approval.js'
import type { TransactionDraft } from '../src/domain/types.js'
import {
  CASH,
  BANK,
  FEES,
  MEMBER,
  PRESIDENT,
  SECRETARY,
  TREASURER,
  VOLUNTEER,
  makePending,
  makeTransaction,
} from './helpers/fixtures.js'

const NOW = '2026-04-16T09:00:00.000Z'

describe('who counts as a finance officer', () => {
  it('admits the president, secretary, treasurer and administrator', () => {
    expect(isFinanceOfficer('president')).toBe(true)
    expect(isFinanceOfficer('secretary')).toBe(true)
    expect(isFinanceOfficer('treasurer')).toBe(true)
    expect(isFinanceOfficer('administrator')).toBe(true)
  })

  it('excludes members, volunteers and visitors', () => {
    expect(isFinanceOfficer('member')).toBe(false)
    expect(isFinanceOfficer('volunteer')).toBe(false)
    expect(isFinanceOfficer('visitor')).toBe(false)
  })
})

describe('the two-person rule', () => {
  it('refuses to let the author approve their own entry', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = approve(entry, TREASURER, NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('self_approval')
  })

  it('posts the entry once a different officer approves', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = approve(entry, SECRETARY, NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('posted')
    expect(result.value.postedAt).toBe(NOW)
    expect(result.value.approvals).toHaveLength(1)
    expect(result.value.approvals[0]?.uid).toBe(SECRETARY.uid)
  })

  it('does not modify the entry it was given', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    approve(entry, SECRETARY, NOW)

    expect(entry.status).toBe('pending')
    expect(entry.approvals).toHaveLength(0)
  })

  it('refuses an approval from someone who is not an officer', () => {
    const entry = makePending({ createdBy: TREASURER.uid })

    for (const actor of [MEMBER, VOLUNTEER]) {
      const result = approve(entry, actor, NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('not_officer')
    }
  })

  it('will not let the same officer approve twice to reach the threshold', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const first = approve(entry, SECRETARY, NOW, { required: 2 })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = approve(first.value, SECRETARY, NOW, { required: 2 })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('already_approved')
  })

  it('needs three distinct people when two approvals are required', () => {
    const entry = makePending({ createdBy: TREASURER.uid })

    const first = approve(entry, SECRETARY, NOW, { required: 2 })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.status).toBe('pending')
    expect(approvalsOutstanding(first.value, 2)).toBe(1)

    const second = approve(first.value, PRESIDENT, NOW, { required: 2 })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.status).toBe('posted')
  })

  it('cannot approve an entry that is already posted', () => {
    const posted = makeTransaction({ status: 'posted' })
    const result = approve(posted, PRESIDENT, NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_pending')
  })

  it('explains refusals through canApprove without changing anything', () => {
    const entry = makePending({ createdBy: TREASURER.uid })

    expect(canApprove(entry, TREASURER).ok).toBe(false)
    expect(canApprove(entry, SECRETARY).ok).toBe(true)
    expect(canApprove(entry, MEMBER).ok).toBe(false)
  })
})

describe('rejection', () => {
  it('lets a second officer decline, with a reason', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = reject(entry, SECRETARY, NOW, 'No bill attached')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('rejected')
    expect(result.value.rejectedBy).toBe(SECRETARY.uid)
    expect(result.value.rejectionReason).toBe('No bill attached')
  })

  it('insists on a reason, so the record explains itself later', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = reject(entry, SECRETARY, NOW, '  ')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('reason_required')
  })

  it('does not let the author reject their own entry', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = reject(entry, TREASURER, NOW, 'changed my mind')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('self_rejection')
  })
})

describe('withdrawing an entry', () => {
  it('lets the author withdraw while nobody has approved', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = discard(entry, TREASURER, NOW)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.status).toBe('discarded')
  })

  it('stops being available once another officer has signed', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const approved = approve(entry, SECRETARY, NOW, { required: 2 })
    expect(approved.ok).toBe(true)
    if (!approved.ok) return

    const result = discard(approved.value, TREASURER, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('already_approved')
  })

  it('does not let one officer withdraw another officer’s entry', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = discard(entry, SECRETARY, NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_author')
  })
})

describe('reversal instead of deletion', () => {
  it('turns a posted income into an equal expense awaiting approval', () => {
    const original = makeTransaction({ kind: 'income', amountPaise: 250_000, fundId: CASH.id })
    const result = buildReversal(original, SECRETARY, NOW, 'Duplicate entry')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('expense')
    expect(result.value.amountPaise).toBe(250_000)
    expect(result.value.fundId).toBe(CASH.id)
    expect(result.value.reverses).toBe(original.id)
    expect(result.value.description).toContain(original.reference)
    expect(result.value.description).toContain('Duplicate entry')
  })

  it('turns a posted expense into an equal income', () => {
    const original = makeTransaction({ kind: 'expense', categoryId: 'cat-ground' })
    const result = buildReversal(original, PRESIDENT, NOW, 'Paid twice')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.kind).toBe('income')
  })

  it('reverses a transfer by swapping its two funds', () => {
    const original = makeTransaction({
      kind: 'transfer',
      fundId: CASH.id,
      toFundId: BANK.id,
      categoryId: undefined,
    })
    const result = buildReversal(original, PRESIDENT, NOW, 'Wrong direction')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('transfer')
    expect(result.value.fundId).toBe(BANK.id)
    expect(result.value.toFundId).toBe(CASH.id)
  })

  it('refuses to reverse anything that was never posted', () => {
    for (const status of ['pending', 'rejected', 'discarded'] as const) {
      const result = buildReversal(makeTransaction({ status }), SECRETARY, NOW, 'because')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('not_posted')
    }
  })

  it('refuses to reverse the same entry twice', () => {
    const original = makeTransaction({ reversedBy: 'txn-99' })
    const result = buildReversal(original, SECRETARY, NOW, 'again')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('already_reversed')
  })

  it('refuses a reversal requested by a non-officer', () => {
    const result = buildReversal(makeTransaction(), MEMBER, NOW, 'let me')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_officer')
  })
})

describe('draft validation', () => {
  const context = {
    fundIds: new Set([CASH.id, BANK.id]),
    categoryIds: new Set([FEES.id]),
  }

  const base: TransactionDraft = {
    kind: 'income',
    date: '2026-04-15',
    amountPaise: 100_000,
    fundId: CASH.id,
    categoryId: FEES.id,
    source: 'Member dues',
    description: 'Subscription',
    createdBy: TREASURER.uid,
    createdByName: TREASURER.name,
  }

  it('accepts a well-formed income entry', () => {
    expect(validateDraft(base, context).ok).toBe(true)
  })

  it('rejects a zero or missing amount', () => {
    expect(validateDraft({ ...base, amountPaise: 0 }, context).ok).toBe(false)
  })

  it('rejects an impossible date', () => {
    expect(validateDraft({ ...base, date: '2026-02-31' }, context).ok).toBe(false)
    expect(validateDraft({ ...base, date: '15/04/2026' }, context).ok).toBe(false)
  })

  it('rejects an unknown fund or category', () => {
    expect(validateDraft({ ...base, fundId: 'nope' }, context).ok).toBe(false)
    expect(validateDraft({ ...base, categoryId: 'nope' }, context).ok).toBe(false)
  })

  it('requires a source and a description, so the ledger reads sensibly', () => {
    expect(validateDraft({ ...base, source: '  ' }, context).ok).toBe(false)
    expect(validateDraft({ ...base, description: '' }, context).ok).toBe(false)
  })

  it('requires two different funds for a transfer, and no category', () => {
    const transfer: TransactionDraft = {
      ...base,
      kind: 'transfer',
      categoryId: undefined,
      toFundId: BANK.id,
    }
    expect(validateDraft(transfer, context).ok).toBe(true)
    expect(validateDraft({ ...transfer, toFundId: CASH.id }, context).ok).toBe(false)
    expect(validateDraft({ ...transfer, toFundId: undefined }, context).ok).toBe(false)
    expect(validateDraft({ ...transfer, categoryId: FEES.id }, context).ok).toBe(false)
  })

  it('rejects a destination fund on a non-transfer', () => {
    expect(validateDraft({ ...base, toFundId: BANK.id }, context).ok).toBe(false)
  })
})
