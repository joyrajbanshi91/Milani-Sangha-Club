import type { MonthStatus } from '@/features/payments/api'

/**
 * Reasoning about a chosen run of months.
 *
 * Kept apart from `MonthPicker.tsx` so that file exports only its component — a
 * module mixing components with plain functions breaks React fast refresh, and the
 * warning is worth heeding rather than silencing.
 */

export interface MonthSelection {
  start: string
  end: string
}

/**
 * Months inside a selection that have already been paid.
 *
 * A range can straddle one: a member who paid June, then selects May to July, has
 * asked for something the server will refuse. Naming the month is the difference
 * between a form that explains itself and one that just will not submit.
 */
export function paidMonthsInside(
  months: MonthStatus[],
  selection: MonthSelection | null
): MonthStatus[] {
  if (!selection) return []
  return months.filter(
    (month) => month.paid && month.month >= selection.start && month.month <= selection.end
  )
}

/** How many months a selection covers. Zero when nothing is chosen. */
export function selectedCount(months: MonthStatus[], selection: MonthSelection | null): number {
  if (!selection) return 0
  return months.filter((month) => month.month >= selection.start && month.month <= selection.end)
    .length
}
