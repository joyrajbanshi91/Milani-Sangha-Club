import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { Field, Input } from '@/components/ui/Field'
import { financeApi } from '@/features/finance/api'
import { formatPaise } from '@/features/finance/money'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * Closing the club's year, and declaring what the next one starts with.
 *
 * Deliberately invisible for eleven months of every twelve. It appears when the
 * calendar has turned into a financial year the club has not yet opened, and only
 * then — the server decides that, not the browser, because a laptop with a wrong
 * clock should not be able to close a club's year.
 *
 * ## Why the figures are typed rather than accepted
 *
 * What the ledger computes is filled in for you. It is a **suggestion**: at a year
 * end a committee counts the cash box, reads the bank statement, argues about the
 * difference and adopts a figure. The adopted figure is what the new year is built
 * on, and where it differs from the ledger's, both are kept — the difference is the
 * interesting part, and a system that silently overwrote one with the other would
 * lose the only evidence that a count ever happened.
 *
 * ## What closing actually does
 *
 * Opening 2027-28 closes 2026-27. From then on nothing can be dated back into it, so
 * the carry-forward the committee adopted cannot stop matching the year it came from.
 * Money that arrives late is not turned away: it is entered in the open year, which
 * is where the club actually received it.
 */
export function YearEndPanel({ financialYear }: { financialYear: string }) {
  const queryClient = useQueryClient()
  const [balances, setBalances] = useState<Record<string, string> | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'years', financialYear],
    queryFn: () => financeApi.years(financialYear),
  })

  const suggestion = data?.suggestion

  // Filled in from the suggestion the first time it arrives, then left to the officer.
  const figures =
    balances ??
    Object.fromEntries(
      (suggestion?.balances ?? []).map((fund) => [
        fund.fundId,
        (fund.balancePaise / 100).toFixed(2),
      ])
    )

  const adoptedPaise = Object.values(figures).reduce((sum, value) => {
    const rupees = Number(String(value).replace(/,/g, ''))
    return sum + (Number.isFinite(rupees) ? Math.round(rupees * 100) : 0)
  }, 0)

  const difference = suggestion ? adoptedPaise - suggestion.totalPaise : 0

  const open = useMutation({
    mutationFn: financeApi.openYear,
    onSuccess: async (result) => {
      setError(null)
      setDone(result.message)
      await queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'The year could not be opened.')
    },
  })

  if (done) {
    return (
      <div className="rounded-card border border-emerald-300 bg-emerald-50 p-5">
        <p role="status" className="text-sm/relaxed text-emerald-900">
          {done}
        </p>
      </div>
    )
  }

  return (
    <section className="rounded-card border-2 border-brand-400 bg-white p-5 shadow-soft">
      <div className="flex items-start gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg text-ink-900">
            A new club year has begun — {financialYear}
          </h2>
          <p className="mt-1 text-sm/relaxed text-ink-600">
            {suggestion ? (
              <>
                Close <strong>{suggestion.fromYear}</strong> by saying what the club is carrying
                into {financialYear}. The figures below are what the books say on{' '}
                {suggestion.fromYear.slice(0, 4) === financialYear.slice(0, 4) ? '' : '31 March '}
                the last day of {suggestion.fromYear} — count the cash, check the statement, and
                change anything that does not match.
              </>
            ) : (
              'Loading the club’s closing figures…'
            )}
          </p>
        </div>
      </div>

      {isLoading || !suggestion ? (
        <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      ) : (
        <form
          className="mt-5 border-t border-ink-100 pt-5"
          onSubmit={(event) => {
            event.preventDefault()
            open.mutate({
              financialYear,
              balances: figures,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          }}
        >
          {suggestion.pendingCount > 0 ? (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs/relaxed text-amber-900">
              <strong>
                {suggestion.pendingCount} entr{suggestion.pendingCount === 1 ? 'y' : 'ies'} in{' '}
                {suggestion.fromYear} {suggestion.pendingCount === 1 ? 'is' : 'are'} still awaiting
                approval
              </strong>{' '}
              and {suggestion.pendingCount === 1 ? 'is' : 'are'} not in these figures. Deal with{' '}
              {suggestion.pendingCount === 1 ? 'it' : 'them'} first if{' '}
              {suggestion.pendingCount === 1 ? 'it belongs' : 'they belong'} in the year you are
              closing — once it is closed, nothing more can be dated into it.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {suggestion.balances.map((fund) => (
              <Field
                key={fund.fundId}
                htmlFor={`carry-${fund.fundId}`}
                label={`${fund.fundName} (₹)`}
                required
                hint={`The books say ${formatPaise(fund.balancePaise)}`}
              >
                <Input
                  id={`carry-${fund.fundId}`}
                  inputMode="decimal"
                  required
                  value={figures[fund.fundId] ?? ''}
                  onChange={(event) =>
                    setBalances({ ...figures, [fund.fundId]: event.target.value })
                  }
                />
              </Field>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-brand-200 bg-brand-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-brand-800">
                Carrying into {financialYear}
              </p>
              <p className="font-display text-2xl tabular-nums text-brand-900">
                {formatPaise(adoptedPaise)}
              </p>
            </div>

            <p
              className={cn(
                'mt-1 text-xs/relaxed',
                difference === 0 ? 'text-brand-900' : 'text-amber-800'
              )}
            >
              {difference === 0
                ? `Matches the books exactly (${formatPaise(suggestion.totalPaise)}).`
                : `${formatPaise(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than the books say (${formatPaise(suggestion.totalPaise)}). Say why below — both figures are kept.`}
            </p>
          </div>

          <div className="mt-4">
            <Field
              htmlFor="carry-note"
              label="Note"
              hint="Where the difference came from, or what meeting adopted the figures"
            >
              <Input
                id="carry-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Adopted at the AGM on 12 April; ₹120 short after the cash count"
              />
            </Field>
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm/relaxed text-red-700">
              {error}
            </p>
          ) : null}

          <p className="mt-4 text-xs/relaxed text-ink-500">
            Opening {financialYear} closes <strong>{suggestion.fromYear}</strong>. Nothing can be
            dated back into it afterwards — a payment that arrives late is entered in{' '}
            {financialYear} instead, which is where the club received it. You can reopen the year
            from the Statements page if the figures turn out to be wrong.
          </p>

          <button
            type="submit"
            disabled={open.isPending}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-medium text-white disabled:opacity-60"
          >
            {open.isPending ? 'Opening…' : `Open ${financialYear} and close ${suggestion.fromYear}`}
          </button>
        </form>
      )}
    </section>
  )
}

/**
 * The years the club has opened, and what each was started with.
 *
 * Lives with the statements rather than on the dashboard, because it is about
 * accounting periods rather than about today's figures — and because it must be
 * reachable when the year-end panel is not showing, which is nearly always.
 */
export function FinancialYears() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'years'],
    queryFn: () => financeApi.years(),
  })

  const reopen = useMutation({
    mutationFn: financeApi.reopenYear,
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'That year could not be reopened.')
    },
  })

  if (isLoading) return null
  if (!data || data.years.length === 0) {
    return (
      <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg text-ink-900">Financial years</h2>
        <p className="mt-1 text-sm/relaxed text-ink-500">
          The club has not closed a year yet. When one ends, a panel appears on the dashboard
          asking what to carry forward — until then the figures run on from the funds' opening
          balances.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">Financial years</h2>
      <p className="mt-1 text-sm/relaxed text-ink-500">
        What each year was started with, as the committee adopted it. Opening a year closes the
        one before, so nothing can be dated back into it.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-ink-100">
        {[...data.years]
          .sort((a, b) => b.financialYear.localeCompare(a.financialYear))
          .map((year) => {
            const adopted = Object.values(year.balances).reduce((sum, amount) => sum + amount, 0)
            const difference = adopted - year.suggestedTotalPaise

            return (
              <li key={year.financialYear} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {year.financialYear}
                    <span className="ml-2 font-normal text-ink-500">
                      opened with {formatPaise(adopted)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Adopted by {year.createdByName}
                    {difference !== 0
                      ? ` · ${formatPaise(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than the books said`
                      : ' · matched the books'}
                  </p>
                  {year.note ? (
                    <p className="mt-1 text-xs italic text-ink-600">{year.note}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={reopen.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Reopen ${year.financialYear}? The year before it becomes editable again, ` +
                          'and its figures will change if anything is added.'
                      )
                    ) {
                      reopen.mutate(year.financialYear)
                    }
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reopen
                </button>
              </li>
            )
          })}
      </ul>
    </section>
  )
}
