import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Container } from '@/components/ui/Container'
import { Field, Input, Select } from '@/components/ui/Field'
import type { PaymentStatus } from '@/config/constants'
import { useAuth } from '@/features/auth/authContext'
import { READ_ONLY_NOTE, useCanRecordFinance } from '@/features/auth/permissions'
import { financeApi } from '@/features/finance/api'
import { formatDate, formatDateTime, formatPaise } from '@/features/finance/money'
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_PURPOSE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_STYLE,
  officePaymentsApi,
  type Payment,
} from '@/features/payments/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

const TABS: Array<{ key: PaymentStatus | 'all'; label: string }> = [
  { key: 'pending_verification', label: 'Awaiting verification' },
  { key: 'approved', label: 'Verified' },
  { key: 'rejected', label: 'Not accepted' },
  { key: 'withdrawn', label: 'Withdrawn' },
  { key: 'all', label: 'All' },
]

function isStatus(value: string | null): value is PaymentStatus | 'all' {
  return TABS.some((tab) => tab.key === value)
}

/**
 * The officers' queue of members' declared payments.
 *
 * Two things about this screen are deliberate and worth not undoing.
 *
 * **It asks for a fund and a category before it will record anything.** The member
 * cannot supply those — they have no business knowing the club's chart of accounts
 * — and guessing them would put a member's subscription in whichever fund happened
 * to be first in the list. The officer knows which cash box or account the money
 * actually landed in; the form insists they say.
 *
 * **Recording does three things at once, and the confirmation names them.** It posts a
 * ledger entry dated the day the member paid, issues their receipt, and marks the
 * months paid in the register. An officer who thinks it only did the first will not
 * understand why the member can suddenly download something.
 */
export function PaymentsPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const status: PaymentStatus | 'all' = isStatus(raw) ? raw : 'pending_verification'

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments', 'queue', status],
    queryFn: () => officePaymentsApi.queue(status),
  })

  return (
    <Container className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Members' payments</h1>
        <p className="mt-1 text-sm/relaxed text-ink-500">
          What members say they have paid. Every bearer sees this queue, and{' '}
          <strong>any one of you</strong> can accept a payment. Check it against the club's records
          first — the UPI statement, the cash box, the cheque. Accepting it enters the money in the
          books straight away, dated the day the member paid, and issues their receipt. No second
          bearer is needed: the member put the money forward, you are the check, and{' '}
          <strong>nobody can accept their own payment</strong>.
        </p>
      </div>

      <CheckAReceipt />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={status === tab.key}
            onClick={() =>
              setParams(tab.key === 'pending_verification' ? {} : { status: tab.key })
            }
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              status === tab.key
                ? 'border-brand-300 bg-brand-50 text-brand-900'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 p-4 text-sm text-red-700">
          The list could not be loaded. Is the API running?
        </p>
      ) : isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
      ) : (
        <ul className="space-y-3">
          {data?.payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} />
          ))}
          {data?.payments.length === 0 ? (
            <li className="rounded-card border border-dashed border-ink-300 bg-white py-12 text-center text-sm text-ink-500">
              {status === 'pending_verification'
                ? 'Nothing is waiting to be verified.'
                : 'No payments with this status.'}
            </li>
          ) : null}
        </ul>
      )}
    </Container>
  )
}

