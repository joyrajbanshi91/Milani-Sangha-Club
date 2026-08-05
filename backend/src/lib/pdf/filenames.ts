import { lastDayOfMonth } from '../../domain/report.js'
import { slugForFilename } from './brand.js'
import type { ReportDetail } from './financeReport.js'

/**
 * What the club's documents are called when they land in somebody's downloads folder.
 *
 * `statement.pdf` and `receipt.pdf` are useless names. Two downloads of the same
 * period — one before a correction, one after — arrive as `statement.pdf` and
 * `statement(1).pdf` with nothing to tell them apart, which is how a committee ends
 * up reading last week's figures. And a member with a folder of `receipt.pdf`,
 * `receipt(1).pdf`, `receipt(2).pdf` cannot find the one for last April.
 *
 * So every document carries four things in its name: **the club**, **what it is**,
 * **what it covers**, and **a date** — and the dates are labelled, because a bare
 * date in a filename could be any of three things.
 *
 *   New-Milani-Sangha-Club-receipt-RCT-2026-000001-paid-2026-06-11.pdf
 *   New-Milani-Sangha-Club-statement-summary-2026-04-issued-2026-08-05.pdf
 */

export function receiptFilename(input: {
  clubName: string
  receiptNumber: string
  /** The day the member paid, which is the date they will look for. */
  paidOn: string
}): string {
  return [
    slugForFilename(input.clubName),
    'receipt',
    slugForFilename(input.receiptNumber),
    `paid-${input.paidOn}`,
  ].join('-') + '.pdf'
}

/**
 * The statement's name.
 *
 * A period that is exactly one calendar month is named as that month, because that is
 * how a committee refers to it — `2026-04`, not `2026-04-01-to-2026-04-30`. A club
 * year comes out as its two dates, which is unambiguous and sorts correctly.
 */
export function statementFilename(input: {
  clubName: string
  detail: ReportDetail
  from: string
  to: string
  issuedOn: string
}): string {
  const wholeMonth =
    input.from.slice(0, 7) === input.to.slice(0, 7) &&
    input.from.endsWith('-01') &&
    input.to === lastDayOfMonth(input.to)

  const period = wholeMonth ? input.from.slice(0, 7) : `${input.from}-to-${input.to}`

  return [
    slugForFilename(input.clubName),
    'statement',
    input.detail,
    period,
    `issued-${input.issuedOn}`,
  ].join('-') + '.pdf'
}
