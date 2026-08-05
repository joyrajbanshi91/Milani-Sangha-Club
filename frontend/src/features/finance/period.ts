import { FINANCIAL_YEAR_START_MONTH } from '@/config/constants'
import {
  financialYearOf,
  financialYearStart,
  financialYears,
  monthLabel,
  monthsOfFinancialYear,
} from '@/features/finance/years'

/**
 * The stretch of time a finance screen is showing.
 *
 * The dashboard began as a month at a time, which is the wrong default for a club
 * committee: the question asked at a meeting is "how did the year go", and answering it
 * meant opening twelve months one after another and adding up on paper. A month is the
 * *detail* view, not the whole of it.
 *
 * Two kinds rather than a free pair of dates, because these are the two periods a club
 * actually reasons in — its year, and a month within it. A date range is still offered on
 * the statements page, where an arbitrary period is occasionally genuinely wanted.
 *
 * The API takes either `?month=` or `?from=&to=`, so a year needs no server change: it
 * is 1 April to 31 March, sent as a range.
 */
export type FinancePeriod =
  | { kind: 'month'; month: string }
  | { kind: 'year'; financialYear: string }

/** 1 April to 31 March of a club year, derived from the start month rather than assumed. */
export function financialYearRange(financialYear: string): { from: string; to: string } {
  const start = financialYearStart(financialYear)
  const from = `${start}-${String(FINANCIAL_YEAR_START_MONTH).padStart(2, '0')}-01`

  // Day 0 of the start month is the last day of the month before it — 31 March here,
  // without a table of month lengths or a leap-year special case.
  const end = new Date(Date.UTC(start + 1, FINANCIAL_YEAR_START_MONTH - 1, 0))

  return { from, to: end.toISOString().slice(0, 10) }
}

/** The first and last day of a calendar month, 'YYYY-MM' in. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const end = new Date(Date.UTC(year, monthNumber, 0))

  return { from: `${month}-01`, to: end.toISOString().slice(0, 10) }
}

export function periodRange(period: FinancePeriod): { from: string; to: string } {
  return period.kind === 'year'
    ? financialYearRange(period.financialYear)
    : monthRange(period.month)
}

/** The club year a period sits in. A month picks the year that contains it. */
export function periodYear(period: FinancePeriod): string {
  return period.kind === 'year'
    ? period.financialYear
    : financialYearOf(new Date(`${period.month}-01T00:00:00Z`))
}

/**
 * What to send the API.
 *
 * A month goes as `?month=`, so the server does the month arithmetic and the URL stays
 * readable in a log. A year goes as a range, which is all a year is.
 */
export function periodParams(period: FinancePeriod): { month?: string; from?: string; to?: string } {
  return period.kind === 'month' ? { month: period.month } : periodRange(period)
}

/** 'August 2026', or 'April 2026 – March 2027'. */
export function periodLabel(period: FinancePeriod): string {
  if (period.kind === 'month') return monthLabel(period.month)

  const { from, to } = financialYearRange(period.financialYear)
  return `${monthLabel(from.slice(0, 7))} – ${monthLabel(to.slice(0, 7))}`
}

/**
 * Does this period include today?
 *
 * Decides whether a closing balance may be called "held now". For a period that ended
 * in March, "Total held now" is a plain untruth — it is what the club held then, and a
 * committee reading last year's figures should not be told otherwise.
 */
export function periodCoversToday(period: FinancePeriod, today: Date = new Date()): boolean {
  const iso = today.toISOString().slice(0, 10)
  const { from, to } = periodRange(period)
  return from <= iso && iso <= to
}

/** The current club year, whole. What a committee wants to see first. */
export function defaultPeriod(today: Date = new Date()): FinancePeriod {
  const years = financialYears(today)
  return { kind: 'year', financialYear: years[years.length - 1] as string }
}

/**
 * The period a URL is asking for.
 *
 * `?year=2026-27` or `?month=2026-08`. Kept in the address bar so a view can be
 * bookmarked, sent to another office bearer, and survive a page reload — the figures for
 * a particular year are exactly the sort of thing one bearer pastes to another before a
 * meeting.
 *
 * Anything unrecognised, or a year the club has no books for, falls back to the default
 * rather than showing an empty screen a reader would take for "no money".
 */
export function readPeriod(search: URLSearchParams, today: Date = new Date()): FinancePeriod {
  const years = financialYears(today)

  const year = search.get('year')
  if (year && years.includes(year)) return { kind: 'year', financialYear: year }

  const month = search.get('month')
  if (month && years.some((option) => monthsOfFinancialYear(option).includes(month))) {
    return { kind: 'month', month }
  }

  return defaultPeriod(today)
}

/** The query string for a period, for links and for the address bar. */
export function writePeriod(period: FinancePeriod): Record<string, string> {
  return period.kind === 'year' ? { year: period.financialYear } : { month: period.month }
}
