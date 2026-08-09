import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import type { PaymentMethod, PaymentPurpose } from '@/config/constants'
import { useAuth } from '@/features/auth/authContext'
import { formatPaise } from '@/features/finance/money'
import { financialYearOf } from '@/features/finance/years'
import { MonthPicker } from '@/features/payments/MonthPicker'
import {
  officePaymentsApi,
  type MemberRegisterRow,
  type OnBehalfSubmission,
} from '@/features/payments/api'
import {
  paidMonthsInside,
  selectedCount,
  type MonthSelection,
} from '@/features/payments/monthSelection'
import { ApiError } from '@/lib/api'

const MONTHS_IN_YEAR = 12

/**
 * Record a payment for a member who cannot use the app.
 *
 * Most clubs have them: members with an account they have never signed into — no
 * smartphone, a forgotten password, no wish to learn — who pay their subscription in
 * cash at the club as they always have. Without this their money either never reaches
 * their record or is entered as an anonymous ledger line, and their page says they have
 * paid nothing all year while the treasurer's book says otherwise.
 *
 * Three things about it are deliberate.
 *
 * **The member is chosen from the register, never typed.** A name in a text box cannot
 * be reconciled against anything; a uid from the roster attaches the money to the
 * person, and their months, their receipt and their page all follow from it.
 *
 * **It does not put anything in the books.** It joins the same queue a member's own
 * declaration joins, and a *different* bearer accepts it. That is the two-person rule
 * doing its job on the one route where an officer is the maker: the server refuses the
 * recorder their own entry, and the note below says so before they start rather than
 * after.
 *
 * **The amount for a subscription is computed, never typed.** The server refuses a
 * membership payment whose amount does not match the months it names, so a typed figure
 * could only ever produce a rejected form.
 */
