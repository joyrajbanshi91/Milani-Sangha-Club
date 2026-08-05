import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Plus, RotateCcw, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Container } from '@/components/ui/Container'
import { REQUIRED_APPROVALS } from '@/config/constants'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { financeApi, type Transaction } from '@/features/finance/api'
import { formatDate, formatDateTime, formatPaise } from '@/features/finance/money'
import { useAuth } from '@/features/auth/authContext'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

const STATUS_STYLES: Record<Transaction['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  posted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  discarded: 'bg-ink-100 text-ink-600',
  reversed: 'bg-violet-100 text-violet-800',
}

export function EntriesPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', status],
    queryFn: () => financeApi.transactions({ status }),
  })

  return (
    <Container className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Entries</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every entry needs <strong>one</strong> approval, from any office bearer except the
            one who recorded it. Nothing is ever deleted and nothing can be edited — a mistake is
            withdrawn before anyone approves it, or cancelled by a reversal afterwards.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-brand-500 px-4 text-sm font-medium text-white shadow-glow"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {showForm ? 'Close form' : 'Record an entry'}
        </button>
      </div>

      {showForm ? <NewEntryForm onDone={() => setShowForm(false)} /> : null}

      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'posted', 'reversed', 'rejected'].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={status === option}
            onClick={() => setParams(option === 'all' ? {} : { status: option })}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors',
              status === option
                ? 'border-brand-300 bg-brand-50 text-brand-900'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
      ) : (
        <ul className="space-y-3">
          {data?.transactions.map((transaction) => (
            <EntryRow key={transaction.id} transaction={transaction} />
          ))}
          {data?.transactions.length === 0 ? (
            <li className="rounded-card border border-dashed border-ink-300 bg-white py-12 text-center text-sm text-ink-500">
              No entries with this status.
            </li>
          ) : null}
        </ul>
      )}
    </Container>
  )
}

