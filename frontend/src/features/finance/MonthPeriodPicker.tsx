import { Select } from '@/components/ui/Field'
import {
  financialYearOf,
  financialYears,
  monthLabel,
  monthsOfFinancialYear,
} from '@/features/finance/years'

/**
 * Choose a month, as a financial year and a month within it.
 *
 * Replaces `<input type="month">`, which looked like the obvious control and was the
 * cause of a real bug: **Safari does not support it.** There it renders as a plain text
 * box, so the first character an officer types becomes the value — `2`, or `Aug` — the
 * request goes out as `?month=2`, the API correctly refuses a malformed month, and the
 * dashboard says "The figures could not be loaded. Is the API running?" The API was
 * running perfectly.
 *
 * Two selects cannot produce a value the server will reject, work identically in every
 * browser, and read the way a committee talks: "August 2026, in 2026-27". They also
 * stop offering months the club has no books for — the list starts at the year the club
 * started, rather than at whatever year the browser's date picker felt like showing.
 */
export function MonthPeriodPicker({
  month,
  onChange,
  label = 'Month',
}: {
  /** 'YYYY-MM'. */
  month: string
  onChange: (month: string) => void
  label?: string
}) {
  const years = financialYears()
  const year = financialYearOf(new Date(`${month}-01T00:00:00Z`))

  // A month outside the years on offer — a stale bookmark, or a club whose first year
  // has been moved — falls back to the latest year rather than showing a blank select.
  const selectedYear = years.includes(year) ? year : (years[years.length - 1] as string)
  const months = monthsOfFinancialYear(selectedYear)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-ink-600">
        <span className="mb-1 block">Club year</span>
        <Select
          className="h-10"
          value={selectedYear}
          onChange={(event) => {
            // Keep the same position in the year — April stays April — so stepping
            // between years compares like with like.
            const position = months.indexOf(month)
            const next = monthsOfFinancialYear(event.target.value)
            onChange(next[position >= 0 ? position : 0] as string)
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
        <span className="mb-1 block">{label}</span>
        <Select
          className="h-10"
          value={months.includes(month) ? month : (months[0] as string)}
          onChange={(event) => onChange(event.target.value)}
        >
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
