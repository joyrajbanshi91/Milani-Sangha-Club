import { BadgeCheck, Banknote, Copy, Info, QrCode, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'

import { Container } from '@/components/ui/Container'
import { Field, Input, Select } from '@/components/ui/Field'
import { club, membership } from '@/content/site'
import { ChangePassword } from '@/features/auth/ChangePassword'
import { useAuth } from '@/features/auth/authContext'
import { ProfilePhoto } from '@/features/profile/ProfilePhoto'
import { cn } from '@/lib/cn'

type Method = 'upi' | 'cash'

/**
 * The member's own area.
 *
 * Membership and paying dues, and deliberately nothing about the club's finances —
 * no balances, no totals, not even a link. A member who went looking would be
 * refused by the API and by the database rules as well.
 *
 * Both payment routes end the same way (SRS §8): the member says what they paid,
 * and the treasurer verifies it against the club's records before a receipt
 * exists. Nothing here marks a payment as received.
 */
export function MemberPortalPage() {
  const { user } = useAuth()
  const [method, setMethod] = useState<Method>('upi')
  const [submitted, setSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)

  const reference = `REF-${new Date().getFullYear()}-PENDING`

  return (
    <Container className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">My membership</h1>
        <p className="mt-1 text-sm text-ink-500">
          Signed in as {user?.name} · {user?.role}
        </p>
      </div>

      <ProfilePhoto />

      <ChangePassword />

      {/* Status */}
      <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <BadgeCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg text-ink-900">Membership status</h2>
            <p className="mt-1 text-sm/relaxed text-ink-600">
              Your membership number, category and validity appear here once the membership records
              are set up. That needs the club's decisions on the membership year, the fee for each
              category and how family membership works.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-3">
          {[
            { label: 'Membership number', value: 'To be assigned' },
            { label: 'Category', value: 'To be confirmed' },
            { label: 'Valid until', value: 'To be confirmed' },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs uppercase tracking-wide text-ink-500">{item.label}</dt>
              <dd className="mt-1 text-sm font-medium text-ink-400">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Pay dues */}
      <section className="rounded-card border border-brand-200 bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg text-ink-900">Pay my dues</h2>
        <p className="mt-1 text-sm/relaxed text-ink-600">
          Choose how you are paying. Either way, the treasurer confirms it against the club's records
          before your receipt is issued.
        </p>

        {/* Method */}
        <div
          role="group"
          aria-label="How are you paying?"
          className="mt-5 grid gap-3 sm:grid-cols-2"
        >
          {(
            [
              {
                key: 'upi' as Method,
                icon: Smartphone,
                title: 'By UPI',
                body: 'Pay from your phone, then enter the transaction ID.',
              },
              {
                key: 'cash' as Method,
                icon: Banknote,
                title: 'In cash',
                body: 'Hand the cash to an office bearer and record it here.',
              },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={method === option.key}
              onClick={() => {
                setMethod(option.key)
                setSubmitted(false)
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

            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-500">Club UPI ID</p>
                <p className="mt-1 font-mono text-sm text-ink-400">
                  {club.contact.email ? 'Not yet configured' : 'Not yet configured'}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-ink-500">Your reference number</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="rounded bg-ink-100 px-2 py-1 text-sm">{reference}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(reference)
                      setCopied(true)
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-ink-200 px-2 text-xs text-ink-600 hover:bg-ink-50"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Quote this in the UPI payment note so the treasurer can match it.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 border-t border-ink-100 pt-5">
            <div className="flex gap-3 rounded-card border border-amber-200 bg-amber-50 p-4">
              <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <div className="text-sm/relaxed text-amber-900">
                <p className="font-semibold">Paying in cash</p>
                <p className="mt-1">
                  Hand the cash to an office bearer at the club office during opening hours
                  {club.contact.officeHours ? ` (${club.contact.officeHours})` : ''}, and record the
                  details below. Please ask for an acknowledgement at the time — your formal receipt
                  follows once the treasurer has entered the cash into the club's books.
                </p>
              </div>
            </div>
          </div>
        )}

        <form
          className="mt-6 border-t border-ink-100 pt-5"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field htmlFor="amountPaid" label="Amount paid (₹)" required>
              <Input id="amountPaid" name="amountPaid" required inputMode="decimal" />
            </Field>

            <Field htmlFor="paidOn" label="Date paid" required>
              <Input
                id="paidOn"
                name="paidOn"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>

            {method === 'upi' ? (
              <Field
                htmlFor="upiTransactionId"
                label="UPI transaction ID"
                required
                hint="The reference your UPI app shows after payment"
              >
                <Input id="upiTransactionId" name="upiTransactionId" required inputMode="numeric" />
              </Field>
            ) : (
              <Field
                htmlFor="receivedBy"
                label="Given to"
                required
                hint="Which office bearer took the cash"
              >
                <Select id="receivedBy" name="receivedBy" required defaultValue="">
                  <option value="" disabled>
                    Choose one…
                  </option>
                  <option value="treasurer">Treasurer</option>
                  <option value="secretary">Secretary</option>
                  <option value="president">President</option>
                  <option value="other">Another office bearer</option>
                </Select>
              </Field>
            )}

            <Field
              htmlFor="note"
              label={method === 'cash' ? 'Acknowledgement number' : 'Note'}
              hint={method === 'cash' ? 'If you were given a slip' : undefined}
            >
              <Input id="note" name="note" />
            </Field>
          </div>

          <button
            type="submit"
            className="mt-5 inline-flex h-10 items-center rounded-full bg-brand-800 px-5 text-sm font-medium text-white"
          >
            Submit for verification
          </button>
        </form>

        {submitted ? (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm/relaxed text-amber-900">
            Noted — <strong>but not yet saved</strong>. The payments module is not built, so this form
            stores nothing. It shows the flow you will get: submitted →{' '}
            {method === 'cash'
              ? 'treasurer confirms the cash was received and enters it in the books'
              : 'treasurer matches the transaction against the bank'}{' '}
            → receipt issued.
          </p>
        ) : null}

        <p className="mt-4 flex gap-2 rounded-lg bg-brand-50 p-3 text-xs/relaxed text-brand-900">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            A receipt is only ever issued after the treasurer has confirmed your payment against the
            club's records. Nobody can mark a payment as received without that check — including for
            cash, which an office bearer must also enter into the books with a second officer's
            approval.
          </span>
        </p>
      </section>

      {/* Fees, from the public content so there is one source */}
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

      <p className="flex gap-2 rounded-card border border-ink-200 bg-ink-50 p-4 text-xs/relaxed text-ink-600">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Downloading your membership card, your payment history and your receipts arrive with the
          payments and receipts modules. They need the club's membership decisions first.
        </span>
      </p>
    </Container>
  )
}
