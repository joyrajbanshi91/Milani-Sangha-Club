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
 * `receipt(1).pdf` cannot find the one for last April.
 *
 * So every name leads with what the document is and then **the period it covers**,
 * which is what the club asked for and what a downloads folder sorts on:
 *
 *   Statement_2026-04_summary.pdf
 *   Statement_2026-04-01_to_2027-03-31_detailed.pdf
 *   Receipt_2026-06-11_RCT-2026-000004.pdf
 *
 * The club's name is deliberately not in them any more. It was, and it pushed the
 * date to the middle of a name too long to read in a file dialog — and every one of
 * these files belongs to one club, so the name was the least useful part of it.
 */

/** '2026-04' for a whole calendar month, otherwise '2026-04-01_to_2027-03-31'. */
function periodPart(from: string, to: string): string {
  const wholeMonth =
    from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && to === lastDayOfMonth(to)

  return wholeMonth ? from.slice(0, 7) : `${from}_to_${to}`
}

export function receiptFilename(input: {
  receiptNumber: string
  /** The day the member paid, which is the date they will look for. */
  paidOn: string
}): string {
  return `Receipt_${input.paidOn}_${slugForFilename(input.receiptNumber)}.pdf`
}

/**
 * The statement's name.
 *
 * The detail stays in it, after the period, because the summary and the detailed
 * statement cover the same dates and show different totals — which is the confusion
 * this whole scheme exists to prevent.
 */
export function statementFilename(input: {
  detail: ReportDetail
  from: string
  to: string
}): string {
  return `Statement_${periodPart(input.from, input.to)}_${input.detail}.pdf`
}
