import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Clock,
  Landmark,
  Loader2,
  Scale,
  Users,
  Wallet,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Container } from '@/components/ui/Container'
import { useCanRecordFinance } from '@/features/auth/permissions'
import { financeApi, type FundBalance, type Rollup } from '@/features/finance/api'
import { formatDate, formatMonth, formatPaise, formatRupeesShort } from '@/features/finance/money'
import {
  periodCoversToday,
  periodLabel,
  periodParams,
  periodRange,
  readPeriod,
  writePeriod,
} from '@/features/finance/period'
import { PeriodPicker } from '@/features/finance/PeriodPicker'
import { YearEndPanel } from '@/features/finance/YearEnd'
import { officePaymentsApi } from '@/features/payments/api'
import { EnquiriesWaiting } from '@/pages/office/EnquiriesPage'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/** Chart colours, matching the hue palette used across the site. */
const SERIES = ['#148253', '#f5ad1b', '#0284c7', '#e11d48', '#7c3aed', '#0d9488']

export function OfficeDashboardPage() {
  /**
   * Which period, kept in the address bar.
   *
   * The default is the whole club year, because that is the question a committee
   * meeting actually asks — a month at a time meant opening twelve screens and adding
   * up on paper. In the URL rather than in component state so a bearer can bookmark a
   * year, send the link to another bearer, and reload without losing their place.
   */
  const [search, setSearch] = useSearchParams()
  const period = readPeriod(search)
  const canRecord = useCanRecordFinance()

  const setPeriod = (next: typeof period) => {
    setSearch(writePeriod(next), { replace: true })
  }

  const params = periodParams(period)

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance', 'dashboard', params],
    queryFn: () => financeApi.dashboard(params),
  })

  /**
   * Members waiting to be verified.
   *
   * A separate query rather than part of the dashboard payload, because it is not a
   * figure: it is people waiting, and it must not disappear from view just because
   * the month picker moved. It is also the one thing on this page with somebody on
   * the other end of it.
   */
  const waiting = useQuery({
    queryKey: ['payments', 'queue', 'pending_verification'],
    queryFn: () => officePaymentsApi.queue('pending_verification'),
  })

  if (isLoading) {
    return (
      <Container className="py-16 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
        <p className="mt-3 text-sm text-ink-500">Loading the club's figures…</p>
      </Container>
    )
  }

  if (error || !data) {
    /**
     * The server's own words when it gave any.
     *
     * "Is the API running?" was actively misleading: the club hit a 400 from a
     * malformed month — Safari renders `<input type="month">` as a text box — and went
     * looking for a broken server. A refusal and an outage are different problems and
     * should not read the same.
     */
    const detail = error instanceof ApiError ? error.message : null

    return (
      <Container>
        <p role="alert" className="rounded-card bg-red-50 p-4 text-sm/relaxed text-red-700">
          {detail ?? 'The figures could not be loaded. Is the API running?'}
        </p>
      </Container>
    )
  }

  const surplus = data.totals.netPaise >= 0
  const range = periodRange(period)

  /**
   * Whether "now" is honest.
   *
   * A closing balance for a period that ended in March is what the club held *then*.
   * Labelling it "held now" while a committee reads last year's figures would be a
   * plain untruth, and the sort a treasurer gets asked about in a meeting.
   */
  const current = periodCoversToday(period)

  return (
    <Container className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Club finances</h1>
          <p className="mt-1 text-sm/relaxed text-ink-500">
            {period.kind === 'year' ? 'The whole of ' : ''}
            <strong className="font-medium text-ink-700">{periodLabel(period)}</strong>
            {period.kind === 'year' ? ` · club year ${period.financialYear}` : ''}. Only entries
            approved by a second office bearer are counted.{' '}
            <Link to="/office/years" className="text-brand-700 underline hover:text-brand-800">
              Club years and opening balances →
            </Link>
          </p>
        </div>

        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      {/*
        The year-end panel, above everything.

        It appears only when the calendar has turned into a year the club has not
        opened, and it changes what every figure below means — so it goes first, not
        as a note at the bottom that gets scrolled past for a fortnight.
      */}
      {data.openingNeededFor ? (
        canRecord ? (
          <YearEndPanel financialYear={data.openingNeededFor} />
        ) : (
          // A read-only officer is told, and not handed a form that would be refused.
          <p className="rounded-card border border-brand-300 bg-brand-50 p-4 text-sm/relaxed text-ink-700">
            A new club year has begun — <strong>{data.openingNeededFor}</strong>. The treasurer,
            secretary or president needs to close the last one and say what the club is carrying
            forward. Until they do, the figures below are the old year’s.
          </p>
        )
      ) : null}

      {/* Warnings first: a figure that is wrong matters more than one that is big. */}
      {data.overdrawnFunds.length > 0 ? (
        <div className="flex gap-3 rounded-card border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div className="text-sm/relaxed text-red-800">
            <p className="font-semibold">
              {data.overdrawnFunds.length} fund{data.overdrawnFunds.length === 1 ? '' : 's'} below
              zero
            </p>
            <p className="mt-1">
              {data.overdrawnFunds
                .map((fund) => `${fund.fundName} (${formatPaise(fund.balancePaise)})`)
                .join(', ')}
              . A cash box cannot hold less than nothing — check the opening balance, and look for a
              duplicated import or a wrong amount.
            </p>
          </div>
        </div>
      ) : null}

      {/* Somebody wrote to the club and is waiting. Nothing renders for a treasurer. */}
      <EnquiriesWaiting />

      {waiting.data && waiting.data.payments.length > 0 ? (
        <Link
          to="/office/payments"
          className="flex items-center gap-3 rounded-card border border-brand-300 bg-brand-50 p-4 transition-colors hover:bg-brand-100"
        >
          <Users className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
          <p className="text-sm text-brand-900">
            <span className="font-semibold">
              {waiting.data.payments.length} member payment
              {waiting.data.payments.length === 1 ? '' : 's'} awaiting verification
            </span>{' '}
            — a member is waiting for each of these. Check them against the club's records →
          </p>
        </Link>
      ) : null}

      {data.pending.length > 0 ? (
        <Link
          to="/office/entries?status=pending"
          className="flex items-center gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
        >
          <Clock className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">
              {data.pending.length} entr{data.pending.length === 1 ? 'y' : 'ies'} awaiting one
              approval each
            </span>{' '}
            — not included in any figure below. Review them →
          </p>
        </Link>
      ) : null}

      {/* Headline figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Wallet}
          label={current ? 'Total held now' : 'Held at the end'}
          value={formatPaise(data.totalFundsPaise)}
          tone="brand"
          hint={current ? 'Across every fund' : `Across every fund on ${formatDate(range.to)}`}
        />
        <Stat
          icon={ArrowUpRight}
          label={period.kind === 'year' ? 'Income this year' : 'Income this month'}
          value={formatPaise(data.totals.incomePaise)}
          tone="positive"
          hint={`${data.incomeBySource.length} sources`}
        />
        <Stat
          icon={ArrowDownRight}
          label={period.kind === 'year' ? 'Expenditure this year' : 'Expenditure this month'}
          value={formatPaise(data.totals.expensePaise)}
          tone="negative"
          hint={`${data.expenseByCategory.length} categories`}
        />
        <Stat
          icon={Scale}
          label={surplus ? 'Surplus' : 'Deficit'}
          value={formatPaise(Math.abs(data.totals.netPaise))}
          tone={surplus ? 'positive' : 'negative'}
          hint={`${data.totals.transactionCount} entries`}
        />
      </div>

      {/* Funds */}
      <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg text-ink-900">Where the money is held</h2>
        <p className="mt-1 text-sm/relaxed text-ink-500">
          {/*
            What "Opening" means depends on the period, and a reader cannot tell from a
            column heading. Over a whole year it is the figure the committee adopted at
            the last year end — which is the number they will be asked to reconcile.
          */}
          Opening is what each fund held on {formatDate(range.from)}
          {period.kind === 'year'
            ? ' — the balance carried into this club year — and Balance is where it stood on ' +
              formatDate(range.to) +
              '.'
            : ', and Balance where it stood on ' + formatDate(range.to) + '.'}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="pb-2 font-medium">Fund</th>
                <th className="pb-2 text-right font-medium">Opening</th>
                <th className="pb-2 text-right font-medium">In</th>
                <th className="pb-2 text-right font-medium">Out</th>
                <th className="pb-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.fundBalances.map((fund) => (
                <tr key={fund.fundId}>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2">
                      {fund.kind === 'bank' ? (
                        <Landmark className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                      ) : (
                        <Banknote className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                      )}
                      {fund.fundName}
                      <span className="text-xs text-ink-400">({fund.kind})</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ink-600">
                    {formatPaise(fund.openingBalancePaise, { withSymbol: false })}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-emerald-700">
                    {formatPaise(fund.inPaise, { withSymbol: false })}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-red-700">
                    {formatPaise(fund.outPaise, { withSymbol: false })}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 text-right font-semibold tabular-nums',
                      fund.balancePaise < 0 ? 'text-red-700' : 'text-ink-900'
                    )}
                  >
                    {formatPaise(fund.balancePaise, { withSymbol: false })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/*
                Every column totalled, not just the last.
                A committee reads this row across: the club started the period with
                this, took in that, spent that, and holds this. Leaving three cells
                blank meant the year's income had to be found on a different card and
                the arithmetic taken on trust.
              */}
              <tr className="border-t-2 border-ink-200">
                <td className="pt-3 font-semibold text-ink-900">Total</td>
                <td className="pt-3 text-right font-semibold tabular-nums text-ink-700">
                  {formatPaise(sumOf(data.fundBalances, 'openingBalancePaise'), {
                    withSymbol: false,
                  })}
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums text-emerald-700">
                  {formatPaise(sumOf(data.fundBalances, 'inPaise'), { withSymbol: false })}
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums text-red-700">
                  {formatPaise(sumOf(data.fundBalances, 'outPaise'), { withSymbol: false })}
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums text-brand-800">
                  {formatPaise(data.totalFundsPaise, { withSymbol: false })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Income and expenditure by month">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fontSize: 11, fill: '#7e766b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value) => formatRupeesShort(Number(value))}
                tick={{ fontSize: 11, fill: '#7e766b' }}
                axisLine={false}
                tickLine={false}
                width={62}
              />
              <Tooltip
                formatter={(value) => formatPaise(Number(value))}
                labelFormatter={(label) => formatMonth(String(label))}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e4dc' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="incomePaise" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expensePaise" name="Expenditure" fill={SERIES[3]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Collections by source">
          {data.incomeBySource.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.incomeBySource.slice(0, 6)}
                  dataKey="amountPaise"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {data.incomeBySource.slice(0, 6).map((entry, index) => (
                    <Cell key={entry.key} fill={SERIES[index % SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatPaise(Number(value))}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e4dc' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty>No income recorded in this period.</Empty>
          )}
        </Panel>

        <Panel title="Income by category">
          <RollupList rows={data.incomeByCategory} tone="positive" />
        </Panel>

        <Panel title="Expenditure by category">
          <RollupList rows={data.expenseByCategory} tone="negative" />
        </Panel>
      </div>
    </Container>
  )
}

/** Add up one figure across the funds. Transfers cancel out, so the totals hold. */
function sumOf(
  balances: readonly FundBalance[],
  field: 'openingBalancePaise' | 'inPaise' | 'outPaise'
): number {
  return balances.reduce((total, balance) => total + balance[field], 0)
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  hint?: string
  tone: 'brand' | 'positive' | 'negative'
}) {
  const tones = {
    brand: 'bg-brand-100 text-brand-700',
    positive: 'bg-emerald-100 text-emerald-700',
    negative: 'bg-red-100 text-red-700',
  }

  return (
    <div className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-3 text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function RollupList({ rows, tone }: { rows: Rollup[]; tone: 'positive' | 'negative' }) {
  if (rows.length === 0) return <Empty>Nothing recorded in this period.</Empty>

  const bar = tone === 'positive' ? 'bg-emerald-500' : 'bg-red-500'

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-800">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-ink-900">
              {formatPaise(row.amountPaise)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div className={cn('h-full rounded-full', bar)} style={{ width: `${row.sharePercent}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-400">
              {row.sharePercent}% · {row.count}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-400">{children}</p>
}
