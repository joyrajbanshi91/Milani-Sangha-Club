import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Inbox, Loader2, Mail, Phone, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { Container } from '@/components/ui/Container'
import { Field, Input } from '@/components/ui/Field'
import type { EnquiryStatus } from '@/config/constants'
import { useAuth } from '@/features/auth/authContext'
import { canReadEnquiries, enquiriesApi, type Enquiry } from '@/features/enquiries/api'
import { formatDateTime } from '@/features/finance/money'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * What the website's visitors have written to the club.
 *
 * The secretary and the president, and nobody else — they answer the club's post, and a
 * stranger's name, address and telephone number should be readable by as few people as
 * the job needs. The server refuses everybody else; this page not appearing in the menu
 * is a courtesy, not the boundary.
 *
 * ## Why the club keeps these rather than relying on email
 *
 * An emailed enquiry depends on things the club does not control: an app password that
 * expires, 2-step verification switched off, a message filed as spam. Each of those loses
 * a message silently, and the person who wrote it has no way to know. Here a message
 * stays on the list until somebody says what was done about it — and that note is the
 * point, because "resolved" on its own tells the next secretary nothing six months later.
 */
const TABS: Array<{ key: EnquiryStatus | 'all'; label: string }> = [
  { key: 'new', label: 'To answer' },
  { key: 'resolved', label: 'Dealt with' },
  { key: 'all', label: 'All' },
]

function isStatus(value: string | null): value is EnquiryStatus | 'all' {
  return TABS.some((tab) => tab.key === value)
}

export function EnquiriesPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const status: EnquiryStatus | 'all' = isStatus(raw) ? raw : 'new'

  const { data, isLoading, error } = useQuery({
    queryKey: ['enquiries', status],
    queryFn: () => enquiriesApi.list(status),
    enabled: canReadEnquiries(user?.role),
  })

  if (!canReadEnquiries(user?.role)) {
    return (
      <Container>
        <p className="rounded-card border border-ink-200 bg-white p-6 text-sm/relaxed text-ink-600">
          The club's enquiries are kept for the secretary and the president. Ask one of them
          if you need to see a message.
        </p>
      </Container>
    )
  }

  return (
    <Container className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">Enquiries</h1>
        <p className="mt-1 max-w-3xl text-sm/relaxed text-ink-500">
          Messages sent through the contact page on the website. They stay here until somebody
          marks them dealt with and says what was done — so nothing is lost in a mailbox, and the
          club keeps a record of its answer.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={status === tab.key}
            onClick={() => setParams(tab.key === 'new' ? {} : { status: tab.key })}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              status === tab.key
                ? 'border-brand-300 bg-brand-50 text-brand-900'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
            )}
          >
            {tab.label}
            {tab.key === 'new' && data && data.counts.new > 0 ? (
              <span className="ml-2 rounded-full bg-brand-700 px-1.5 py-0.5 text-xs text-white">
                {data.counts.new}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 p-4 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'The enquiries could not be loaded.'}
        </p>
      ) : isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
      ) : data && data.enquiries.length > 0 ? (
        <ul className="space-y-3">
          {data.enquiries.map((enquiry) => (
            <EnquiryRow key={enquiry.id} enquiry={enquiry} />
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-ink-300 bg-white py-12 text-center text-sm text-ink-500">
          {status === 'new'
            ? 'Nothing is waiting to be answered.'
            : 'No enquiries with this status.'}
        </p>
      )}
    </Container>
  )
}

