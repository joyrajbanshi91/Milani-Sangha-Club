import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Container } from '@/components/ui/Container'
import { Input, Select } from '@/components/ui/Field'
import { formatPaise } from '@/features/finance/money'
import { MonthGrid } from '@/features/payments/MonthGrid'
import { officePaymentsApi, type MemberRegisterRow } from '@/features/payments/api'
import { cn } from '@/lib/cn'

/**
 * The membership register: every member and what they have paid.
 *
 * The screen a committee actually meets over. Two decisions shape it.
 *
 * **Sorted by who owes the most, not alphabetically.** The list exists to be acted
 * on, and a roster in name order buries the people it is meant to surface. The server
 * does the sorting so the officers' view and any future report agree.
 *
 * **Every account appears, including one that has paid nothing at all.** Those rows
 * are the entire point; a list built from the payments table would omit exactly the
 * members who need chasing.
 */

/** '2026-27' for a date, so the year picker can offer sensible options. */
function financialYearOf(date: Date): string {
  const year = date.getUTCFullYear()
  const start = date.getUTCMonth() + 1 >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

function yearOptions(): string[] {
  const current = financialYearOf(new Date())
  const start = Number(current.slice(0, 4))
  return [start + 1, start, start - 1, start - 2].map(
    (year) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`
  )
}

type Filter = 'all' | 'owing' | 'paid'

export function MembersPage() {
  const [year, setYear] = useState(financialYearOf(new Date()))
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments', 'roster', year],
    queryFn: () => officePaymentsApi.roster(year),
  })

  const needle = search.trim().toLowerCase()

  const rows = (data?.members ?? []).filter((member) => {
    if (filter === 'owing' && member.membership.paidInFull) return false
    if (filter === 'paid' && !member.membership.paidInFull) return false
    if (needle && !`${member.name} ${member.email}`.toLowerCase().includes(needle)) return false
    return true
  })

  return (
    <Container className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Membership register</h1>
          <p className="mt-1 text-sm/relaxed text-ink-500">
            Who has paid which months, for the year April to March. A month counts as paid only
            once an office bearer has verified the payment behind it.
          </p>
        </div>

        <label className="text-xs font-medium text-ink-600">
          <span className="mb-1 block">Membership year</span>
          <Select value={year} onChange={(event) => setYear(event.target.value)} className="h-10">
            {yearOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 p-4 text-sm text-red-700">
          The register could not be loaded. Is the API running?
        </p>
      ) : isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Users}
              label="Members"
              value={String(data.totals.members)}
              hint={`${data.totals.paidInFull} paid in full`}
              tone="brand"
            />
            <Stat
              icon={AlertTriangle}
              label="Overdue now"
              value={formatPaise(data.totals.overduePaise)}
              hint="Months already begun and unpaid"
              tone="negative"
            />
            <Stat
              icon={Clock}
              label="Outstanding this year"
              value={formatPaise(data.totals.outstandingPaise)}
              hint="Including months not yet due"
              tone="neutral"
            />
            <Stat
              icon={CheckCircle2}
              label="Awaiting verification"
              value={String(data.totals.awaitingVerification)}
              hint="Declarations to check"
              tone={data.totals.awaitingVerification > 0 ? 'negative' : 'positive'}
            />
          </div>

          {data.totals.awaitingVerification > 0 ? (
            <Link
              to="/office/payments"
              className="flex items-center gap-3 rounded-card border border-brand-300 bg-brand-50 p-4 text-sm text-brand-900 transition-colors hover:bg-brand-100"
            >
              <Clock className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
              <span>
                <span className="font-semibold">
                  {data.totals.awaitingVerification} payment
                  {data.totals.awaitingVerification === 1 ? '' : 's'} awaiting verification
                </span>{' '}
                — none of them counts towards a member's months until it is checked. Review them →
              </span>
            </Link>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'all' as Filter, label: 'Everyone' },
                  { key: 'owing' as Filter, label: 'Still owing' },
                  { key: 'paid' as Filter, label: 'Paid in full' },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={filter === option.key}
                  onClick={() => setFilter(option.key)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    filter === option.key
                      ? 'border-brand-300 bg-brand-50 text-brand-900'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="ml-auto min-w-52 flex-1 text-xs font-medium text-ink-600 sm:max-w-64">
              <span className="mb-1 flex items-center gap-1.5">
                <Search className="h-3 w-3" aria-hidden="true" />
                Find a member
              </span>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or email"
              />
            </label>
          </div>

          <ul className="space-y-3">
            {rows.map((member) => (
              <MemberRow key={member.uid} member={member} />
            ))}
            {rows.length === 0 ? (
              <li className="rounded-card border border-dashed border-ink-300 bg-white py-12 text-center text-sm text-ink-500">
                No member matches that.
              </li>
            ) : null}
          </ul>

          <p className="text-xs/relaxed text-ink-500">
            Membership is {formatPaise(data.dues.monthlyPaise)} a month or{' '}
            {formatPaise(data.dues.yearlyPaise)} a year. A member's months come from the payments
            an officer has verified, so this register and the receipts they hold can never
            disagree.
          </p>
        </>
      ) : null}
    </Container>
  )
}

function MemberRow({ member }: { member: MemberRegisterRow }) {
  const { membership } = member

  return (
    <li className="rounded-card border border-ink-200 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink-900">{member.name}</p>
            {member.role !== 'member' ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs capitalize text-brand-800 ring-1 ring-brand-200">
                {member.role}
              </span>
            ) : null}
            {membership.paidInFull ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Paid in full
              </span>
            ) : membership.monthsOverdue > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                {membership.monthsOverdue} month{membership.monthsOverdue === 1 ? '' : 's'} overdue
              </span>
            ) : null}
            {member.awaitingVerification > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {member.awaitingVerification} to verify
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 text-xs text-ink-500">{member.email}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-lg tabular-nums text-ink-900">
            {membership.monthsPaid}
            <span className="text-sm text-ink-400">/12</span>
          </p>
          <p className="text-xs text-ink-500">
            {membership.paidInFull
              ? 'nothing due'
              : `${formatPaise(membership.outstandingPaise)} left`}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-ink-100 pt-3">
        <MonthGrid membership={membership} />
      </div>
    </li>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  hint?: string
  tone: 'brand' | 'positive' | 'negative' | 'neutral'
}) {
  const tones = {
    brand: 'bg-brand-100 text-brand-700',
    positive: 'bg-emerald-100 text-emerald-700',
    negative: 'bg-red-100 text-red-700',
    neutral: 'bg-ink-100 text-ink-600',
  }

  return (
    <div className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <span
        className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-3 text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  )
}
