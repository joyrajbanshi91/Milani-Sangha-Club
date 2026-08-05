import { Check } from 'lucide-react'

import type { MonthStatus } from '@/features/payments/api'
import type { MonthSelection } from '@/features/payments/monthSelection'
import { cn } from '@/lib/cn'

/**
 * Pick the months you are paying for, by clicking them.
 *
 * This replaced a pair of `<input type="month">` boxes that started empty. Because
 * they were empty, the month count was zero, the amount showed ₹0.00 and the submit
 * button was disabled — the form looked broken the moment anybody chose "particular
 * months", which is exactly what the club reported. A member should not have to type
 * `2026-07` into a date widget to pay their subscription in any case: the twelve
 * months of their year are already on the screen above, so they are the control.
 *
 * ## How the selection works
 *
 * One click sets a single month. A second click extends to make a range — in either
 * direction, so it does not matter whether you click August then April or the other
 * way round. A third click starts again. That is the whole interaction, and it is the
 * one people already know from picking dates in a calendar.
 *
 * Whether a click starts a run or ends one is the caller's business, not this
 * component's: the form pre-selects the member's first unpaid month, and that
 * pre-selection must **not** behave like a half-finished range. Somebody arriving with
 * April already highlighted and clicking June means "June", not "April to June". So
 * the anchor lives with the state that knows where the selection came from, and this
 * component only reports which month was clicked.
 *
 * ## Why a contiguous range rather than a scatter of ticks
 *
 * A payment carries one period, `periodStart` to `periodEnd`, because that is what
 * goes on a receipt: "April 2026 to June 2026" is a sentence, and "April, June and
 * September" is a list that no receipt or ledger description reads well. A member who
 * genuinely wants non-adjacent months makes two declarations, which is also what the
 * money usually was.
 *
 * Months already paid cannot be selected and cannot sit inside a range — the server
 * refuses that, and refusing it here means the member finds out while looking at the
 * month rather than after filling in the rest of the form.
 */

export function MonthPicker({
  months,
  selection,
  onSelect,
  disabled = false,
}: {
  months: MonthStatus[]
  selection: MonthSelection | null
  /** The month that was clicked. The caller decides what that means. */
  onSelect: (month: string) => void
  disabled?: boolean
}) {
  const inRange = (month: string) =>
    selection !== null && month >= selection.start && month <= selection.end

  return (
    <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6" role="group" aria-label="Months to pay for">
      {months.map((month) => {
        const selected = inRange(month.month)

        /**
         * Spelled out for the label, abbreviated on screen.
         *
         * The box reads "Jun 26" because twelve of them have to fit; that is a poor
         * thing to hear read aloud, and it says nothing about whether the month is
         * paid or selectable. The accessible name carries the whole state.
         */
        const description = month.paid
          ? `${month.label} — already paid`
          : selected
            ? `${month.label} — selected`
            : `${month.label} — click to select`

        return (
          <li key={month.month}>
            <button
              type="button"
              disabled={disabled || month.paid}
              aria-pressed={selected}
              aria-label={description}
              onClick={() => onSelect(month.month)}
              title={description}
              className={cn(
                'flex h-12 w-full flex-col items-center justify-center rounded-lg border text-[11px] transition-colors',
                month.paid
                  ? 'cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-700'
                  : selected
                    ? 'border-brand-500 bg-brand-600 font-semibold text-white'
                    : month.overdue
                      ? 'border-red-300 bg-red-50 text-red-800 hover:border-red-400'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-brand-400'
              )}
            >
              <span>{month.short}</span>
              {month.paid ? (
                <Check className="mt-0.5 h-3 w-3" aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="mt-0.5 text-[10px] leading-none opacity-70">
                  {selected ? '●' : month.overdue ? 'due' : '·'}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
