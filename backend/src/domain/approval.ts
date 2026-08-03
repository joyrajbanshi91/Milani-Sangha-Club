import { FINANCE_ROLES, REQUIRED_APPROVALS, type Role } from '../config/constants.js'
import { isIsoDate } from './dates.js'
import type { Actor, Approval, Transaction, TransactionDraft } from './types.js'

/**
 * Maker–checker rules for financial entries.
 *
 * The whole point is that no single person can move the club's money. Concretely:
 *
 *   • The officer who records an entry can never approve it. Not "should not" —
 *     `approve` refuses, and the Firestore rules refuse independently.
 *   • Approvals must come from distinct people. Approving twice does nothing.
 *   • Only an entry that has gathered enough approvals is 'posted', and only a
 *     posted entry affects any balance.
 *   • A posted entry is never edited or deleted. It is cancelled by an equal and
 *     opposite reversal, which itself needs two people. The original stays in the
 *     ledger marked 'reversed'.
 *
 * Every function here is pure: it returns the next state or an explanation, and
 * touches nothing. That is what makes these rules testable.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string; code: string }

function fail<T>(code: string, reason: string): Outcome<T> {
  return { ok: false, code, reason }
}

export function isFinanceOfficer(role: Role): boolean {
  return FINANCE_ROLES.includes(role)
}

/** How many more signatures a pending entry needs. */
export function approvalsOutstanding(
  transaction: Pick<Transaction, 'approvals'>,
  required = REQUIRED_APPROVALS
): number {
  return Math.max(0, required - transaction.approvals.length)
}

/**
 * Can this actor approve this entry?
 *
 * Separated from `approve` so the interface can grey out a button and explain
 * why, using exactly the rule the server will apply.
 */
export function canApprove(
  transaction: Transaction,
  actor: Actor,
  required = REQUIRED_APPROVALS
): Outcome<true> {
  if (!isFinanceOfficer(actor.role)) {
    return fail('not_officer', 'Only the president, secretary or treasurer may approve entries.')
  }

  if (transaction.status !== 'pending') {
    return fail(
      'not_pending',
      `This entry is ${transaction.status}, so there is nothing left to approve.`
    )
  }

  if (transaction.createdBy === actor.uid) {
    return fail(
      'self_approval',
      'You recorded this entry, so it must be approved by a different officer.'
    )
  }

  if (transaction.approvals.some((approval) => approval.uid === actor.uid)) {
    return fail('already_approved', 'You have already approved this entry.')
  }

  if (approvalsOutstanding(transaction, required) === 0) {
    return fail('already_satisfied', 'This entry already has all the approvals it needs.')
  }

  return { ok: true, value: true }
}

/**
 * Record an approval, posting the entry if that was the last one needed.
 *
 * Returns a new object; the input is not modified.
 */
export function approve(
  transaction: Transaction,
  actor: Actor,
  now: string,
  options: { note?: string; required?: number } = {}
): Outcome<Transaction> {
  const required = options.required ?? REQUIRED_APPROVALS
  const permitted = canApprove(transaction, actor, required)
  if (!permitted.ok) return permitted

  const approval: Approval = {
    uid: actor.uid,
    name: actor.name,
    role: actor.role,
    at: now,
    ...(options.note ? { note: options.note } : {}),
  }

  const approvals = [...transaction.approvals, approval]
  const satisfied = approvals.length >= required

  return {
    ok: true,
    value: {
      ...transaction,
      approvals,
      ...(satisfied ? { status: 'posted' as const, postedAt: now } : {}),
    },
  }
}

/** Decline a pending entry. One officer's refusal is enough to stop it. */
export function reject(
  transaction: Transaction,
  actor: Actor,
  now: string,
  reason: string
): Outcome<Transaction> {
  if (!isFinanceOfficer(actor.role)) {
    return fail('not_officer', 'Only the president, secretary or treasurer may reject entries.')
  }
  if (transaction.status !== 'pending') {
    return fail('not_pending', `This entry is ${transaction.status} and cannot be rejected.`)
  }
  if (transaction.createdBy === actor.uid) {
    // Withdrawing your own entry is `discard`, which is not a second opinion.
    return fail(
      'self_rejection',
      'Use "withdraw" to take back your own entry; rejection is for another officer.'
    )
  }
  if (reason.trim().length < 3) {
    return fail('reason_required', 'Please give a reason so the record explains itself later.')
  }

  return {
    ok: true,
    value: {
      ...transaction,
      status: 'rejected',
      rejectedAt: now,
      rejectedBy: actor.uid,
      rejectionReason: reason.trim(),
    },
  }
}

