import { FINANCIAL_YEAR_START_MONTH, FIRST_FINANCIAL_YEAR } from '@/config/constants'

/**
 * The club's years, in the browser.
 *
 * Mirrors the halves of `backend/src/domain/financialYear.ts` that the screens need.
 * Duplicated rather than fetched: a year picker that cannot render until a request
 * comes back is a worse trade than twenty lines of calendar arithmetic, and the one
 * value that must not drift — where the year starts — is a shared constant checked by
 * `npm run check:constants`.
 */

/** '2026-27' for any date in April 2026 – March 2027. */
export function financialYearOf(date: Date): string {
  const year = date.getUTCFullYear()
  // April to December belong to the year that starts them; January to March belong to
  // the year before, which is the half people get wrong.
  const start = date.getUTCMonth() + 1 >= FINANCIAL_YEAR_START_MONTH ? year : year - 1
  return label(start)
}

function label(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function financialYearStart(financialYear: string): number {
  return Number(financialYear.slice(0, 4))
}

export function nextFinancialYear(financialYear: string): string {
  return label(financialYearStart(financialYear) + 1)
}

export function previousFinancialYear(financialYear: string): string {
  return label(financialYearStart(financialYear) - 1)
}

/**
 * Every year the club has, oldest first.
 *
 * From the year the club started keeping books here up to the one it is in — never
 * earlier, and never a year that has not begun. A picker offering 2024-25 can only
 * ever show an empty register, and one offering next year invites closing the year the
 * club is living in.
 */
export function financialYears(today: Date = new Date()): string[] {
  const first = financialYearStart(FIRST_FINANCIAL_YEAR)
  const current = financialYearStart(financialYearOf(today))

  if (current < first) return [FIRST_FINANCIAL_YEAR]

  return Array.from({ length: current - first + 1 }, (_, index) => label(first + index))
}

/** The twelve calendar months of a financial year, April first. */
export function monthsOfFinancialYear(financialYear: string): string[] {
  const start = financialYearStart(financialYear)

  return Array.from({ length: 12 }, (_, index) => {
    const absolute = FINANCIAL_YEAR_START_MONTH - 1 + index
    const year = start + Math.floor(absolute / 12)
    return `${year}-${String((absolute % 12) + 1).padStart(2, '0')}`
  })
}

/** 'August 2026' from '2026-08'. */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Years the club could close, given what it has already opened.
 *
 * A year can be opened once it has begun, and opening it closes the one before. The
 * club's first year is excluded: closing the year before it would settle a period this
 * system has no record of, which is a meaningless act rather than a dangerous one, but
 * a dropdown should not offer it.
 */
export function openableYears(opened: readonly string[], today: Date = new Date()): string[] {
  const already = new Set(opened)

  return financialYears(today)
    .filter((year) => year !== FIRST_FINANCIAL_YEAR)
    .filter((year) => !already.has(year))
}
