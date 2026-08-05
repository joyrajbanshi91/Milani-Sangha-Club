import {
  FINANCIAL_YEAR_START_MONTH,
  MEMBERSHIP_DUES,
} from '../config/constants.js'
import type { Payment } from './types.js'

/**
 * The membership register: which months a member has paid for, and which they owe.
 *
 * A club's subscription year is a calendar of twelve boxes, and everything here is
 * about filling them in. Two decisions shape the module:
 *
 *   • **A month is the unit.** Not a date range, not a duration — 'YYYY-MM'. A
 *     member pays for April, or for April to March; nobody pays for the 14th of
 *     June. Months sort correctly as strings, compare exactly, and cannot drift by
 *     a day when a time zone changes underneath them.
 *
 *   • **Paid months are derived from payments, never stored.** There is no
 *     "months_paid: 7" column anywhere, because the moment one exists it can
 *     disagree with the money — a payment reversed, an entry corrected, a receipt
 *     cancelled, and the count says something the ledger does not. The register is
 *     recomputed from the approved declarations every time it is asked for.
 *
 * Everything is a pure function over plain data, so the register can be tested
 * exhaustively without a database — and the same functions answer both the member's
 * own page and the officers' roster, so the two can never disagree.
 */

/** 'YYYY-MM'. */
export type Month = string

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: string): boolean {
  return MONTH_PATTERN.test(value)
}

