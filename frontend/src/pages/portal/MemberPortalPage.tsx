import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Building2,
  CalendarDays,
  Clock,
  Download,
  Info,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'

import { Container } from '@/components/ui/Container'
import { Field, Input, Select } from '@/components/ui/Field'
import type { PaymentMethod, PaymentPurpose } from '@/config/constants'
import { club, membership } from '@/content/site'
import { useAuth } from '@/features/auth/authContext'
import { formatDate, formatDateTime, formatPaise } from '@/features/finance/money'
import { ProfilePhoto } from '@/features/profile/ProfilePhoto'
import { MembershipSummary, MonthGrid } from '@/features/payments/MonthGrid'
import { MonthPicker } from '@/features/payments/MonthPicker'
import {
  paidMonthsInside,
  selectedCount,
  type MonthSelection,
} from '@/features/payments/monthSelection'
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_PURPOSE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  downloadReceipt,
  memberPaymentsApi,
  type Payment,
} from '@/features/payments/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/** 'April 2026' from '2026-04'. */
function monthLabelOf(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** A full membership year, at which the yearly rate applies instead of the monthly. */
const MONTHS_IN_YEAR = 12

/**
 * The member's own area.
 *
 * Membership and paying dues, and deliberately nothing about the club's finances —
 * no balances, no totals, not even a link. A member who went looking would be
 * refused by the API as well.
 *
 * The payment form declares a payment; it does not take one. Both routes end the
 * same way (SRS §8): the member says what they paid, and an office bearer confirms
 * it against the club's records before it reaches the books. Nothing a member can
 * do here marks money as received.
 */
export function MemberPortalPage() {
  const { user } = useAuth()

  return (
    <Container className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">My membership</h1>
        <p className="mt-1 text-sm text-ink-500">
          Signed in as {user?.name} · {user?.role}
        </p>
      </div>

      <ProfilePhoto />

      <MyMembershipYear />
      <DeclarePayment />
      <MyPayments />
      <MembershipCategories />

      <p className="flex gap-2 rounded-card border border-ink-200 bg-ink-50 p-4 text-xs/relaxed text-ink-600">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          A downloadable membership card arrives with a later phase. Receipts for payments an
          office bearer has verified can be downloaded below.
        </span>
      </p>
    </Container>
  )
}

/**
 * The member's subscription year: which months are paid, and what is left.
 *
 * Derived on the server from their verified payments, so it can never disagree with
 * the receipts they hold — and never counts a declaration nobody has checked.
 */
function MyMembershipYear() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['payments', 'membership'],
    queryFn: () => memberPaymentsApi.membership(),
  })

  /**
   * Treated as absent unless the register is actually there.
   *
   * `data && data.membership.months` would throw on a response missing the field, and
   * this is the member's only page — a crash here takes their photograph, their
   * payment history and the form down with it. An unexpected payload should read as
   * "could not be loaded", which is true and recoverable.
   */
  const register = data?.membership?.months ? data.membership : null

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <div className="flex items-start gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-ink-900">
            My subscription {register ? `· ${register.financialYear}` : ''}
          </h2>

          {isLoading ? (
            <Loader2 className="mt-2 h-4 w-4 animate-spin text-brand-600" aria-hidden="true" />
          ) : error || !register ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              Your subscription record could not be loaded. Is the API running?
            </p>
          ) : (
            <div className="mt-1">
              <MembershipSummary membership={register} />
            </div>
          )}
        </div>
      </div>

      {register ? (
        <>
          <div className="mt-5 border-t border-ink-100 pt-5">
            <MonthGrid membership={register} />
          </div>

          <dl className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-3">
            {[
              { label: 'Months paid', value: `${register.monthsPaid} of 12` },
              { label: 'Months left', value: String(register.monthsUnpaid) },
              { label: 'Still to pay', value: formatPaise(register.outstandingPaise) },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs uppercase tracking-wide text-ink-500">{item.label}</dt>
                <dd className="mt-1 font-display text-xl tabular-nums text-ink-900">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {data?.dues ? (
            <p className="mt-4 text-xs text-ink-500">
              Membership is {formatPaise(data.dues.monthlyPaise)} a month, or{' '}
              {formatPaise(data.dues.yearlyPaise)} for the year. The club's year runs April to
              March.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

const METHODS = [
  {
    key: 'upi' as PaymentMethod,
    icon: Smartphone,
    title: 'By UPI',
    body: 'Pay from your phone, then record the transaction ID here.',
  },
  {
    key: 'cash' as PaymentMethod,
    icon: Banknote,
    title: 'In cash',
    body: 'Hand the cash to an office bearer, then record it here.',
  },
  {
    key: 'bank' as PaymentMethod,
    icon: Building2,
    title: 'Bank transfer',
    body: 'Transfer or pay by cheque, then record the reference here.',
  },
] as const

/**
 * Tell the club about a payment you have made.
 *
 * The order of operations is load-bearing and the copy says so: **pay first, record
 * second**. The acknowledgement number is allocated when the form is submitted, so
 * it cannot be quoted in a UPI note — the earlier version of this screen showed a
 * made-up `REF-2026-PENDING` and told members to quote it, which would have sent
 * every payment in with the same meaningless reference. What the treasurer actually
 * matches against is the UPI transaction ID, which is why that is the required
 * field.
 */
function DeclarePayment() {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>('upi')
  const [purpose, setPurpose] = useState<PaymentPurpose>('membership')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ reference: string; message: string } | null>(null)

  const register = useQuery({
    queryKey: ['payments', 'membership'],
    queryFn: () => memberPaymentsApi.membership(),
  })

  /**
   * What the member is paying for, as months.
   *
   * Held as a range and chosen by clicking the grid. It starts on the first month they
   * have not paid, because that is what a member paying monthly always wants and it
   * saves them working out where they got to — and because a selection that starts
   * empty is what made this form unusable before: no months meant no amount, and the
   * submit button sat disabled with nothing saying why.
   */
  const months = register.data?.membership?.months ?? []
  const unpaid = months.filter((month) => !month.paid)
  const firstUnpaid = unpaid[0]?.month ?? ''
  const lastUnpaid = unpaid[unpaid.length - 1]?.month ?? ''

  const [chosen, setChosen] = useState<MonthSelection | null>(null)

  /**
   * The month a run is being measured from, once the member has clicked one.
   *
   * Null while the selection is the form's own suggestion or a completed range, which
   * is the distinction that matters: somebody arriving with April pre-selected and
   * clicking June means "June", not "April to June". Only a month they chose
   * themselves anchors the next click.
   */
  const [anchor, setAnchor] = useState<string | null>(null)

  // Once the register has loaded, fall back to the first unpaid month rather than
  // leaving the member with nothing selected.
  const period: MonthSelection | null =
    chosen ?? (firstUnpaid ? { start: firstUnpaid, end: firstUnpaid } : null)

  const pickMonth = (month: string) => {
    if (anchor === null) {
      setAnchor(month)
      setChosen({ start: month, end: month })
      return
    }

    setChosen(month < anchor ? { start: month, end: anchor } : { start: anchor, end: month })
    setAnchor(null)
  }

  const pickRange = (range: MonthSelection) => {
    setChosen(range)
    setAnchor(null)
  }

  const alreadyPaid = paidMonthsInside(months, period)
  const monthCount = alreadyPaid.length > 0 ? 0 : selectedCount(months, period)

  /**
   * The amount is computed, never typed.
   *
   * The server refuses a membership payment whose amount does not match its months,
   * so letting the member type it would only ever produce a rejected form. Showing
   * the figure also answers the question they came with — "how much do I owe?".
   */
  const dues = register.data?.dues
  const membershipPaise =
    dues && monthCount > 0
      ? monthCount === MONTHS_IN_YEAR
        ? dues.yearlyPaise
        : monthCount * dues.monthlyPaise
      : 0

  const submit = useMutation({
    mutationFn: memberPaymentsApi.submit,
    onSuccess: async (result) => {
      setError(null)
      setDone({ reference: result.payment.reference, message: result.message })
      await queryClient.invalidateQueries({ queryKey: ['payments'] })
    },
    onError: (caught) => {
      setDone(null)
      setError(
        caught instanceof ApiError ? caught.message : 'That could not be sent. Please try again.'
      )
    },
  })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className="rounded-card border border-brand-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">Tell the club about a payment</h2>
      <p className="mt-1 text-sm/relaxed text-ink-600">
        Pay the club first, then record it here. An office bearer confirms it against the club's
        records before your receipt is issued.
      </p>

      <div role="group" aria-label="How did you pay?" className="mt-5 grid gap-3 sm:grid-cols-3">
        {METHODS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={method === option.key}
            onClick={() => {
              setMethod(option.key)
              setDone(null)
              setError(null)
            }}
            className={cn(
              'flex items-start gap-3 rounded-card border p-4 text-left transition-all duration-300',
              method === option.key
                ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200'
                : 'border-ink-200 hover:border-ink-300'
            )}
          >
            <option.icon
              className={cn(
                'mt-0.5 h-5 w-5 shrink-0',
                method === option.key ? 'text-brand-700' : 'text-ink-400'
              )}
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-medium text-ink-900">{option.title}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{option.body}</span>
            </span>
          </button>
        ))}
      </div>

      {method === 'upi' ? (
        <div className="mt-6 grid gap-5 border-t border-ink-100 pt-5 sm:grid-cols-2">
          <div className="rounded-card border border-ink-200 bg-ink-50 p-5 text-center">
            <QrCode className="mx-auto h-24 w-24 text-ink-300" aria-hidden="true" />
            <p className="mt-3 text-xs text-ink-500">
              The club's UPI QR code appears here once it is set in the club settings.
            </p>
          </div>

          <div className="space-y-4 text-sm/relaxed text-ink-600">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">Club UPI ID</p>
              <p className="mt-1 font-mono text-sm text-ink-400">Not yet configured</p>
            </div>
            <p>
              After paying, your UPI app shows a transaction ID — a long number, sometimes called
              the UTR. Enter it below. That is what the treasurer matches against the club's
              statement, so it must be exact.
            </p>
          </div>
        </div>
      ) : method === 'cash' ? (
        <div className="mt-6 border-t border-ink-100 pt-5">
          <div className="flex gap-3 rounded-card border border-amber-200 bg-amber-50 p-4">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="text-sm/relaxed text-amber-900">
              <p className="font-semibold">Paying in cash</p>
              <p className="mt-1">
                Hand the cash to an office bearer at the club office
                {club.contact.officeHours ? ` (${club.contact.officeHours})` : ''}, and record it
                below. Please ask for an acknowledgement at the time — your formal receipt follows
                once the treasurer has entered the cash into the club's books.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 border-t border-ink-100 pt-5">
          <p className="text-sm/relaxed text-ink-600">
            Enter the cheque number, or the reference your bank gives the transfer. The club's
            account details appear here once they are set in the club settings.
          </p>
        </div>
      )}

      <form
        className="mt-6 border-t border-ink-100 pt-5"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)

          submit.mutate({
            purpose,
            method,
            // Membership is priced from the months; anything else is typed.
            amount:
              purpose === 'membership'
                ? (membershipPaise / 100).toFixed(2)
                : String(form.get('amount')),
            paidOn: String(form.get('paidOn')),
            ...(purpose === 'membership' && period
              ? { periodStart: period.start, periodEnd: period.end }
              : {}),
            ...(method === 'cash'
              ? { handedTo: String(form.get('handedTo')) }
              : { externalReference: String(form.get('externalReference')) }),
            ...(form.get('note') ? { note: String(form.get('note')) } : {}),
          })
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field htmlFor="purpose" label="What was it for" required>
            <Select
              id="purpose"
              name="purpose"
              required
              value={purpose}
              onChange={(event) => {
                setPurpose(event.target.value as PaymentPurpose)
                setDone(null)
                setError(null)
              }}
            >
              <option value="membership">Membership subscription</option>
              <option value="donation">Donation</option>
              <option value="event">An event</option>
              <option value="other">Something else</option>
            </Select>
          </Field>

          {purpose !== 'membership' ? (
            <Field htmlFor="amount" label="Amount paid (₹)" required hint="e.g. 500 or 500.50">
              <Input id="amount" name="amount" required inputMode="decimal" placeholder="500" />
            </Field>
          ) : null}

          {purpose === 'membership' ? (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-ink-800">
                Which months are you paying for?
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              </p>
              <p className="mt-1 text-xs/relaxed text-ink-500">
                Click a month, then click another to pay for a run of them. Green months are
                already paid.
              </p>

              {/* Shortcuts for the two things almost everybody wants. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    {
                      key: 'one',
                      label: firstUnpaid ? `Next month — ${unpaid[0]?.label}` : 'Next month',
                      range: firstUnpaid ? { start: firstUnpaid, end: firstUnpaid } : null,
                    },
                    {
                      key: 'rest',
                      label: `The rest of the year — ${unpaid.length} month${unpaid.length === 1 ? '' : 's'}`,
                      range: firstUnpaid ? { start: firstUnpaid, end: lastUnpaid } : null,
                    },
                  ] as const
                ).map((option) => {
                  const active =
                    option.range !== null &&
                    period?.start === option.range.start &&
                    period?.end === option.range.end

                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={option.range === null}
                      aria-pressed={active}
                      onClick={() => option.range && pickRange(option.range)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                        active
                          ? 'border-brand-400 bg-brand-50 text-brand-900'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3">
                <MonthPicker
                  months={months}
                  selection={period}
                  onSelect={pickMonth}
                  disabled={unpaid.length === 0}
                />
              </div>

              {unpaid.length === 0 ? (
                <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                  You have paid every month of this year. Nothing is outstanding.
                </p>
              ) : null}

              {alreadyPaid.length > 0 ? (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs/relaxed text-red-700">
                  {alreadyPaid.map((month) => month.label).join(', ')}{' '}
                  {alreadyPaid.length === 1 ? 'is' : 'are'} already paid, so this run cannot be
                  charged for. Choose months that do not cross{' '}
                  {alreadyPaid.length === 1 ? 'it' : 'them'}.
                </p>
              ) : null}

              <div className="mt-3 rounded-card border border-brand-200 bg-brand-50 p-4">
                <p className="text-xs uppercase tracking-wide text-brand-800">Amount to pay</p>
                <p className="mt-1 font-display text-2xl tabular-nums text-brand-900">
                  {formatPaise(membershipPaise)}
                </p>
                <p className="mt-1 text-xs/relaxed text-brand-900">
                  {monthCount > 0 && period
                    ? `${monthCount} month${monthCount === 1 ? '' : 's'} — ` +
                      (period.start === period.end
                        ? monthLabelOf(period.start)
                        : `${monthLabelOf(period.start)} to ${monthLabelOf(period.end)}`) +
                      '. The club sets this rate; you cannot change it here.'
                    : 'Choose which months you are paying for.'}
                </p>
              </div>
            </div>
          ) : null}

          <Field htmlFor="paidOn" label="Date you paid" required>
            <Input
              id="paidOn"
              name="paidOn"
              type="date"
              required
              max={today}
              defaultValue={today}
            />
          </Field>

          {method === 'cash' ? (
            <Field
              htmlFor="handedTo"
              label="Given to"
              required
              hint="Which office bearer took the cash"
            >
              <Select id="handedTo" name="handedTo" required defaultValue="">
                <option value="" disabled>
                  Choose one…
                </option>
                <option value="Treasurer">Treasurer</option>
                <option value="Secretary">Secretary</option>
                <option value="President">President</option>
                <option value="Another office bearer">Another office bearer</option>
              </Select>
            </Field>
          ) : (
            <Field
              htmlFor="externalReference"
              label={method === 'upi' ? 'UPI transaction ID' : 'Cheque or bank reference'}
              required
              hint={
                method === 'upi'
                  ? 'The long number your payment app shows'
                  : 'The cheque number, or your bank’s reference'
              }
            >
              <Input
                id="externalReference"
                name="externalReference"
                required
                inputMode={method === 'upi' ? 'numeric' : 'text'}
              />
            </Field>
          )}

          <Field htmlFor="note" label="Anything the treasurer should know" className="sm:col-span-2">
            <Input id="note" name="note" placeholder="Paid for myself and my brother" />
          </Field>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm/relaxed text-red-700">
            {error}
          </p>
        ) : null}

        {done ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm/relaxed text-emerald-900"
          >
            {done.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submit.isPending || (purpose === 'membership' && monthCount === 0)}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          {submit.isPending ? 'Sending…' : 'Send for verification'}
        </button>
      </form>

      <p className="mt-4 flex gap-2 rounded-lg bg-brand-50 p-3 text-xs/relaxed text-brand-900">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Your declaration goes to every office bearer, and any one of them can confirm it against
          the club's records — the UPI statement, the cash box, the cheque. A receipt is only ever
          issued after that check, it names the bearer who made it, and no bearer can confirm a
          payment of their own.
        </span>
      </p>
    </section>
  )
}

/** The member's own history, with what each status means for them. */
function MyPayments() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['payments', 'mine'],
    queryFn: memberPaymentsApi.list,
  })

  const withdraw = useMutation({
    mutationFn: memberPaymentsApi.withdraw,
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['payments', 'mine'] })
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'That could not be withdrawn.')
    },
  })

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">Payments I have declared</h2>
      <p className="mt-1 text-sm text-ink-500">
        Quote the acknowledgement number if you need to ask an office bearer about one of these.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      ) : data && data.payments.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-100">
          {data.payments.map((payment) => (
            <li key={payment.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        PAYMENT_STATUS_STYLE[payment.status]
                      )}
                    >
                      {PAYMENT_STATUS_LABEL[payment.status]}
                    </span>
                    <span className="font-mono text-xs text-ink-400">{payment.reference}</span>
                  </div>

                  <p className="mt-2 text-sm text-ink-800">
                    {PAYMENT_PURPOSE_LABEL[payment.purpose]}
                    {payment.periodStart && payment.periodEnd ? (
                      <>
                        {' '}
                        for{' '}
                        <span className="font-medium">
                          {payment.periodStart === payment.periodEnd
                            ? monthLabelOf(payment.periodStart)
                            : `${monthLabelOf(payment.periodStart)} to ${monthLabelOf(payment.periodEnd)}`}
                        </span>
                      </>
                    ) : null}{' '}
                    · {PAYMENT_METHOD_LABEL[payment.method]} · paid {formatDate(payment.paidOn)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Sent {formatDateTime(payment.submittedAt)}
                    {payment.externalReference ? ` · ref ${payment.externalReference}` : ''}
                    {payment.handedTo ? ` · given to the ${payment.handedTo.toLowerCase()}` : ''}
                  </p>

                  <PaymentOutcome payment={payment} />
                </div>

                <p className="shrink-0 font-display text-lg tabular-nums text-ink-900">
                  {formatPaise(payment.amountPaise)}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {payment.status === 'pending_verification' ? (
                  <button
                    type="button"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate(payment.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Withdraw this
                  </button>
                ) : null}

                {payment.status === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      downloadReceipt(payment.id).catch((caught: unknown) => {
                        setError(
                          caught instanceof ApiError
                            ? caught.message
                            : 'That receipt could not be downloaded.'
                        )
                      })
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-medium text-brand-900 hover:bg-brand-100"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Download receipt
                    {payment.receiptNumber ? (
                      <span className="font-mono text-[10px] text-brand-700">
                        {payment.receiptNumber}
                      </span>
                    ) : null}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-card border border-dashed border-ink-300 py-10 text-center text-sm text-ink-500">
          You have not declared any payments yet.
        </p>
      )}
    </section>
  )
}

/**
 * What happened to a declaration, in terms of what the member should do next.
 *
 * Each status says what the member should do next, not what the system did. "Verified"
 * is the only one that promises a receipt, because it is the only one where a receipt
 * exists — telling a member their receipt is ready when it is not is how they turn up at
 * the office for nothing.
 */
function PaymentOutcome({ payment }: { payment: Payment }) {
  if (payment.status === 'pending_verification') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        An office bearer will check this against the club's records.
      </p>
    )
  }

  if (payment.status === 'approved') {
    return (
      <p className="mt-2 text-xs text-emerald-700">
        Confirmed by {payment.reviewedByName ?? 'an office bearer'} and entered in the club's books.
        Your receipt is ready to download below.
      </p>
    )
  }

  if (payment.status === 'rejected') {
    return (
      <p className="mt-2 text-xs text-red-700">
        Not accepted by {payment.reviewedByName ?? 'an office bearer'}
        {payment.declineReason ? `: ${payment.declineReason}` : '.'} Please speak to the treasurer if
        you think this is wrong.
      </p>
    )
  }

  return <p className="mt-2 text-xs text-ink-500">You withdrew this.</p>
}

/** Fees, from the public content so there is one source. */
function MembershipCategories() {
  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">Membership categories</h2>
      <ul className="mt-4 divide-y divide-ink-100">
        {membership.types.map((type) => (
          <li key={type.key} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <span className="text-ink-800">{type.name}</span>
            <span className={cn('tabular-nums', type.fee === null ? 'text-ink-400' : 'text-ink-900')}>
              {type.fee === null ? 'To be confirmed' : `₹${type.fee.toLocaleString('en-IN')}`}
              <span className="ml-1 text-xs text-ink-400">{type.period}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
