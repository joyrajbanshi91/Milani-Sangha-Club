import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, CalendarClock, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Field, Input } from '@/components/ui/Field'
import { READ_ONLY_NOTE, useCanRecordFinance } from '@/features/auth/permissions'
import { financeApi, type CarryForwardSuggestion } from '@/features/finance/api'
import { formatPaise } from '@/features/finance/money'
import {
  financialYearOf,
  financialYears,
  nextFinancialYear,
  openableYears,
  previousFinancialYear,
} from '@/features/finance/years'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * Closing the club's year, and declaring what the next one starts with.
 *
 * Reached two ways. On the dashboard it appears by itself when the calendar has turned
 * into a year the club has not opened — and only then, so it is invisible for eleven
 * months of every twelve. The server decides that, not the browser: a laptop with a
 * wrong clock should not be able to close a club's year.
 *
 * The other way is deliberate, from Statements → Financial years, because a year end is
 * a meeting and it happens when the meeting happens. An officer who has just adopted
 * figures should be able to enter them there and then rather than waiting to be
 * prompted or asking somebody to run a script.
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
export function YearEndPanel({
  financialYear,
  onCancel,
}: {
  financialYear: string
  /** Offered when the treasurer opened this deliberately rather than being prompted. */
  onCancel?: () => void
}) {
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
            {/*
              Two ways in, two headings. Prompted on 1 April it is news; chosen from the
              statements page it is a job the officer came to do, and telling them what
              they already know reads as though the screen is not listening.
            */}
            {onCancel
              ? `Summarise ${suggestion?.fromYear ?? 'the year'} and start ${financialYear}`
              : `A new club year has begun — ${financialYear}`}
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
          {/*
            The year in three figures, before anything is adopted.

            A committee asked to sign off a closing balance needs to see the movement
            behind it: opened with X, took in Y, spent Z, so W is left. Adopting the
            last number without the first three is how a wrong figure gets signed.
          */}
          <dl className="mb-5 grid gap-4 rounded-card border border-ink-200 bg-ink-50 p-4 sm:grid-cols-4">
            {[
              { label: `${suggestion.fromYear} opened with`, value: formatPaise(suggestion.openingTotalPaise) },
              { label: 'Income', value: formatPaise(suggestion.totals.incomePaise) },
              { label: 'Expenditure', value: formatPaise(suggestion.totals.expensePaise) },
              { label: 'Left at 31 March', value: formatPaise(suggestion.totalPaise) },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs uppercase tracking-wide text-ink-500">{item.label}</dt>
                <dd className="mt-1 font-display text-lg tabular-nums text-ink-900">{item.value}</dd>
              </div>
            ))}
            <p className="text-xs text-ink-500 sm:col-span-4">
              {suggestion.totals.transactionCount} entr
              {suggestion.totals.transactionCount === 1 ? 'y' : 'ies'} across {suggestion.fromYear}.
              Print the detailed statement for that period if the committee wants them listed.
            </p>
          </dl>

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

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={open.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-medium text-white disabled:opacity-60"
            >
              {open.isPending ? 'Opening…' : `Open ${financialYear} and close ${suggestion.fromYear}`}
            </button>

            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm text-ink-700"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  )
}

/** 1 April of the year after the one the club is in. */
function nextStartDate(today: Date = new Date()): string {
  const next = nextFinancialYear(financialYearOf(today))
  return `1 April ${next.slice(0, 4)}`
}

/**
 * Starting a new club year, and every year the club has kept.
 *
 * Its own page, reachable from the navigation, because the club could not find it: it
 * was a panel at the foot of the statements page, and for eleven months of every twelve
 * the only thing it said was that there was nothing to do. A treasurer looking for
 * "where do I start the new year with its opening balance" needs a place to go, not a
 * prompt that may or may not be showing.
 *
 * Three things, in the order a committee asks for them:
 *
 *   1. **Start the next year** — the year-end form, whenever the meeting happens, or
 *      what would carry forward if it happened today and the date it can be adopted.
 *   2. **Every year the club has**, newest first, each with what it opened with and a
 *      link to its figures in full. A closed year stays readable to every office
 *      bearer for good; closing settles a year, it does not hide it.
 *   3. **Reopening**, for when the adopted figures turn out to have been wrong.
 */