/**
 * Withdraw one's own entry before anyone has approved it.
 *
 * Allowed because nothing has been decided yet and no balance was touched. Once
 * another officer has signed, withdrawal is no longer available — the entry must
 * be rejected or posted, so the record shows what happened.
 */
export function discard(transaction: Transaction, actor: Actor, now: string): Outcome<Transaction> {
  if (transaction.status !== 'pending') {
    return fail('not_pending', `This entry is ${transaction.status} and cannot be withdrawn.`)
  }
  if (transaction.createdBy !== actor.uid && actor.role !== 'administrator') {
    return fail('not_author', 'Only the officer who recorded an entry may withdraw it.')
  }
  if (transaction.approvals.length > 0) {
    return fail(
      'already_approved',
      'Another officer has already approved this entry, so it can no longer be withdrawn.'
    )
  }

  return { ok: true, value: { ...transaction, status: 'discarded', rejectedAt: now } }
}

/**
 * Build the reversal that cancels a posted entry.
 *
 * The reversal is itself a pending entry needing a second officer, so cancelling
 * money movement is exactly as hard as creating it. Nothing is deleted: the
 * original keeps its place in the ledger and gains a pointer to its reversal.
 */
export function buildReversal(
  original: Transaction,
  actor: Actor,
  now: string,
  reason: string
): Outcome<TransactionDraft & { reverses: string }> {
  if (!isFinanceOfficer(actor.role)) {
    return fail('not_officer', 'Only the president, secretary or treasurer may reverse entries.')
  }
  if (original.status !== 'posted') {
    return fail(
      'not_posted',
      `Only a posted entry can be reversed. This one is ${original.status}.`
    )
  }
  if (original.reversedBy) {
    return fail('already_reversed', 'This entry has already been reversed.')
  }
  if (reason.trim().length < 3) {
    return fail('reason_required', 'Please give a reason for the reversal.')
  }

  // An income reversal is an expense of the same amount from the same fund, and
  // vice versa. A transfer reverses by swapping its two funds.
  const reversedKind =
    original.kind === 'income' ? 'expense' : original.kind === 'expense' ? 'income' : 'transfer'

  return {
    ok: true,
    value: {
      kind: reversedKind,
      date: now.slice(0, 10),
      amountPaise: original.amountPaise,
      fundId: original.kind === 'transfer' ? (original.toFundId ?? original.fundId) : original.fundId,
      ...(original.kind === 'transfer' ? { toFundId: original.fundId } : {}),
      ...(original.categoryId ? { categoryId: original.categoryId } : {}),
      source: original.source,
      description: `Reversal of ${original.reference}: ${reason.trim()}`,
      ...(original.externalReference ? { externalReference: original.externalReference } : {}),
      createdBy: actor.uid,
      createdByName: actor.name,
      reverses: original.id,
    },
  }
}

/** Validate a draft before it is written as a pending entry. */
export function validateDraft(
  draft: TransactionDraft,
  context: { fundIds: ReadonlySet<string>; categoryIds: ReadonlySet<string> }
): Outcome<true> {
  if (!Number.isInteger(draft.amountPaise) || draft.amountPaise <= 0) {
    return fail('amount', 'Enter an amount greater than zero.')
  }
  if (!isIsoDate(draft.date)) {
    return fail('date', 'Enter a valid date, e.g. 2026-04-15.')
  }
  if (!context.fundIds.has(draft.fundId)) {
    return fail('fund', 'Choose which fund the money moves through.')
  }
  if (draft.source.trim().length === 0) {
    return fail('source', 'Say where the money came from or went to.')
  }
  if (draft.description.trim().length === 0) {
    return fail('description', 'Add a short description.')
  }

  if (draft.kind === 'transfer') {
    if (!draft.toFundId || !context.fundIds.has(draft.toFundId)) {
      return fail('toFund', 'Choose the fund the money moves into.')
    }
    if (draft.toFundId === draft.fundId) {
      return fail('toFund', 'A transfer must be between two different funds.')
    }
    if (draft.categoryId) {
      return fail('category', 'A transfer moves money between funds and takes no category.')
    }
  } else {
    if (!draft.categoryId || !context.categoryIds.has(draft.categoryId)) {
      return fail('category', 'Choose a category.')
    }
    if (draft.toFundId) {
      return fail('toFund', 'Only a transfer has a destination fund.')
    }
  }

  return { ok: true, value: true }
}
