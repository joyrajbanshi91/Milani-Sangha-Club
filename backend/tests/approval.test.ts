import { describe, expect, it } from 'vitest'

import {
  approve,
  approvalsOutstanding,
  buildReversal,
  canApprove,
  checkedEntryState,
  discard,
  isFinanceOfficer,
  newEntryState,
  reject,
  reversalTarget,
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

  /**
   * The two offices that organise rather than administer.
   *
   * A Cultural Secretary runs the evening; a Game Secretary runs the fixtures. Neither
   * keeps the books, so by default neither sees the club's money — every entry, every
   * member's payments, every statement. That is a decision about who may read the
   * club's finances, so it is written down here rather than left to be inferred from a
   * list: adding either to FINANCE_ROLES breaks this test, which is the point.
   */
  it('does not give the cultural or game secretary the club’s accounts', () => {
    expect(isFinanceOfficer('culturalSecretary')).toBe(false)
    expect(isFinanceOfficer('gameSecretary')).toBe(false)
  })
})

/**
 * What the number itself does, at each setting.
 *
 * The club runs `REQUIRED_APPROVALS` at 1 — one officer records, one other accepts.
 * These pass the requirement explicitly so both settings stay under test and changing
 * the club's mind remains a one-line change rather than a rewrite.
 */
describe('recording with no further approval required', () => {
  it('posts the entry immediately', () => {
    const state = newEntryState(NOW, 0)

    expect(state.status).toBe('posted')
    expect(state.postedAt).toBe(NOW)
    expect(state.approvals).toEqual([])
  })

  it('leaves it pending as soon as one approval is required', () => {
    const state = newEntryState(NOW, 1)

    expect(state.status).toBe('pending')
    expect(state.postedAt).toBeUndefined()
  })

  it('treats a negative requirement as none, rather than as an unreachable state', () => {
    expect(newEntryState(NOW, -1).status).toBe('posted')
  })

  it('refuses an approval on an entry that needs none', () => {
    // Nothing should be able to reach this state — `newEntryState` posts instead of
    // leaving a pending entry — but if one ever did, the refusal must explain itself
    // rather than silently adding a signature that changes nothing.
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = approve(entry, SECRETARY, NOW, { required: 0 })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('already_satisfied')
  })

  it('still names a reversal’s target, which is what marks the original cancelled', () => {
    // At 0 required a reversal is posted on creation, so nobody ever calls `approve`
    // on it — and the original was only marked 'reversed' on that path. Without this
    // the books would count a cancelled payment twice.
    const reversal = makeTransaction({ status: 'posted', reverses: 'txn-original' })
    expect(reversalTarget(reversal)).toBe('txn-original')

    expect(reversalTarget(makePending({ reverses: 'txn-original' }))).toBeNull()
    expect(reversalTarget(makeTransaction({ status: 'posted' }))).toBeNull()
  })
})

/**
 * The two-person rule at `required: 1`, which is how the club runs.
 *
 * Two people and never a third: whoever puts an entry forward cannot accept it, and
 * exactly one other bearer does. The requirement is passed explicitly so these keep
 * proving the machinery even if the club's number ever changes.
 */
describe('the two-person rule', () => {
  it('refuses to let the author approve their own entry', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = approve(entry, TREASURER, NOW, { required: 1 })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('self_approval')
  })

  it('posts the entry once a different officer approves', () => {
    const entry = makePending({ createdBy: TREASURER.uid })
    const result = approve(entry, SECRETARY, NOW, { required: 1 })

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

    expect(canApprove(entry, TREASURER, 1).ok).toBe(false)
    expect(canApprove(entry, SECRETARY, 1).ok).toBe(true)
    expect(canApprove(entry, MEMBER, 1).ok).toBe(false)
  })
})

/**
 * The one entry a single officer posts: a member's declaration they accepted.
 *
 * The maker is the member. `canReview` in domain/payments.ts refuses an officer their
 * own declaration, and a declaration can only ever be submitted for oneself — so by the
 * time this state is reached, the person accepting the money is provably not the person
 * who put it forward. That is the check the two-person rule asks for, and asking a third
 * bearer on top left members holding receipts for money outside the balances.
 */
describe('an entry posted on the accepting officer’s own check', () => {
  it('posts immediately, with that officer named as the approval', () => {
    const state = checkedEntryState(TREASURER, NOW)

    expect(state.status).toBe('posted')
    expect(state.postedAt).toBe(NOW)
    expect(state.approvals).toEqual([
      { uid: TREASURER.uid, name: TREASURER.name, role: TREASURER.role, at: NOW },
    ])
  })

  it('leaves nothing for anybody else to approve', () => {
    // Whoever opens it next is told it is settled, rather than being invited to add a
    // signature that would change nothing.
    const entry = makeTransaction({ ...checkedEntryState(TREASURER, NOW) })

    expect(approvalsOutstanding(entry, 1)).toBe(0)

    const result = canApprove(entry, SECRETARY, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_pending')
  })

  it('satisfies the requirement without a second signature', () => {
    expect(approvalsOutstanding(checkedEntryState(SECRETARY, NOW), 1)).toBe(0)
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
