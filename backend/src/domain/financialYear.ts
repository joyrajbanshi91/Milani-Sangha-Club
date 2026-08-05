import { FINANCIAL_YEAR_START_MONTH } from '../config/constants.js'
import { fundBalances, postedOnly, totalFundsPaise, type FundBalance } from './ledger.js'
import { financialYearOf } from './membership.js'
import type { Fund, Transaction, YearOpening } from './types.js'

/**
 * The club's year, and what it starts with.
 *
 * A club's accounts run in years — April to March here — and each year is presented,
 * argued over and adopted on its own. The figure that joins one year to the next is
 * the **carry-forward**: what the club held on 31 March becomes what it starts 1 April
 * with.
 *
 * That figure could simply be computed from the ledger, and until now it was. The club
 * asked for it to be *declared* instead, and they are right to. At the end of a year a
 * committee counts the cash box, reads the bank statement, argues about the difference,
 * and **adopts** an opening figure. What the ledger computes is a suggestion; what the
 * meeting agreed is the number the next year is built on. If they differ, that is a
 * fact worth seeing rather than papering over — which is why the difference is
 * recorded rather than silently accepted.
 *
 * ## What a `YearOpening` does
 *
 *   • It makes each year **independent**: figures for 2027-28 are its declared opening
 *     plus its own entries, not an accumulation from the beginning of time.
 *   • It **closes** the year before it. Once 2027-28 has been opened, 2026-27's figures
 *     are settled and nothing new can be dated into it — otherwise the carry-forward
 *     everybody agreed would quietly stop matching the year it came from.
 *
 * Everything here is a pure function over plain data.
 */

/** 1 April of the year that starts `financialYear`. */
export function yearStart(financialYear: string): string {
  const year = Number(financialYear.slice(0, 4))
  return `${year}-${String(FINANCIAL_YEAR_START_MONTH).padStart(2, '0')}-01`
}

/** 31 March of the year that ends `financialYear`. */
export function yearEnd(financialYear: string): string {
  const year = Number(financialYear.slice(0, 4)) + 1
  const date = new Date(Date.UTC(year, FINANCIAL_YEAR_START_MONTH - 1, 1))
  date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

export function yearRange(financialYear: string): { from: string; to: string } {
  return { from: yearStart(financialYear), to: yearEnd(financialYear) }
}

/** '2027-28' for '2026-27'. */
export function nextYear(financialYear: string): string {
  const start = Number(financialYear.slice(0, 4)) + 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** '2025-26' for '2026-27'. */
export function previousYear(financialYear: string): string {
  const start = Number(financialYear.slice(0, 4)) - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export function isFinancialYear(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

/**
 * The balances a period should be measured from.
 *
 * The latest declared opening at or before the period's start. "Latest at or before"
 * rather than "the year containing it" so that a report covering, say, the last week
 * of March and the first week of April still measures from a declared figure rather
 * than falling back to the beginning of the ledger.
 *
 * Null when the club has declared none, which is the ordinary state in a first year:
 * the funds' own opening balances then serve, exactly as before.
 */
export function baselineFor(
  openings: readonly YearOpening[],
  from: string
): { asOf: string; balances: Readonly<Record<string, number>> } | null {
  const candidates = openings
    .filter((opening) => yearStart(opening.financialYear) <= from)
    .sort((a, b) => yearStart(b.financialYear).localeCompare(yearStart(a.financialYear)))

  const latest = candidates[0]
  if (!latest) return null

  return { asOf: yearStart(latest.financialYear), balances: latest.balances }
}

/**
 * Is this year settled?
 *
 * A year is closed by the *existence of the next year's opening* rather than by a flag
 * of its own. One fact, recorded once: the committee adopted a carry-forward, and that
 * both opens the new year and settles the old one. A separate `closed` boolean would
 * be a second place for the same truth to live, and the two would eventually disagree.
 */
export function isYearClosed(openings: readonly YearOpening[], financialYear: string): boolean {
  return openings.some((opening) => opening.financialYear === nextYear(financialYear))
}

/** The year a date falls in, closed or not. */
export function isDateInClosedYear(
  openings: readonly YearOpening[],
  date: string
): { closed: true; financialYear: string } | { closed: false } {
  const year = financialYearOf(date)
  return isYearClosed(openings, year) ? { closed: true, financialYear: year } : { closed: false }
}

/**
 * The earliest date an entry may still be dated.
 *
 * The day after the last closed year ends. Used to move a late payment into the open
 * year rather than refusing it: the money did arrive, and a club that cannot record it
 * simply keeps it off the books.
 */
export function earliestOpenDate(openings: readonly YearOpening[]): string | null {
  const closed = openings
    .map((opening) => yearStart(opening.financialYear))
    .sort((a, b) => b.localeCompare(a))

  return closed[0] ?? null
}

export interface CarryForwardSuggestion {
  financialYear: string
  /** The year being closed to produce it. */
  fromYear: string
  /** What the ledger says, per fund, on the last day of `fromYear`. */
  balances: FundBalance[]
  totalPaise: number
  /** Entries still unapproved in the year being closed — they are not in the figures. */
  pendingCount: number
}

/**
 * What the ledger says the club held at the end of a year.
 *
 * The starting point the committee argues from, not the answer. `balances` is per
 * fund, because a club starts its year with a cash box and a bank account rather than
 * with a single number, and reconciling one total against three physical places is how
 * differences get lost.
 */
export function suggestCarryForward(input: {
  financialYear: string
  funds: readonly Fund[]
  transactions: readonly Transaction[]
  openings: readonly YearOpening[]
}): CarryForwardSuggestion {
  const { financialYear, funds, transactions, openings } = input
  const fromYear = previousYear(financialYear)
  const { from, to } = yearRange(fromYear)

  const baseline = baselineFor(openings, from)
  const balances = fundBalances(funds, transactions, to, baseline ?? undefined)

  return {
    financialYear,
    fromYear,
    balances,
    totalPaise: totalFundsPaise(balances),
    pendingCount: transactions.filter(
      (transaction) =>
        transaction.status === 'pending' && transaction.date >= from && transaction.date <= to
    ).length,
  }
}

/**
 * Does the club need to open a new year?
 *
 * True when today has moved into a financial year that has no declared opening, and
 * there is something in the previous year to carry forward. Both halves matter: a club
 * in its very first year has nothing to carry and should not be nagged, and a year
 * already opened should not be opened twice.
 *
 * This is what makes the year-end panel quiet for eleven months and impossible to miss
 * in the twelfth.
 */
export function needsOpening(input: {
  today: string
  transactions: readonly Transaction[]
  openings: readonly YearOpening[]
}): string | null {
  const current = financialYearOf(input.today)

  if (input.openings.some((opening) => opening.financialYear === current)) return null

  const before = yearStart(current)
  const anythingBefore = postedOnly(input.transactions).some(
    (transaction) => transaction.date < before
  )

  return anythingBefore ? current : null
}
