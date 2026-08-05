import { REQUIRED_APPROVALS } from '../config/constants.js'
import {
  approve as approveEntry,
  buildReversal,
  discard as discardEntry,
  isFinanceOfficer,
  newEntryState,
  reject as rejectEntry,
  reversalTarget,
  validateDraft,
  type Outcome,
} from '../domain/approval.js'
import {
  byCategory,
  bySource,
  fundBalances,
  monthlyTotals,
  periodTotals,
  totalFundsPaise,
} from '../domain/ledger.js'
import { buildPeriodReport, type PeriodReport } from '../domain/report.js'
import type { Actor, Transaction, TransactionDraft } from '../domain/types.js'
import { logger } from '../lib/logger.js'
import type { FinanceStore } from './store.js'

/**
 * Finance operations.
 *
 * Every write follows the same three steps: ask the domain whether it is allowed,
 * persist the result under an optimistic lock, then record what happened. The
 * domain decides, the store persists, this layer joins them — which is why the
 * rules can be tested without a database and the database code has no rules in it.
 */
export class FinanceService {
  constructor(
    private readonly store: FinanceStore,
    private readonly clubName: string,
    private readonly audit: (entry: AuditEntry) => Promise<void>
  ) {}

  private now(): string {
    return new Date().toISOString()
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async dashboard(period: { from: string; to: string }): Promise<DashboardData> {
    const [funds, categories, transactions] = await Promise.all([
      this.store.listFunds(),
      this.store.listCategories(),
      this.store.listTransactions({ status: 'all' }),
    ])

    const balances = fundBalances(funds, transactions, period.to)
    const window = transactions.filter((t) => t.date >= period.from && t.date <= period.to)

    return {
      period,
      totalFundsPaise: totalFundsPaise(balances),
      fundBalances: balances,
      totals: periodTotals(transactions, period.from, period.to),
      incomeByCategory: byCategory(window, categories, 'income'),
      expenseByCategory: byCategory(window, categories, 'expense'),
      incomeBySource: bySource(window, 'income'),
      expenseBySource: bySource(window, 'expense'),
      monthly: monthlyTotals(transactions, period.from, period.to),
      pending: transactions.filter((t) => t.status === 'pending'),
      recent: transactions.filter((t) => t.status === 'posted').slice(0, 8),
      // Almost always a wrong amount, a missing opening balance or a repeated
      // import. Shown, not hidden.
      overdrawnFunds: balances.filter((balance) => balance.balancePaise < 0),
    }
  }

  async report(period: { from: string; to: string }, generatedBy: string): Promise<PeriodReport> {
    const [funds, categories, transactions] = await Promise.all([
      this.store.listFunds(),
      this.store.listCategories(),
      this.store.listTransactions({ status: 'all' }),
    ])

    return buildPeriodReport({
      clubName: this.clubName,
      from: period.from,
      to: period.to,
      funds,
      categories,
      transactions,
      generatedAt: this.now(),
      generatedBy,
    })
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /** Record a new entry. It is pending until a different officer approves it. */
  async createEntry(draft: TransactionDraft, actor: Actor): Promise<Outcome<Transaction>> {
    if (!isFinanceOfficer(actor.role)) {
      return { ok: false, code: 'not_officer', reason: 'You are not permitted to record entries.' }
    }

    const [funds, categories] = await Promise.all([
      this.store.listFunds(),
      this.store.listCategories(),
    ])

    const valid = validateDraft(draft, {
      fundIds: new Set(funds.map((fund) => fund.id)),
      categoryIds: new Set(categories.map((category) => category.id)),
    })
    if (!valid.ok) return valid

    const created = await this.store.createTransaction({ ...draft, ...newEntryState(this.now()) })

    await this.audit({
      // Named for what actually happened. At 0 required approvals the entry is in
      // the balances the moment it is written, and an audit trail that called that
      // "created" would leave nothing recording when the money started counting.
      action: created.status === 'posted' ? 'finance.entry.posted' : 'finance.entry.created',
      actor,
      targetId: created.id,
      details: {
        reference: created.reference,
        kind: created.kind,
        amountPaise: created.amountPaise,
        posted: created.status === 'posted',
      },
    })

    return { ok: true, value: created }
  }

  /**
   * Approve an entry, posting it when the last required signature arrives.
   *
   * When the entry being posted is a reversal, the original is marked 'reversed'
   * in the same operation — otherwise a crash between the two writes would leave a
   * reversal posted against an original that still looked live, double-counting it.
   */
  async approve(id: string, actor: Actor, note?: string): Promise<Outcome<Transaction>> {
    const existing = await this.store.getTransaction(id)
    if (!existing) return notFound()

    const result = approveEntry(existing, actor, this.now(), {
      ...(note ? { note } : {}),
      required: REQUIRED_APPROVALS,
    })
    if (!result.ok) return result

    const saved = await this.store.updateTransaction(id, result.value, 'pending')
    await this.cancelReversedOriginal(saved)

    await this.audit({
      action: saved.status === 'posted' ? 'finance.entry.posted' : 'finance.entry.approved',
      actor,
      targetId: saved.id,
      details: {
        reference: saved.reference,
        amountPaise: saved.amountPaise,
        approvals: saved.approvals.length,
        recordedBy: saved.createdByName,
      },
    })

    return { ok: true, value: saved }
  }

  async reject(id: string, actor: Actor, reason: string): Promise<Outcome<Transaction>> {
    const existing = await this.store.getTransaction(id)
    if (!existing) return notFound()

    const result = rejectEntry(existing, actor, this.now(), reason)
    if (!result.ok) return result

    const saved = await this.store.updateTransaction(id, result.value, 'pending')
    await this.audit({
      action: 'finance.entry.rejected',
      actor,
      targetId: saved.id,
      details: { reference: saved.reference, reason: saved.rejectionReason },
    })

    return { ok: true, value: saved }
  }

  async discard(id: string, actor: Actor): Promise<Outcome<Transaction>> {
    const existing = await this.store.getTransaction(id)
    if (!existing) return notFound()

    const result = discardEntry(existing, actor, this.now())
    if (!result.ok) return result

    const saved = await this.store.updateTransaction(id, result.value, 'pending')
    await this.audit({
      action: 'finance.entry.withdrawn',
      actor,
      targetId: saved.id,
      details: { reference: saved.reference },
    })

    return { ok: true, value: saved }
  }

  /**
   * Ask to cancel a posted entry.
   *
   * Creates the opposite entry as pending. Nothing changes until a second officer
   * approves it, so undoing a payment is exactly as hard as making one.
   */
  async requestReversal(
    id: string,
    actor: Actor,
    reason: string
  ): Promise<Outcome<Transaction>> {
    const original = await this.store.getTransaction(id)
    if (!original) return notFound()

    const draft = buildReversal(original, actor, this.now(), reason)
    if (!draft.ok) return draft

    const created = await this.store.createTransaction({
      ...draft.value,
      ...newEntryState(this.now()),
    })

    // When no further approval is required the reversal is posted on creation, so
    // the original has to be marked here as well as in `approve`. Missing this would
    // leave a posted reversal against an entry that still looked live — the club's
    // books counting a cancelled payment twice.
    await this.cancelReversedOriginal(created)

    await this.audit({
      action:
        created.status === 'posted'
          ? 'finance.entry.reversed'
          : 'finance.entry.reversal_requested',
      actor,
      targetId: created.id,
      details: { reverses: original.reference, reason, amountPaise: original.amountPaise },
    })

    return { ok: true, value: created }
  }

  /**
   * Mark the entry a just-posted reversal cancels.
   *
   * Reached from both routes a reversal can take to 'posted' — a second officer
   * approving it, or being posted on creation — because the original must end up
   * 'reversed' either way, and a crash between the two writes is the one case where
   * the ledger would double-count.
   */
  private async cancelReversedOriginal(reversal: Transaction): Promise<void> {
    const targetId = reversalTarget(reversal)
    if (!targetId) return

    const original = await this.store.getTransaction(targetId)

    if (original && original.status === 'posted') {
      await this.store.updateTransaction(
        original.id,
        { ...original, status: 'reversed', reversedBy: reversal.id },
        'posted'
      )
      return
    }

    logger.error(
      { reversal: reversal.id, original: targetId, status: original?.status },
      'reversal posted but the original was not in a reversible state'
    )
  }

  async listFunds() {
    return this.store.listFunds()
  }
  async listCategories() {
    return this.store.listCategories()
  }
  async listTransactions(filter?: Parameters<FinanceStore['listTransactions']>[0]) {
    return this.store.listTransactions(filter)
  }
}

function notFound<T>(): Outcome<T> {
  return { ok: false, code: 'not_found', reason: 'That entry could not be found.' }
}

export interface AuditEntry {
  action: string
  actor: Actor
  targetId: string
  details: Record<string, unknown>
}

export interface DashboardData {
  period: { from: string; to: string }
  totalFundsPaise: number
  fundBalances: ReturnType<typeof fundBalances>
  totals: ReturnType<typeof periodTotals>
  incomeByCategory: ReturnType<typeof byCategory>
  expenseByCategory: ReturnType<typeof byCategory>
  incomeBySource: ReturnType<typeof bySource>
  expenseBySource: ReturnType<typeof bySource>
  monthly: ReturnType<typeof monthlyTotals>
  pending: Transaction[]
  recent: Transaction[]
  overdrawnFunds: ReturnType<typeof fundBalances>
}
