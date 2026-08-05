import {
  byCategory,
  bySource,
  fundBalances,
  inPeriod,
  monthlyTotals,
  openingTotalPaise,
  periodTotals,
  postedOnly,
  totalFundsPaise,
  type Baseline,
  type FundBalance,
  type PeriodTotals,
  type Rollup,
} from './ledger.js'
import type { Category, Fund, Transaction } from './types.js'

/**
 * The financial statement for a month or an arbitrary period.
 *
 * Assembled once, here, and then rendered as JSON for the dashboard and as PDF
 * for the committee. Both therefore show the same figures by construction — a
 * dashboard that disagrees with the printed statement is the kind of thing that
 * loses a treasurer an evening.
 */

export interface PeriodReport {
  club: { name: string }
  period: { from: string; to: string; label: string }
  generatedAt: string
  generatedBy: string

  openingBalancePaise: number
  closingBalancePaise: number
  totals: PeriodTotals

  incomeByCategory: Rollup[]
  expenseByCategory: Rollup[]
  incomeBySource: Rollup[]
  expenseBySource: Rollup[]

  fundBalances: FundBalance[]
  monthly: Array<{ month: string; incomePaise: number; expensePaise: number; netPaise: number }>

  transactions: Transaction[]

  /** Entries still awaiting a second officer at the moment of generation. */
  pendingCount: number
  /** Reversals posted during the period, called out so they are never hidden. */
  reversalCount: number
  /**
   * Funds whose balance has gone below zero.
   *
   * Not blocked when the entry is recorded: a bank account can genuinely be
   * overdrawn, and entries are often keyed in out of order, so refusing would stop
   * the club recording what actually happened. But a cash box cannot hold less
   * than nothing, so an overdrawn fund almost always means a wrong amount, a
   * missing opening balance or a double import — and it is reported on the face of
   * the statement rather than left for someone to notice.
   */
  overdrawnFunds: FundBalance[]
}

export function monthLabel(from: string): string {
  const date = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function periodLabel(from: string, to: string): string {
  // A range that covers exactly one calendar month is named as that month.
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const startsFirst = from.endsWith('-01')
  const endsLast = to === lastDayOfMonth(to)

  if (sameMonth && startsFirst && endsLast) return monthLabel(from)

  const format = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })

  return `${format(from)} to ${format(to)}`
}

export function lastDayOfMonth(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

/** Whole-month range for 'YYYY-MM'. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`
  return { from, to: lastDayOfMonth(from) }
}

export function buildPeriodReport(input: {
  clubName: string
  from: string
  to: string
  funds: readonly Fund[]
  categories: readonly Category[]
  /** All transactions, of every status — this function does the filtering. */
  transactions: readonly Transaction[]
  generatedAt: string
  generatedBy: string
  /**
   * The declared balances this period is measured from, when the club has adopted
   * one. Without it the report accumulates from the beginning of the ledger, which
   * is right for a club in its first year and wrong for one in its fifth.
   */
  baseline?: Baseline
}): PeriodReport {
  const { from, to, funds, categories, transactions, baseline } = input

  const posted = postedOnly(transactions)
  const window = inPeriod(posted, from, to)

  const opening = openingTotalPaise(funds, transactions, from, baseline)
  const balancesAtEnd = fundBalances(funds, transactions, to, baseline)

  return {
    club: { name: input.clubName },
    period: { from, to, label: periodLabel(from, to) },
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,

    openingBalancePaise: opening,
    closingBalancePaise: totalFundsPaise(balancesAtEnd),
    totals: periodTotals(transactions, from, to),

    incomeByCategory: byCategory(window, categories, 'income'),
    expenseByCategory: byCategory(window, categories, 'expense'),
    incomeBySource: bySource(window, 'income'),
    expenseBySource: bySource(window, 'expense'),

    fundBalances: balancesAtEnd,
    monthly: monthlyTotals(transactions, from, to),

    transactions: [...window].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference)),

    pendingCount: transactions.filter((t) => t.status === 'pending').length,
    reversalCount: window.filter((t) => t.reverses).length,
    overdrawnFunds: balancesAtEnd.filter((balance) => balance.balancePaise < 0),
  }
}

/**
 * Consistency check on a finished report.
 *
 * opening + income − expense should equal closing. If it does not, something is
 * wrong with the data rather than the arithmetic — an opening balance dated
 * inside the period, most often. Surfaced on the statement rather than hidden,
 * because a statement that silently does not balance is worse than no statement.
 */
export function reconcile(report: PeriodReport): { balanced: boolean; differencePaise: number } {
  const expected =
    report.openingBalancePaise + report.totals.incomePaise - report.totals.expensePaise
  const difference = report.closingBalancePaise - expected
  return { balanced: difference === 0, differencePaise: difference }
}
