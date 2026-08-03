import { sumPaise } from './money.js'
import type { Category, Fund, Transaction } from './types.js'

/**
 * Balance and rollup calculations.
 *
 * One rule governs everything here: **only approved transactions count**, which
 * means 'posted' and 'reversed' (see `postedOnly` for why a reversed entry still
 * counts). A pending entry has not been agreed by two officers; a rejected or
 * discarded one never moved money. Every function filters through that one gate,
 * rather than trusting the caller to have done it.
 */

/**
 * Entries that count towards a balance — the single gate every calculation
 * passes through.
 *
 * Includes `reversed` as well as `posted`, which looks wrong at first glance and
 * is not. A reversed entry *did* happen: two officers approved it and it moved
 * money. Cancelling it posts an equal and opposite entry, and that pair offsets to
 * zero. Excluding the original while counting its reversal applies the correction
 * twice — a cancelled ₹1,250 expense would *increase* the balance by ₹1,250.
 *
 * Keeping both also means a reversal lands in the period it was made, instead of
 * retroactively altering a statement the committee has already adopted.
 *
 * `pending`, `rejected` and `discarded` never moved money and never count.
 */
export function postedOnly(transactions: readonly Transaction[]): Transaction[] {
  return transactions.filter(
    (transaction) => transaction.status === 'posted' || transaction.status === 'reversed'
  )
}

export function inPeriod(
  transactions: readonly Transaction[],
  from: string,
  to: string
): Transaction[] {
  // ISO dates compare correctly as strings; `to` is inclusive.
  return transactions.filter((t) => t.date >= from && t.date <= to)
}

export interface FundBalance {
  fundId: string
  fundName: string
  kind: Fund['kind']
  openingBalancePaise: number
  inPaise: number
  outPaise: number
  balancePaise: number
}

/**
 * Closing balance for every fund.
 *
 * A transfer is deliberately counted twice — out of one fund, into the other — so
 * moving cash to the bank changes neither the total nor the audit trail.
 */
export function fundBalances(
  funds: readonly Fund[],
  transactions: readonly Transaction[],
  asOf?: string
): FundBalance[] {
  const posted = postedOnly(transactions).filter((t) => (asOf ? t.date <= asOf : true))

  return funds.map((fund) => {
    let inPaise = 0
    let outPaise = 0

    for (const transaction of posted) {
      if (transaction.kind === 'income' && transaction.fundId === fund.id) {
        inPaise += transaction.amountPaise
      } else if (transaction.kind === 'expense' && transaction.fundId === fund.id) {
        outPaise += transaction.amountPaise
      } else if (transaction.kind === 'transfer') {
        if (transaction.fundId === fund.id) outPaise += transaction.amountPaise
        if (transaction.toFundId === fund.id) inPaise += transaction.amountPaise
      }
    }

    return {
      fundId: fund.id,
      fundName: fund.name,
      kind: fund.kind,
      openingBalancePaise: fund.openingBalancePaise,
      inPaise,
      outPaise,
      balancePaise: fund.openingBalancePaise + inPaise - outPaise,
    }
  })
}

/** Total money the club holds across every fund. */
export function totalFundsPaise(balances: readonly FundBalance[]): number {
  return sumPaise(balances.map((balance) => balance.balancePaise))
}

export interface Rollup {
  key: string
  label: string
  amountPaise: number
  /** Share of the section total, 0–100, rounded to one decimal. */
  sharePercent: number
  count: number
}

function toRollups(
  entries: Map<string, { label: string; amountPaise: number; count: number }>
): Rollup[] {
  const total = sumPaise([...entries.values()].map((entry) => entry.amountPaise))

  return [...entries.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      amountPaise: entry.amountPaise,
      count: entry.count,
      sharePercent: total === 0 ? 0 : Math.round((entry.amountPaise / total) * 1000) / 10,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise)
}