/** '2026-27' — the financial year a date or month falls in. */
export function financialYearOf(isoDateOrMonth: string): string {
  const year = Number(isoDateOrMonth.slice(0, 4))
  const month = Number(isoDateOrMonth.slice(5, 7))

  // April to December belong to the year that starts them; January to March belong
  // to the year before, which is the half of this that people get wrong.
  const startYear = month >= FINANCIAL_YEAR_START_MONTH ? year : year - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** The calendar year the given financial year starts in. 2026 for '2026-27'. */
export function financialYearStart(financialYear: string): number {
  return Number(financialYear.slice(0, 4))
}

/** Twelve months in order, April first. */
export function monthsOfFinancialYear(financialYear: string): Month[] {
  const start = financialYearStart(financialYear)

  return Array.from({ length: MEMBERSHIP_DUES.monthsInYear }, (_, index) => {
    const absolute = FINANCIAL_YEAR_START_MONTH - 1 + index
    const year = start + Math.floor(absolute / 12)
    const month = (absolute % 12) + 1
    return `${year}-${String(month).padStart(2, '0')}`
  })
}

/** Inclusive list of months from `start` to `end`. Empty if the order is wrong. */
export function monthsBetween(start: Month, end: Month): Month[] {
  if (!isMonth(start) || !isMonth(end) || end < start) return []

  const months: Month[] = []
  let year = Number(start.slice(0, 4))
  let month = Number(start.slice(5, 7))

  for (let guard = 0; guard < 600; guard += 1) {
    const current = `${year}-${String(month).padStart(2, '0')}`
    months.push(current)
    if (current === end) return months

    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  // 50 years of months. Anything longer is a typo, not a subscription.
  return months
}

/** 'April 2026'. */
export function monthName(month: Month): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** 'Apr 26', for the twelve-box grid where the long form will not fit. */
export function shortMonthName(month: Month): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

/**
 * What a given number of months of membership costs.
 *
 * A full year is charged at the yearly rate rather than twelve times the monthly
 * one. They happen to be equal today — ₹50 × 12 is exactly ₹600 — so this looks like
 * a distinction without a difference, and it is the distinction that matters: the
 * club will one day discount the annual rate, and when they do, this is the only
 * function that changes and every screen and receipt follows.
 */
export function duesForMonths(count: number): number {
  if (count <= 0) return 0

  const years = Math.floor(count / MEMBERSHIP_DUES.monthsInYear)
  const remainder = count % MEMBERSHIP_DUES.monthsInYear

  return years * MEMBERSHIP_DUES.yearlyPaise + remainder * MEMBERSHIP_DUES.monthlyPaise
}

/** One box in the member's year. */
export interface MonthStatus {
  month: Month
  label: string
  short: string
  paid: boolean
  /** The month has begun and is unpaid — money the club is owed now. */
  overdue: boolean
  /** Which declaration paid for it, so the member can find their receipt. */
  paymentId?: string
  paymentReference?: string
  receiptNumber?: string
}

export interface MembershipStatus {
  financialYear: string
  /** 'April 2026 to March 2027'. */
  label: string
  months: MonthStatus[]

  monthsPaid: number
  monthsUnpaid: number
  /** Unpaid months that have already begun. The number that means "chase this". */
  monthsOverdue: number

  paidPaise: number
  /** What the remaining months of the year would cost. */
  outstandingPaise: number
  /** Of the outstanding, the part already due. */
  overduePaise: number

  paidInFull: boolean
  /** No payment at all this year. */
  nothingPaid: boolean
}

/**
 * Which months a payment covers.
 *
 * Only an approved membership declaration counts. A declaration still awaiting
 * verification has not been checked against the club's records, so treating it as
 * paid would let a member mark their own year settled by filling in a form.
 */
export function monthsCoveredBy(payment: Payment): Month[] {
  if (payment.purpose !== 'membership') return []
  if (!payment.periodStart || !payment.periodEnd) return []
  return monthsBetween(payment.periodStart, payment.periodEnd)
}

/** Months a member has claimed but nobody has verified yet. */
export function monthsAwaitingVerification(payments: readonly Payment[]): Month[] {
  return payments
    .filter((payment) => payment.status === 'pending_verification')
    .flatMap(monthsCoveredBy)
}

/**
 * Build a member's register for one financial year.
 *
 * `today` decides which unpaid months count as overdue, and is passed in rather than
 * read from the clock so the same register can be rendered for a past year, and so
 * the tests do not depend on the day they run.
 */
export function membershipStatus(input: {
  financialYear: string
  /** All of one member's declarations. Filtering to approved happens here. */
  payments: readonly Payment[]
  /** 'YYYY-MM-DD'. */
  today: string
}): MembershipStatus {
  const { financialYear, payments, today } = input
  const currentMonth = today.slice(0, 7)

  const paidBy = new Map<Month, Payment>()
  for (const payment of payments) {
    if (payment.status !== 'approved') continue
    for (const month of monthsCoveredBy(payment)) {
      // First payment wins if two somehow cover the same month; the overlap guard on
      // submission is what stops that happening, and a duplicate must not silently
      // renumber which receipt a month belongs to.
      if (!paidBy.has(month)) paidBy.set(month, payment)
    }
  }

  const months: MonthStatus[] = monthsOfFinancialYear(financialYear).map((month) => {
    const payment = paidBy.get(month)

    return {
      month,
      label: monthName(month),
      short: shortMonthName(month),
      paid: payment !== undefined,
      overdue: payment === undefined && month <= currentMonth,
      ...(payment
        ? {
            paymentId: payment.id,
            paymentReference: payment.reference,
            ...(payment.receiptNumber ? { receiptNumber: payment.receiptNumber } : {}),
          }
        : {}),
    }
  })

  const paid = months.filter((month) => month.paid).length
  const overdue = months.filter((month) => month.overdue).length
  const unpaid = months.length - paid

  const start = monthsOfFinancialYear(financialYear)[0] as Month
  const end = monthsOfFinancialYear(financialYear)[11] as Month

  return {
    financialYear,
    label: `${monthName(start)} to ${monthName(end)}`,
    months,

    monthsPaid: paid,
    monthsUnpaid: unpaid,
    monthsOverdue: overdue,

    paidPaise: duesForMonths(paid),
    outstandingPaise: duesForMonths(unpaid),
    overduePaise: duesForMonths(overdue),

    paidInFull: unpaid === 0,
    nothingPaid: paid === 0,
  }
}

/**
 * Check a requested period before a member declares it.
 *
 * Returns the months, or an explanation. Two things are refused, and both exist so
 * that "how many months are left" stays a true statement rather than an estimate:
 * a period that runs outside one financial year, and one that covers a month the
 * member has already paid for or already claimed.
 */
export function validateMembershipPeriod(input: {
  periodStart: Month
  periodEnd: Month
  /** Every existing declaration by this member, of any status. */
  existing: readonly Payment[]
}): { ok: true; months: Month[] } | { ok: false; code: string; reason: string } {
  const { periodStart, periodEnd, existing } = input

  if (!isMonth(periodStart) || !isMonth(periodEnd)) {
    return { ok: false, code: 'period', reason: 'Choose which months you are paying for.' }
  }
  if (periodEnd < periodStart) {
    return { ok: false, code: 'period', reason: 'The last month cannot be before the first.' }
  }

  const months = monthsBetween(periodStart, periodEnd)

  if (months.length > MEMBERSHIP_DUES.monthsInYear) {
    return {
      ok: false,
      code: 'period',
      reason: `A single payment can cover at most ${MEMBERSHIP_DUES.monthsInYear} months. Pay one year at a time.`,
    }
  }

  // One financial year per payment. A period spanning two would have to be split
  // across two registers, and the receipt could not name the year it was for.
  if (financialYearOf(periodStart) !== financialYearOf(periodEnd)) {
    return {
      ok: false,
      code: 'period',
      reason:
        `A membership year runs April to March, so one payment cannot cross two of them. ` +
        `${monthName(periodStart)} is in ${financialYearOf(periodStart)} and ${monthName(periodEnd)} is in ${financialYearOf(periodEnd)}.`,
    }
  }

  const taken = new Map<Month, Payment>()
  for (const payment of existing) {
    if (payment.status !== 'approved' && payment.status !== 'pending_verification') continue
    for (const month of monthsCoveredBy(payment)) taken.set(month, payment)
  }

  const clash = months.map((month) => taken.get(month)).find((payment) => payment !== undefined)

  if (clash) {
    const overlapping = months.filter((month) => taken.get(month) === clash)
    return {
      ok: false,
      code: 'months_already_covered',
      reason:
        `${overlapping.map(monthName).join(', ')} ${overlapping.length === 1 ? 'is' : 'are'} already ` +
        `${clash.status === 'approved' ? 'paid' : 'awaiting verification'} under ${clash.reference}.`,
    }
  }

  return { ok: true, months }
}