function EnquiryRow({ enquiry }: { enquiry: Enquiry }) {
  const queryClient = useQueryClient()
  const [resolving, setResolving] = useState(false)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['enquiries'] })
  }

  const onError = (caught: unknown) => {
    setProblem(caught instanceof ApiError ? caught.message : 'That could not be saved.')
  }

  const resolve = useMutation({
    mutationFn: () => enquiriesApi.resolve(enquiry.id, note.trim() || undefined),
    onSuccess: async () => {
      setProblem(null)
      setResolving(false)
      setNote('')
      await refresh()
    },
    onError,
  })

  const reopen = useMutation({
    mutationFn: () => enquiriesApi.reopen(enquiry.id),
    onSuccess: refresh,
    onError,
  })

  const remove = useMutation({
    mutationFn: () => enquiriesApi.remove(enquiry.id),
    onSuccess: refresh,
    onError,
  })

  const open = enquiry.status === 'new'

  return (
    <li className="rounded-card border border-ink-200 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                open ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              )}
            >
              {open ? 'To answer' : 'Dealt with'}
            </span>
            <span className="font-mono text-xs text-ink-400">{enquiry.reference}</span>
            <span className="text-xs text-ink-400">{formatDateTime(enquiry.receivedAt)}</span>
          </div>

          <p className="mt-2 font-medium text-ink-900">{enquiry.subject}</p>
          <p className="mt-0.5 text-sm text-ink-600">
            {enquiry.name}
            {' · '}
            {/* A reply is one click, which is the whole point of keeping the address. */}
            <a
              href={`mailto:${enquiry.email}?subject=${encodeURIComponent(`Re: ${enquiry.subject} (${enquiry.reference})`)}`}
              className="inline-flex items-center gap-1 text-brand-700 underline hover:text-brand-900"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {enquiry.email}
            </a>
            {enquiry.phone ? (
              <>
                {' · '}
                <a
                  href={`tel:${enquiry.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1 text-ink-700"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {enquiry.phone}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* The message itself, as written. `whitespace-pre-line` keeps their paragraphs. */}
      <p className="mt-3 whitespace-pre-line rounded-card bg-ink-50 p-3 text-sm/relaxed text-ink-800">
        {enquiry.message}
      </p>

      {enquiry.status === 'resolved' ? (
        <p className="mt-3 rounded-card border border-emerald-200 bg-emerald-50 p-3 text-sm/relaxed text-emerald-900">
          <strong>Dealt with by {enquiry.resolvedByName ?? 'the office'}</strong>
          {enquiry.resolvedAt ? ` on ${formatDateTime(enquiry.resolvedAt)}` : ''}
          {enquiry.resolutionNote ? <span className="block mt-1">{enquiry.resolutionNote}</span> : null}
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problem}
        </p>
      ) : null}

      {resolving ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            resolve.mutate()
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <Field
              htmlFor={`note-${enquiry.id}`}
              label="What was done"
              hint="Kept as the club's record of its answer. Optional, but the next secretary will thank you."
            >
              <Input
                id={`note-${enquiry.id}`}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Rang and explained the membership fee; sent the form by email."
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={resolve.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-800 px-5 text-sm font-medium text-white disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {resolve.isPending ? 'Saving…' : 'Mark dealt with'}
          </button>

          <button
            type="button"
            onClick={() => {
              setResolving(false)
              setNote('')
            }}
            className="inline-flex h-10 items-center rounded-full border border-ink-200 px-4 text-sm text-ink-700"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {open ? (
            <button
              type="button"
              onClick={() => setResolving(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-medium text-brand-900 hover:bg-brand-100"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Mark dealt with
            </button>
          ) : (
            <button
              type="button"
              disabled={reopen.isPending}
              onClick={() => reopen.mutate()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Not finished after all
            </button>
          )}

          {/*
            Deleting is how the club keeps this table small, and how a stranger's
            details stop being held once they are of no further use. It asks first,
            because the message is gone for good.
          */}
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${enquiry.reference} from ${enquiry.name}? The message and their ` +
                    'details are removed for good.'
                )
              ) {
                remove.mutate()
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

/** Shown on the office dashboard when messages are waiting. */
export function EnquiriesWaiting() {
  const { user } = useAuth()

  const { data } = useQuery({
    queryKey: ['enquiries', 'new'],
    queryFn: () => enquiriesApi.list('new'),
    enabled: canReadEnquiries(user?.role),
  })

  if (!data || data.counts.new === 0) return null

  return (
    <a
      href="/office/enquiries"
      className="flex items-center gap-3 rounded-card border border-brand-300 bg-brand-50 p-4 transition-colors hover:bg-brand-100"
    >
      <Inbox className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
      <p className="text-sm text-brand-900">
        <span className="font-semibold">
          {data.counts.new} enquir{data.counts.new === 1 ? 'y' : 'ies'} from the website
        </span>{' '}
        — somebody wrote to the club and is waiting for an answer →
      </p>
    </a>
  )
}
