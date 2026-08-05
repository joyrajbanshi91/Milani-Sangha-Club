import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Download, FileText, ListOrdered, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Container } from '@/components/ui/Container'
import {
  downloadStatementPdf,
  financeApi,
  type ReportDetail,
} from '@/features/finance/api'
import { FinancialYears } from '@/features/finance/YearEnd'
import { formatDate, formatPaise } from '@/features/finance/money'
import { cn } from '@/lib/cn'

type Mode = 'month' | 'range'

export function ReportsPage() {
  const [mode, setMode] = useState<Mode>('month')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [from, setFrom] = useState(`${new Date().getFullYear()}-04-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  /** Which of the two is being generated, so only that button says "Generating…". */
  const [downloading, setDownloading] = useState<ReportDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const params = mode === 'month' ? { month } : { from, to }

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'report', params],
    queryFn: () => financeApi.report(params),
  })

  const download = async (detail: ReportDetail) => {
    setDownloading(detail)
    setError(null)
    try {
      await downloadStatementPdf({ ...params, detail })
    } catch {
      setError('The statement could not be generated.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <Container className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Statements</h1>
        <p className="mt-1 text-sm/relaxed text-ink-500">
          A statement for a month or any period, on screen and as a PDF for the committee. Both
          come from the same figures, and the file is named with the period and the day it was
          issued so it can be found again.
        </p>
      </div>

      <div className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-end gap-4">
          <div className="inline-flex rounded-full border border-ink-200 bg-ink-50 p-1">
            {(['month', 'range'] as Mode[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                  mode === option ? 'bg-white text-brand-800 shadow-soft' : 'text-ink-500'
                )}
              >
                {option === 'month' ? 'Whole month' : 'Date range'}
              </button>
            ))}
          </div>

          {mode === 'month' ? (
            <label className="text-xs font-medium text-ink-600">
              <span className="mb-1 block">Month</span>
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-10 rounded-lg border border-ink-300 px-3 text-sm"
              />
            </label>
          ) : (
            <>
              <label className="text-xs font-medium text-ink-600">
                <span className="mb-1 block">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-10 rounded-lg border border-ink-300 px-3 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-ink-600">
                <span className="mb-1 block">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-10 rounded-lg border border-ink-300 px-3 text-sm"
                />
              </label>
            </>
          )}

        </div>

        {/*
          Two documents, described rather than labelled.

          "Summary" and "Detailed" mean nothing on their own, and the difference is
          the one thing an officer needs to get right before circulating a page: the
          summary merges every member's subscription into its category, so a list of
          who paid what does not end up on a noticeboard.
        */}
        <div className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-2">
          {(
            [
              {
                detail: 'summary' as ReportDetail,
                title: 'Summary statement',
                body: 'Totals by category, with every membership payment merged into one line. For the committee and the noticeboard.',
                icon: FileText,
              },
              {
                detail: 'detailed' as ReportDetail,
                title: 'Detailed statement',
                body: 'Every entry listed, with who each payment came from. For checking the books against the bank.',
                icon: ListOrdered,
              },
            ] as const
          ).map((option) => (
            <div
              key={option.detail}
              className="flex flex-col justify-between rounded-card border border-ink-200 p-4"
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  <option.icon className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  {option.title}
                </p>
                <p className="mt-1 text-xs/relaxed text-ink-500">{option.body}</p>
              </div>

              <button
                type="button"
                onClick={() => void download(option.detail)}
                disabled={downloading !== null}
                className={cn(
                  'mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium disabled:opacity-60',
                  option.detail === 'detailed'
                    ? 'bg-gradient-to-r from-brand-700 to-brand-500 text-white'
                    : 'border border-brand-300 bg-brand-50 text-brand-900'
                )}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {downloading === option.detail ? 'Generating…' : 'Download PDF'}
              </button>
            </div>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
      ) : data ? (
        <>
          <div className="rounded-card border border-ink-200 bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4 border-b border-ink-200 pb-4">
              <div>
                <h2 className="font-display text-xl text-ink-900">{data.club.name}</h2>
                <p className="text-sm text-ink-500">Financial statement · {data.period.label}</p>
              </div>
              <FileText className="h-6 w-6 text-ink-300" aria-hidden="true" />
            </div>

            {data.overdrawnFunds.length > 0 ? (
              <p className="mt-4 flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {data.overdrawnFunds.length} fund
                {data.overdrawnFunds.length === 1 ? '' : 's'} below zero —{' '}
                {data.overdrawnFunds.map((f) => f.fundName).join(', ')}.
              </p>
            ) : null}

            {data.pendingCount > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                {data.pendingCount} entr{data.pendingCount === 1 ? 'y is' : 'ies are'} awaiting a
                second signature and are <strong>not</strong> in these figures.
              </p>
            ) : null}

            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <Figure label="Opening balance" value={formatPaise(data.openingBalancePaise)} />
              <Figure label="Total income" value={formatPaise(data.totals.incomePaise)} tone="positive" />
              <Figure
                label="Total expenditure"
                value={formatPaise(data.totals.expensePaise)}
                tone="negative"
              />
              <Figure
                label={data.totals.netPaise >= 0 ? 'Surplus' : 'Deficit'}
                value={formatPaise(Math.abs(data.totals.netPaise))}
                tone={data.totals.netPaise >= 0 ? 'positive' : 'negative'}
              />
              <Figure label="Closing balance" value={formatPaise(data.closingBalancePaise)} />
              <Figure label="Entries" value={String(data.totals.transactionCount)} />
            </dl>
          </div>

          <div className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
            <h3 className="font-display text-lg text-ink-900">
              Entries in this period ({data.transactions.length})
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Reference</th>
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.transactions.map((transaction) => (
                    <tr key={transaction.id} className={transaction.reverses ? 'text-ink-400' : ''}>
                      <td className="py-2 whitespace-nowrap">{formatDate(transaction.date)}</td>
                      <td className="py-2 font-mono text-xs text-ink-500">{transaction.reference}</td>
                      <td className="py-2">{transaction.description}</td>
                      <td className="py-2 text-ink-500">{transaction.source}</td>
                      <td
                        className={cn(
                          'py-2 text-right tabular-nums',
                          transaction.kind === 'income'
                            ? 'text-emerald-700'
                            : transaction.kind === 'expense'
                              ? 'text-red-700'
                              : 'text-ink-500'
                        )}
                      >
                        {transaction.kind === 'expense' ? '−' : transaction.kind === 'income' ? '+' : ''}
                        {formatPaise(transaction.amountPaise, { withSymbol: false })}
                      </td>
                    </tr>
                  ))}
                  {data.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-ink-400">
                        No approved entries in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
      <FinancialYears />
    </Container>
  )
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-display text-xl tabular-nums',
          tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-700' : 'text-ink-900'
        )}
      >
        {value}
      </dd>
    </div>
  )
}