function EntryRow({ transaction }: { transaction: Transaction }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance'] })

  const act = useMutation({
    mutationFn: async (action: { type: 'approve' | 'reject' | 'withdraw' | 'reverse'; reason?: string }) => {
      switch (action.type) {
        case 'approve':
          return financeApi.approve(transaction.id)
        case 'reject':
          return financeApi.reject(transaction.id, action.reason ?? '')
        case 'withdraw':
          return financeApi.withdraw(transaction.id)
        case 'reverse':
          return financeApi.reverse(transaction.id, action.reason ?? '')
      }
    },
    onSuccess: async (result) => {
      setMessage({ text: result.message, ok: true })
      await refresh()
    },
    onError: (error) => {
      setMessage({
        text: error instanceof ApiError ? error.message : 'That did not work.',
        ok: false,
      })
    },
  })

  const isAuthor = user?.uid === transaction.createdBy
  const sign = transaction.kind === 'expense' ? '−' : transaction.kind === 'income' ? '+' : ''

  /**
   * How many signatures this entry is still short.
   *
   * Shown rather than implied. The club read "needs a second officer's approval" as
   * "one person has approved and it wants another" — because the officer reading it
   * had just been refused their own approval. Counting it out is the fix.
   */
  const outstanding = Math.max(0, REQUIRED_APPROVALS - transaction.approvals.length)

  return (
    <li className="rounded-card border border-ink-200 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                STATUS_STYLES[transaction.status]
              )}
            >
              {transaction.status}
            </span>
            <span className="font-mono text-xs text-ink-400">{transaction.reference}</span>
            <span className="text-xs text-ink-500">{formatDate(transaction.date)}</span>
            {transaction.reverses ? (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                reversal
              </span>
            ) : null}
          </div>

          <p className="mt-2 font-medium text-ink-900">{transaction.description}</p>
          <p className="mt-0.5 text-sm text-ink-500">
            {transaction.source}
            {transaction.externalReference ? ` · ${transaction.externalReference}` : ''}
          </p>

          <p className="mt-2 text-xs text-ink-400">
            Recorded by {transaction.createdByName} on {formatDateTime(transaction.createdAt)}
            {transaction.approvals.length > 0
              ? ` · approved by ${transaction.approvals.map((a) => a.name).join(', ')}`
              : ''}
          </p>

          {transaction.rejectionReason ? (
            <p className="mt-1 text-xs text-red-700">Reason: {transaction.rejectionReason}</p>
          ) : null}
        </div>

        <p
          className={cn(
            'shrink-0 font-display text-xl tabular-nums',
            transaction.kind === 'income'
              ? 'text-emerald-700'
              : transaction.kind === 'expense'
                ? 'text-red-700'
                : 'text-ink-600',
            transaction.status !== 'posted' && 'opacity-60'
          )}
        >
          {sign}
          {formatPaise(transaction.amountPaise)}
        </p>
      </div>

      {/* Actions available to this person on this entry */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
        {transaction.status === 'pending' ? (
          isAuthor ? (
            <>
              <p className="text-xs text-amber-700">
                You recorded this, so you cannot approve or change it.{' '}
                <strong>
                  {outstanding} approval{outstanding === 1 ? '' : 's'} outstanding
                </strong>{' '}
                — any other office bearer can give it.
              </p>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate({ type: 'withdraw' })}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                Withdraw
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate({ type: 'approve' })}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {outstanding === 1 ? 'Approve and post' : `Approve (${outstanding} needed)`}
              </button>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => {
                  const reason = window.prompt('Why are you rejecting this entry?')
                  if (reason) act.mutate({ type: 'reject', reason })
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reject
              </button>
            </>
          )
        ) : null}

        {transaction.status === 'posted' && !transaction.reversedBy ? (
          <button
            type="button"
            disabled={act.isPending}
            onClick={() => {
              const reason = window.prompt('Why is this entry being cancelled?')
              if (reason) act.mutate({ type: 'reverse', reason })
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel by reversal
          </button>
        ) : null}

        {message ? (
          <p
            role="status"
            className={cn(
              'text-xs font-medium',
              message.ok ? 'text-emerald-700' : 'text-red-700'
            )}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function NewEntryForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const funds = useQuery({ queryKey: ['finance', 'funds'], queryFn: financeApi.funds })
  const categories = useQuery({
    queryKey: ['finance', 'categories'],
    queryFn: financeApi.categories,
  })

  const [kind, setKind] = useState<'income' | 'expense' | 'transfer'>('income')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: financeApi.createEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance'] })
      onDone()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'The entry could not be saved.')
    },
  })

  const relevantCategories = (categories.data?.categories ?? []).filter(
    (category) => category.kind === kind && category.active
  )

  return (
    <form
      className="rounded-card border border-brand-200 bg-white p-5 shadow-soft"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        const form = new FormData(event.currentTarget)

        create.mutate({
          kind,
          date: String(form.get('date')),
          amount: String(form.get('amount')),
          fundId: String(form.get('fundId')),
          ...(kind === 'transfer' ? { toFundId: String(form.get('toFundId')) } : {}),
          ...(kind === 'transfer' ? {} : { categoryId: String(form.get('categoryId')) }),
          source: String(form.get('source')),
          description: String(form.get('description')),
          ...(form.get('externalReference')
            ? { externalReference: String(form.get('externalReference')) }
            : {}),
        })
      }}
    >
      <h2 className="font-display text-lg text-ink-900">Record an entry</h2>
      <p className="mt-1 text-xs text-ink-500">
        Saved as pending. <strong>One</strong> other office bearer approves it and it posts —
        not two. You will not be able to approve or change it yourself.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field htmlFor="kind" label="Type" required>
          <Select
            id="kind"
            name="kind"
            required
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="income">Income — money received</option>
            <option value="expense">Expense — money paid out</option>
            <option value="transfer">Transfer — between two funds</option>
          </Select>
        </Field>

        <Field htmlFor="amount" label="Amount (₹)" required hint="e.g. 1500 or 1500.50">
          <Input id="amount" name="amount" required inputMode="decimal" placeholder="1500.00" />
        </Field>

        <Field htmlFor="date" label="Date" required>
          <Input
            id="date"
            name="date"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>

        <Field htmlFor="fundId" label={kind === 'income' ? 'Into which fund' : 'From which fund'} required>
          <Select id="fundId" name="fundId" required>
            {funds.data?.funds
              .filter((fund) => fund.active)
              .map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
          </Select>
        </Field>

        {kind === 'transfer' ? (
          <Field htmlFor="toFundId" label="Into which fund" required>
            <Select id="toFundId" name="toFundId" required>
              {funds.data?.funds
                .filter((fund) => fund.active)
                .map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field htmlFor="categoryId" label="Category" required>
            <Select id="categoryId" name="categoryId" required>
              {relevantCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          htmlFor="source"
          label={kind === 'income' ? 'Received from' : 'Paid to'}
          required
          hint="In your own words — this drives the by-source report"
        >
          <Input id="source" name="source" required placeholder="Ward 12 collection drive" />
        </Field>

        <Field htmlFor="externalReference" label="Cheque / UPI / bill number">
          <Input id="externalReference" name="externalReference" placeholder="INV-2291" />
        </Field>
      </div>

      <div className="mt-5">
        <Field htmlFor="description" label="Description" required>
          <Textarea id="description" name="description" required rows={2} />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          {create.isPending ? 'Saving…' : 'Save as pending'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm text-ink-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
