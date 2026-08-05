import { formatPaise } from '@/features/finance/money'
import type { MembershipStatus } from '@/features/payments/api'
import { cn } from '@/lib/cn'

/**
 * A membership year as twelve boxes.
 *
 * The whole register in one glance, which is what both the member and the officer
 * actually want: not "7 of 12 months", but *which* seven. A member looking at their
 * own year needs to see that they have missed August; an officer scanning the roster
 * needs to see who has a run of red at the start of the year.
 *
 * Three states, and they are deliberately distinguishable without colour — paid is
 * filled and ticked, overdue is outlined in red with the month name, still-to-come is
 * plain grey. A club noticeboard gets printed in black and white.
 */
export function MonthGrid({
  membership,
  size = 'normal',
}: {
  membership: MembershipStatus
  size?: 'normal' | 'compact'
}) {
  return (
    <ul
      className={cn(
        'grid gap-1',
        size === 'compact' ? 'grid-cols-12' : 'grid-cols-6 gap-1.5 sm:grid-cols-12'
      )}
    >
      {membership.months.map((month) => (
        <li
          key={month.month}
          title={`${month.label} — ${
            month.paid
              ? `paid${month.receiptNumber ? `, receipt ${month.receiptNumber}` : ''}`
              : month.overdue
                ? 'unpaid and due'
                : 'not yet due'
          }`}
          className={cn(
            'flex flex-col items-center justify-center rounded border text-center',
            size === 'compact' ? 'h-6 text-[9px]' : 'h-11 text-[10px]',
            month.paid
              ? 'border-emerald-300 bg-emerald-100 font-semibold text-emerald-900'
              : month.overdue
                ? 'border-red-300 bg-red-50 font-medium text-red-800'
                : 'border-ink-200 bg-ink-50 text-ink-400'
          )}
        >
          <span>{month.short.replace(' ', ' ')}</span>
          {size === 'normal' ? (
            <span aria-hidden="true" className="mt-0.5 text-[11px] leading-none">
              {month.paid ? '✓' : month.overdue ? '!' : '·'}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * The register in one sentence.
 *
 * "How many months are left" is genuinely ambiguous — months of the year not yet
 * paid, or months still to come? Both are stated, separately, because a member who
 * has paid April to March in advance owes nothing and a member in August who has paid
 * nothing owes five months *now* and seven later.
 */
export function MembershipSummary({ membership }: { membership: MembershipStatus }) {
  if (membership.paidInFull) {
    return (
      <p className="text-sm text-emerald-800">
        <strong>Paid in full</strong> for {membership.label} — all 12 months.
      </p>
    )
  }

  return (
    <p className="text-sm/relaxed text-ink-700">
      <strong>
        {membership.monthsPaid} of 12 months paid
      </strong>{' '}
      for {membership.label}. {membership.monthsUnpaid} month
      {membership.monthsUnpaid === 1 ? '' : 's'} left, costing{' '}
      {formatPaise(membership.outstandingPaise)}
      {membership.monthsOverdue > 0 ? (
        <>
          {' '}
          — of which{' '}
          <span className="font-semibold text-red-700">
            {membership.monthsOverdue} {membership.monthsOverdue === 1 ? 'month is' : 'months are'}{' '}
            already due ({formatPaise(membership.overduePaise)})
          </span>
        </>
      ) : null}
      .
    </p>
  )
}