export function FinancialYears() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const canRecord = useCanRecordFinance()

  const thisYear = financialYearOf(new Date())

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'years'],
    queryFn: () => financeApi.years(),
  })

  /** Fund names, for showing an adopted opening as the cash box and the bank again. */
  const funds = useQuery({ queryKey: ['finance', 'funds'], queryFn: financeApi.funds })

  /**
   * Years the treasurer could close, now, without waiting to be prompted.
   *
   * The dashboard panel appears on its own when the calendar turns, and that is the
   * ordinary route. This is the other one the club asked for: a year end is a meeting,
   * it happens when the meeting happens, and the officer who runs it should be able to
   * do the whole thing here rather than waiting for a prompt or asking for a script.
   */
  const openable = openableYears(data?.years.map((year) => year.financialYear) ?? [])

  /**
   * What would carry forward if the year ended today.
   *
   * Asked for even when nothing can be opened yet, and this is the point: a year cannot
   * be started before it has begun — opening 2027-28 closes 2026-27, and doing that
   * mid-year would freeze the books the club is still writing in. So instead of an
   * empty screen saying "come back in April", the treasurer sees the figure that is
   * building up, per fund, and the date the committee can adopt it.
   */
  const preview = useQuery({
    queryKey: ['finance', 'years', 'preview', nextFinancialYear(thisYear)],
    queryFn: () => financeApi.years(nextFinancialYear(thisYear)),
    enabled: openable.length === 0 && closing === null,
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

  const openings = new Map((data?.years ?? []).map((year) => [year.financialYear, year]))
  const fundName = (id: string) =>
    funds.data?.funds.find((fund) => fund.id === id)?.name ?? 'A closed fund'

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg text-ink-900">Start a new club year</h2>
        <p className="mt-1 text-sm/relaxed text-ink-500">
          The club's year runs April to March. Each year's figures are its own: the balance the
          committee declared it started with, plus that year's entries. Starting a year closes the
          one before it, so the carry-forward everybody agreed cannot stop matching the year it
          came from.
        </p>

        <div className="mt-4 border-t border-ink-100 pt-4">
          {/*
            Closing a year adopts figures and settles the books. A read-only officer
            reads them and does not do that.
          */}
          {!canRecord ? (
            <p className="text-xs/relaxed text-ink-500">{READ_ONLY_NOTE}</p>
          ) : closing ? (
            <YearEndPanel financialYear={closing} onCancel={() => setClosing(null)} />
          ) : openable.length > 0 ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-ink-600">
                <span className="mb-1 block">Summarise a year and start the next</span>
                <select
                  className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900"
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) setClosing(event.target.value)
                  }}
                >
                  <option value="">Choose the year to start…</option>
                  {openable.map((year) => (
                    <option key={year} value={year}>
                      Start {year} (closing {previousFinancialYear(year)})
                    </option>
                  ))}
                </select>
              </label>

              <p className="max-w-md text-xs/relaxed text-ink-500">
                You will see {previousFinancialYear(openable[0] as string)} summarised — what it
                opened with, income, expenditure and what is left — and can adopt the figures the
                committee agreed, changing any that the cash count or the bank statement
                contradicts.
              </p>
            </div>
          ) : (
            <NextYearPreview
              financialYear={nextFinancialYear(thisYear)}
              startsOn={nextStartDate()}
              suggestion={preview.data?.suggestion}
              fundName={fundName}
            />
          )}
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg text-ink-900">Every year the club has kept</h2>
        <p className="mt-1 text-sm/relaxed text-ink-500">
          Nothing is ever archived away. A closed year keeps its own figures and stays open to
          read for every office bearer — choose a year here, or on the dashboard, to see it in
          full.
        </p>

        <ul className="mt-4 divide-y divide-ink-100">
          {[...financialYears()].reverse().map((year) => {
            const opening = openings.get(year)
            const adopted = opening
              ? Object.values(opening.balances).reduce((sum, amount) => sum + amount, 0)
              : null
            const difference =
              opening && adopted !== null ? adopted - opening.suggestedTotalPaise : 0

            // Settled by the existence of the *next* year's opening — one fact recorded
            // once, rather than a flag that could disagree with it.
            const closed = openings.has(nextFinancialYear(year))

            return (
              <li key={year} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {year}
                    {year === thisYear ? (
                      <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                        This year
                      </span>
                    ) : null}
                    {closed ? (
                      <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                        Closed
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-0.5 text-sm text-ink-600">
                    {adopted !== null ? (
                      <>Opened with {formatPaise(adopted)}</>
                    ) : (
                      <>Runs on from the funds' own opening balances — no year end preceded it</>
                    )}
                  </p>

                  {opening ? (
                    <>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Adopted by {opening.createdByName}
                        {difference !== 0
                          ? ` · ${formatPaise(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than the books said`
                          : ' · matched the books'}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {Object.entries(opening.balances)
                          .map(([fundId, amount]) => `${fundName(fundId)} ${formatPaise(amount)}`)
                          .join(' · ')}
                      </p>
                      {opening.note ? (
                        <p className="mt-1 text-xs italic text-ink-600">{opening.note}</p>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/office?year=${year}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-medium text-brand-900 hover:bg-brand-100"
                  >
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                    See the whole year
                  </Link>

                  {opening && canRecord ? (
                    <button
                      type="button"
                      disabled={reopen.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Reopen ${year}? ${previousFinancialYear(year)} becomes editable ` +
                              'again, and its figures will change if anything is added.'
                          )
                        ) {
                          reopen.mutate(year)
                        }
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Reopen
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

/**
 * What the next year would start with, before it can be started.
 *
 * The honest answer to "where do I set the new year's opening balance": here, from
 * 1 April — and this is the figure it would be. Showing the amount now is what makes the
 * wait understandable rather than a dead end, and it lets a treasurer check during the
 * year that the carry-forward building up looks right.
 */
function NextYearPreview({
  financialYear,
  startsOn,
  suggestion,
  fundName,
}: {
  financialYear: string
  startsOn: string
  suggestion: CarryForwardSuggestion | undefined
  fundName: (fundId: string) => string
}) {
  return (
    <div className="rounded-card border border-ink-200 bg-ink-50 p-4">
      <p className="text-sm/relaxed text-ink-700">
        Every year that has begun is already open. <strong>{financialYear}</strong> can be started
        from <strong>{startsOn}</strong> — and starting it is where the committee declares the
        opening balance it adopted, fund by fund.
      </p>

      {suggestion ? (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            {[
              {
                label: `${suggestion.fromYear} opened with`,
                value: formatPaise(suggestion.openingTotalPaise),
              },
              { label: 'Income so far', value: formatPaise(suggestion.totals.incomePaise) },
              { label: 'Expenditure so far', value: formatPaise(suggestion.totals.expensePaise) },
              {
                label: `Would carry into ${financialYear}`,
                value: formatPaise(suggestion.totalPaise),
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs uppercase tracking-wide text-ink-500">{item.label}</dt>
                <dd className="mt-1 font-display text-lg tabular-nums text-ink-900">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-xs/relaxed text-ink-500">
            {suggestion.balances
              .map((fund) => `${fundName(fund.fundId)} ${formatPaise(fund.balancePaise)}`)
              .join(' · ')}
            . On the books as they stand today, and it will move as {suggestion.fromYear} goes on.
            At the year end the committee counts the cash, reads the bank statement and adopts the
            figures — what they agree is what {financialYear} is built on, and any difference from
            the books is recorded rather than quietly accepted.
          </p>
        </>
      ) : null}
    </div>
  )
}