function PaymentRow({ payment }: { payment: Payment }) {
  const { user } = useAuth()
  const [reviewing, setReviewing] = useState(false)

  /**
   * The rule the server enforces, shown before the officer tries.
   *
   * A treasurer paying their own subscription must have another officer confirm it,
   * because the question being answered is whether the money arrived — and nobody
   * can answer that about themselves. Greying the button out and saying why beats a
   * refusal after they have filled in the form.
   */
  const isOwn = user?.uid === payment.memberUid
  const open = payment.status === 'pending_verification'
  const canRecord = useCanRecordFinance()

  return (
    <li className="rounded-card border border-ink-200 bg-white p-4 shadow-soft">
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

          <p className="mt-2 font-medium text-ink-900">{payment.memberName}</p>
          <p className="mt-0.5 text-sm text-ink-600">
            {PAYMENT_PURPOSE_LABEL[payment.purpose]} · {PAYMENT_METHOD_LABEL[payment.method]} · paid{' '}
            {formatDate(payment.paidOn)}
          </p>

          {/* What the officer has to match against. */}
          <dl className="mt-2 space-y-0.5 text-xs text-ink-500">
            {payment.externalReference ? (
              <div className="flex gap-1.5">
                <dt className="font-medium">
                  {payment.method === 'upi' ? 'UPI transaction ID' : 'Reference'}:
                </dt>
                <dd className="font-mono">{payment.externalReference}</dd>
              </div>
            ) : null}
            {payment.handedTo ? (
              <div className="flex gap-1.5">
                <dt className="font-medium">Given to:</dt>
                <dd>{payment.handedTo}</dd>
              </div>
            ) : null}
            {payment.note ? (
              <div className="flex gap-1.5">
                <dt className="font-medium">Member's note:</dt>
                <dd>{payment.note}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt className="font-medium">Declared:</dt>
              <dd>{formatDateTime(payment.submittedAt)}</dd>
            </div>
          </dl>

          {payment.status === 'approved' ? (
            <p className="mt-2 text-xs text-emerald-700">
              Verified by {payment.reviewedByName} · entered as{' '}
              <span className="font-mono">{payment.transactionReference}</span>
            </p>
          ) : null}
          {payment.status === 'rejected' ? (
            <p className="mt-2 text-xs text-red-700">
              Declined by {payment.reviewedByName}: {payment.declineReason}
            </p>
          ) : null}
        </div>

        <p className="shrink-0 font-display text-xl tabular-nums text-ink-900">
          {formatPaise(payment.amountPaise)}
        </p>
      </div>

      {open ? (
        <div className="mt-3 border-t border-ink-100 pt-3">
          {!canRecord ? (
            // A read-only officer sees the declaration and who it is from, and cannot
            // put it in the books. Two different refusals, so they are said separately.
            <p className="text-xs/relaxed text-ink-500">{READ_ONLY_NOTE}</p>
          ) : isOwn ? (
            <p className="flex gap-2 text-xs/relaxed text-amber-700">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              This is your own payment, so another officer must verify it. Confirming your own
              payment would defeat the check.
            </p>
          ) : reviewing ? (
            <ReviewForm payment={payment} onDone={() => setReviewing(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-800 px-4 text-sm font-medium text-white"
            >
              Verify this payment
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}

function ReviewForm({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [recorded, setRecorded] = useState<string | null>(null)

  const funds = useQuery({ queryKey: ['finance', 'funds'], queryFn: financeApi.funds })
  const categories = useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: financeApi.categories,
  })

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['payments'] }),
      // The ledger changed too: recording posts an entry and moves the balances.
      queryClient.invalidateQueries({ queryKey: ['finance'] }),
    ])

  const record = useMutation({
    mutationFn: (body: { fundId: string; categoryId: string; note?: string }) =>
      officePaymentsApi.record(payment.id, body),
    onSuccess: async (result) => {
      setError(null)
      setRecorded(result.message)
      await refresh()
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'That could not be recorded.')
    },
  })

  const decline = useMutation({
    mutationFn: (reason: string) => officePaymentsApi.decline(payment.id, reason),
    onSuccess: async () => {
      setError(null)
      await refresh()
      onDone()
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'That could not be declined.')
    },
  })

  const busy = record.isPending || decline.isPending

  // Income only: a member's payment is money coming in, so offering expense
  // categories here would only ever be a way to file it wrongly.
  const incomeCategories = (categories.data?.categories ?? []).filter(
    (category) => category.kind === 'income' && category.active
  )
  const activeFunds = (funds.data?.funds ?? []).filter((fund) => fund.active)

  if (recorded) {
    return (
      <div className="rounded-lg bg-emerald-50 p-3">
        <p role="status" className="text-sm/relaxed text-emerald-900">
          {recorded}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-2 text-xs font-medium text-emerald-800 underline"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        record.mutate({
          fundId: String(form.get('fundId')),
          categoryId: String(form.get('categoryId')),
          ...(form.get('note') ? { note: String(form.get('note')) } : {}),
        })
      }}
    >
      <p className="text-xs/relaxed text-ink-600">
        Confirm the money reached the club, then say where it landed. The entry is dated{' '}
        {formatDate(payment.paidOn)} — the day the member paid. Your acceptance is the check, so it
        goes into the club's balances at once and the member's receipt is issued naming you.
      </p>

      {activeFunds.length === 0 || incomeCategories.length === 0 ? (
        <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs/relaxed text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {activeFunds.length === 0
            ? 'There are no funds set up yet, so nothing can be recorded. Add one first.'
            : 'There are no income categories set up yet, so nothing can be recorded. Add one first.'}
        </p>
      ) : null}

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field htmlFor={`fund-${payment.id}`} label="Which fund did it go into" required>
          <Select id={`fund-${payment.id}`} name="fundId" required>
            {activeFunds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field htmlFor={`category-${payment.id}`} label="Category" required>
          <Select id={`category-${payment.id}`} name="categoryId" required>
            {incomeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          htmlFor={`note-${payment.id}`}
          label="Add to the description"
          className="sm:col-span-2"
          hint="Appended to the ledger entry. The member's reference is already included."
        >
          <Input id={`note-${payment.id}`} name="note" />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm/relaxed text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || activeFunds.length === 0 || incomeCategories.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {record.isPending ? 'Recording…' : 'Confirmed — enter in the books'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt(
              'Why can this payment not be accepted? The member will see this.'
            )
            if (reason) decline.mutate(reason)
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cannot find it
        </button>

        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-9 items-center rounded-lg border border-ink-200 px-3.5 text-sm text-ink-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * Is this receipt the club's?
 *
 * An officer with a piece of paper in front of them — handed over at the gate, sent as
 * a photograph, produced in an argument — typing the code off it.
 *
 * This is the point of the code. The reference number on a receipt is sequential, so
 * anybody holding one genuine receipt knows roughly where the club's counter is and can
 * put a plausible number on a document the club never issued. The code cannot be
 * guessed, so a receipt whose code has no record behind it was not issued here.
 *
 * The answer is deliberately specific: the member, the amount, the date and the months
 * it covered, so the officer can compare it against the document rather than trusting a
 * green tick. A code that matches a real payment for a *different* amount is exactly the
 * fraud worth catching.
 */
function CheckAReceipt() {
  const [code, setCode] = useState('')
  const [open, setOpen] = useState(false)

  const check = useMutation({
    mutationFn: (value: string) => officePaymentsApi.verifyCode(value),
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
      >
        <ShieldCheck className="h-4 w-4 text-brand-700" aria-hidden="true" />
        Check a receipt's verification code
      </button>
    )
  }

  const found = check.data?.payment ?? null

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">Check a receipt</h2>
      <p className="mt-1 text-sm/relaxed text-ink-500">
        Type the <strong>verification code</strong> printed on the receipt — not the receipt
        number, which anybody could guess. Hyphens, spaces and capitals do not matter.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (code.trim()) check.mutate(code.trim())
        }}
      >
        <label className="text-xs font-medium text-ink-600">
          <span className="mb-1 block">Verification code</span>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="4K7P-2WQ9-XB"
            className="font-mono uppercase"
            autoComplete="off"
          />
        </label>

        <button
          type="submit"
          disabled={check.isPending || code.trim() === ''}
          className="inline-flex h-10 items-center rounded-full bg-brand-800 px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          {check.isPending ? 'Checking…' : 'Check'}
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setCode('')
            check.reset()
          }}
          className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm text-ink-700"
        >
          Close
        </button>
      </form>

      {check.isError ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {check.error instanceof ApiError ? check.error.message : 'That code could not be checked.'}
        </p>
      ) : null}

      {check.data ? (
        found ? (
          <div className="mt-4 rounded-card border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              This code is in the club's records.
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ['Member', found.memberName],
                ['Amount', formatPaise(found.amountPaise)],
                ['Paid on', formatDate(found.paidOn)],
                ['Receipt', found.receiptNumber ?? 'Not issued — this payment is not verified'],
                ['Declaration', found.reference],
                ['Status', PAYMENT_STATUS_LABEL[found.status]],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-emerald-800">{label}</dt>
                  <dd className="mt-0.5 text-sm text-emerald-950">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs/relaxed text-emerald-900">
              Compare every figure against the document. A genuine code beside a different amount
              or a different member means the paper has been altered.
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-card border border-red-300 bg-red-50 p-4 text-sm/relaxed text-red-800">
            {check.data.message}
          </p>
        )
      ) : null}
    </section>
  )
}
