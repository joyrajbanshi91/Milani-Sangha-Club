import { Select } from '@/components/ui/Field'
import { type FinancePeriod } from '@/features/finance/period'
import { financialYears, monthLabel, monthsOfFinancialYear } from '@/features/finance/years'

/**
 * Choose a whole club year, or one month of it.
 *
 * The year select is always there, because the year is the frame everything else sits
 * in: an officer picks 2026-27 and then decides whether they want all of it or August of
 * it. Switching a year keeps the month's position — April stays April — so stepping
 * between years compares like with like.
 *
 * Two selects rather than `<input type="month">`, which Safari does not support and
 * renders as a text box; the first character typed became the value, the API correctly
 * refused `?month=2`, and the dashboard blamed itself. A select cannot produce a value
 * the server will reject.
 *
 * Neither list offers what the club has no books for: the years start at
 * `FIRST_FINANCIAL_YEAR` and stop at the one the club is in.
 */
export function PeriodPicker({
  period,
  onChange,
}: {
  period: FinancePeriod
  onChange: (period: FinancePeriod) => void
}) {
  const years = financialYears()

  const year =
    period.kind === 'year'
      ? period.financialYear
      : (years.find((option) => monthsOfFinancialYear(option).includes(period.month)) ??
        (years[years.length - 1] as string))

  const months = monthsOfFinancialYear(year)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-ink-600">
        <span className="mb-1 block">Club year</span>
        <Select
          className="h-10"
          value={year}
          onChange={(event) => {
            const next = event.target.value
            if (period.kind === 'year') {
              onChange({ kind: 'year', financialYear: next })
              return
            }

            // Same month of the new year, so April 2026 becomes April 2027 rather than
            // jumping to whatever the list happens to start with.
            const position = months.indexOf(period.month)
            const replacement = monthsOfFinancialYear(next)
            onChange({ kind: 'month', month: replacement[position >= 0 ? position : 0] as string })
          }}
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-xs font-medium text-ink-600">
        <span className="mb-1 block">Showing</span>
        <Select
          className="h-10"
          value={period.kind === 'year' ? 'year' : period.month}
          onChange={(event) => {
            const value = event.target.value
            onChange(
              value === 'year'
                ? { kind: 'year', financialYear: year }
                : { kind: 'month', month: value }
            )
          }}
        >
          {/*
            The whole year first, and named as such.

            It is the figure a committee meeting asks for, and burying it under twelve
            months would repeat the problem this control was added to fix. "The whole year"
            rather than "All" because the club's year is not the calendar's, and a reader
            needs to know which twelve months they are being shown.
          */}
          <option value="year">The whole year ({year})</option>
          {months.map((option) => (
            <option key={option} value={option}>
              {monthLabel(option)}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}