/** Income or expense grouped by category. Transfers are excluded by definition. */
export function byCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  kind: 'income' | 'expense'
): Rollup[] {
  const names = new Map(categories.map((category) => [category.id, category.name]))
  const entries = new Map<string, { label: string; amountPaise: number; count: number }>()

  for (const transaction of postedOnly(transactions)) {
    if (transaction.kind !== kind || !transaction.categoryId) continue
    const key = transaction.categoryId
    const existing = entries.get(key) ?? {
      label: names.get(key) ?? 'Uncategorised',
      amountPaise: 0,
      count: 0,
    }
    existing.amountPaise += transaction.amountPaise
    existing.count += 1
    entries.set(key, existing)
  }

  return toRollups(entries)
}

/**
 * Money grouped by where it came from — the "collection from different sources"
 * view. Sources are free text, so they are grouped case-insensitively with the
 * first spelling encountered used as the label.
 */
export function bySource(
  transactions: readonly Transaction[],
  kind: 'income' | 'expense'
): Rollup[] {
  const entries = new Map<string, { label: string; amountPaise: number; count: number }>()

  for (const transaction of postedOnly(transactions)) {
    if (transaction.kind !== kind) continue
    const label = transaction.source.trim() || 'Unspecified'
    const key = label.toLowerCase()
    const existing = entries.get(key) ?? { label, amountPaise: 0, count: 0 }
    existing.amountPaise += transaction.amountPaise
    existing.count += 1
    entries.set(key, existing)
  }

  return toRollups(entries)
}

/** Income and expense per calendar month in a period, for the trend chart. */
export function monthlyTotals(
  transactions: readonly Transaction[],
  from: string,
  to: string
): Array<{ month: string; incomePaise: number; expensePaise: number; netPaise: number }> {
  const months = new Map<string, { incomePaise: number; expensePaise: number }>()

  // Seed every month in the range, so a month with no activity still shows as a
  // zero rather than being silently missing from the chart.
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`)
  while (cursor <= end) {
    months.set(cursor.toISOString().slice(0, 7), { incomePaise: 0, expensePaise: 0 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  for (const transaction of inPeriod(postedOnly(transactions), from, to)) {
    const month = transaction.date.slice(0, 7)
    const existing = months.get(month) ?? { incomePaise: 0, expensePaise: 0 }
    if (transaction.kind === 'income') existing.incomePaise += transaction.amountPaise
    if (transaction.kind === 'expense') existing.expensePaise += transaction.amountPaise
    months.set(month, existing)
  }

  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({
      month,
      ...totals,
      netPaise: totals.incomePaise - totals.expensePaise,
    }))
}

export interface PeriodTotals
  extends Record<'incomePaise' | 'expensePaise' | 'netPaise' | 'transferPaise', number> {
  transactionCount: number
}

export function periodTotals(
  transactions: readonly Transaction[],
  from: string,
  to: string
): PeriodTotals {
  const window = inPeriod(postedOnly(transactions), from, to)

  const incomePaise = sumPaise(
    window.filter((t) => t.kind === 'income').map((t) => t.amountPaise)
  )
  const expensePaise = sumPaise(
    window.filter((t) => t.kind === 'expense').map((t) => t.amountPaise)
  )
  const transferPaise = sumPaise(
    window.filter((t) => t.kind === 'transfer').map((t) => t.amountPaise)
  )

  return {
    incomePaise,
    expensePaise,
    netPaise: incomePaise - expensePaise,
    transferPaise,
    transactionCount: window.length,
  }
}

/**
 * Opening balance for a period: everything posted strictly before it starts.
 * Used so a statement reads opening → movement → closing and ties to the funds.
 */
export function openingTotalPaise(
  funds: readonly Fund[],
  transactions: readonly Transaction[],
  from: string
): number {
  const before = postedOnly(transactions).filter((t) => t.date < from)
  return totalFundsPaise(fundBalances(funds, before))
}
