import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Container } from '@/components/ui/Container'
import { Field, Input, Select } from '@/components/ui/Field'
import type { PaymentStatus } from '@/config/constants'
import { useAuth } from '@/features/auth/authContext'
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
 * **Recording produces a pending entry, and the screen says so.** An officer who
 * believes recording a payment is the end of the job will not chase the second
 * signature, and the money will sit outside every balance while everyone assumes it
 * is counted. The confirmation names the entry and what it is still waiting for.
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
          What members say they have paid. Check each one against the club's records — the UPI
          statement, the cash box, the cheque — before you enter it in the books. Recording one
          creates an ordinary pending entry that still needs a second officer's approval.
        </p>
      </div>

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
          {isOwn ? (
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
      // The ledger changed too: a new pending entry now needs a second signature.
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
        {formatDate(payment.paidOn)} — the day the member paid.
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