export function RecordForMember() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [memberUid, setMemberUid] = useState('')
  const [purpose, setPurpose] = useState<PaymentPurpose>('membership')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [chosen, setChosen] = useState<MonthSelection | null>(null)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const year = financialYearOf(new Date())
  const roster = useQuery({
    queryKey: ['payments', 'roster', year],
    queryFn: () => officePaymentsApi.roster(year),
    enabled: open,
  })

  /**
   * Everybody except the officer using the form, and except members who have left.
   *
   * Their own name is absent because recording their own payment here is refused by the
   * server — an officer declares their own subscription on their own page, like anybody
   * else. Leaving it in the list would offer an action that cannot succeed.
   */
  const members = (roster.data?.members ?? [])
    .filter((member) => !member.former && member.uid !== user?.uid)
    .sort((a, b) => a.name.localeCompare(b.name))

  const selected: MemberRegisterRow | undefined = members.find(
    (member) => member.uid === memberUid
  )

  const months = selected?.membership.months ?? []
  const unpaid = months.filter((month) => !month.paid)
  const firstUnpaid = unpaid[0]?.month ?? ''

  // Same rule as the member's own form: start on the first month they have not paid,
  // because that is what somebody paying their subscription almost always wants.
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

  const alreadyPaid = paidMonthsInside(months, period)
  const monthCount = alreadyPaid.length > 0 ? 0 : selectedCount(months, period)

  const dues = roster.data?.dues
  const membershipPaise =
    dues && monthCount > 0
      ? monthCount === MONTHS_IN_YEAR
        ? dues.yearlyPaise
        : monthCount * dues.monthlyPaise
      : 0

  const submit = useMutation({
    mutationFn: (body: OnBehalfSubmission) => officePaymentsApi.recordFor(body),
    onSuccess: async (result) => {
      setError(null)
      setDone(result.message)
      setChosen(null)
      setAnchor(null)
      setMemberUid('')
      await queryClient.invalidateQueries({ queryKey: ['payments'] })
    },
    onError: (caught) => {
      setDone(null)
      setError(caught instanceof ApiError ? caught.message : 'That could not be recorded.')
    },
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-4 text-sm font-medium text-brand-800 hover:bg-brand-50"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Record a payment for a member
      </button>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const subscription = purpose === 'membership'

  return (
    <section className="rounded-card border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink-900">Record a payment for a member</h2>
          <p className="mt-1 max-w-2xl text-xs/relaxed text-ink-600">
            For a member who cannot use the app — no smartphone, or an account they have
            never signed into. It goes onto <strong>their</strong> record, so their page,
            their months and their receipt all follow from it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-ink-500 underline"
        >
          Close
        </button>
      </div>

      <p className="mt-3 flex gap-2 rounded-lg bg-white/70 p-3 text-xs/relaxed text-amber-900">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        This does not put the money in the books. You are entering it, so{' '}
        <strong>another office bearer must accept it</strong> — you cannot accept your own
        entry. Their name and yours both end up on the receipt.
      </p>

      {done ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm/relaxed text-emerald-900">
          {done}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm/relaxed text-red-700">
          {error}
        </p>
      ) : null}

      <form
        className="mt-4 space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)

          submit.mutate({
            memberUid,
            purpose,
            method,
            amount: subscription
              ? (membershipPaise / 100).toFixed(2)
              : String(form.get('amount')),
            paidOn: String(form.get('paidOn')),
            ...(subscription && period
              ? { periodStart: period.start, periodEnd: period.end }
              : {}),
            ...(method === 'cash'
              ? { handedTo: String(form.get('handedTo')) }
              : { externalReference: String(form.get('externalReference')) }),
            ...(form.get('note') ? { note: String(form.get('note')) } : {}),
          })
        }}
      >
        <Field htmlFor="memberUid" label="Which member" required>
          <Select
            id="memberUid"
            name="memberUid"
            required
            value={memberUid}
            onChange={(event) => {
              setMemberUid(event.target.value)
              setChosen(null)
              setAnchor(null)
              setDone(null)
              setError(null)
            }}
          >
            <option value="">Choose a member…</option>
            {members.map((member) => (
              <option key={member.uid} value={member.uid}>
                {member.name}
                {member.membership.monthsOverdue > 0
                  ? ` — ${member.membership.monthsOverdue} month${member.membership.monthsOverdue === 1 ? '' : 's'} overdue`
                  : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field htmlFor="purpose" label="What was it for" required>
            <Select
              id="purpose"
              name="purpose"
              required
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as PaymentPurpose)}
            >
              <option value="membership">Membership subscription</option>
              <option value="donation">Donation</option>
              <option value="event">Event</option>
              <option value="other">Other</option>
            </Select>
          </Field>

          <Field htmlFor="method" label="How they paid" required>
            <Select
              id="method"
              name="method"
              required
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank transfer or cheque</option>
            </Select>
          </Field>
        </div>

        {subscription ? (
          <Field
            htmlFor="months"
            label="Which months this pays for"
            hint={
              selected
                ? 'Click a month, then click another to cover a run. Months already paid cannot be chosen.'
                : 'Choose a member first.'
            }
            required
          >
            <div id="months">
              <MonthPicker
                months={months}
                selection={period}
                onSelect={pickMonth}
                disabled={!selected}
              />
              <p className="mt-2 text-xs text-ink-600">
                {alreadyPaid.length > 0 ? (
                  <span className="text-amber-800">
                    {alreadyPaid.map((month) => month.label).join(', ')} — already paid. Choose a
                    run that does not include {alreadyPaid.length === 1 ? 'it' : 'them'}.
                  </span>
                ) : monthCount > 0 ? (
                  <>
                    {monthCount} month{monthCount === 1 ? '' : 's'} ·{' '}
                    <strong className="text-ink-900">{formatPaise(membershipPaise)}</strong> at the
                    club's rate
                  </>
                ) : (
                  'Nothing selected yet.'
                )}
              </p>
            </div>
          </Field>
        ) : (
          <Field htmlFor="amount" label="Amount in rupees" required>
            <Input id="amount" name="amount" required inputMode="decimal" placeholder="500" />
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field htmlFor="paidOn" label="Date they paid" required>
            <Input id="paidOn" name="paidOn" type="date" required max={today} defaultValue={today} />
          </Field>

          {method === 'cash' ? (
            <Field
              htmlFor="handedTo"
              label="Who took the cash"
              hint="You, unless somebody else collected it."
              required
            >
              <Input id="handedTo" name="handedTo" required defaultValue={user?.name ?? ''} />
            </Field>
          ) : (
            <Field
              htmlFor="externalReference"
              label={method === 'upi' ? 'UPI transaction ID' : 'Cheque or bank reference'}
              required
            >
              <Input id="externalReference" name="externalReference" required />
            </Field>
          )}
        </div>

        <Field
          htmlFor="note"
          label="Note"
          hint="Anything the bearer accepting this should know — the receipt-book number, say."
        >
          <Textarea id="note" name="note" rows={2} maxLength={500} />
        </Field>

        <button
          type="submit"
          disabled={submit.isPending || !memberUid || (subscription && monthCount === 0)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-800 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {submit.isPending ? 'Recording…' : 'Record it'}
        </button>
      </form>
    </section>
  )
}
