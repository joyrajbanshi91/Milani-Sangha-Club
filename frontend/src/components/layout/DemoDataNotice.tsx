import { FlaskConical } from 'lucide-react'

import { Container } from '@/components/ui/Container'
import { useAuth } from '@/features/auth/authContext'

/**
 * Standing notice that the figures on screen are sample data.
 *
 * This is the safeguard that replaced a crash. The API used to refuse to start
 * without database credentials, on the reasoning that a club must never mistake a
 * demo ledger for its own accounts. The reasoning holds; refusing to start did not
 * serve it — it only meant a fresh deployment answered 500 from every route, so the
 * club could not see the site at all and the warning was never read by anyone.
 *
 * So the API now starts, reports `store: 'memory'` from `/auth/config`, and this
 * renders on every signed-in page until a real database is configured.
 *
 * Deliberately different from [DraftContentNotice](./DraftContentNotice.tsx): that
 * one is a small dismissible corner card shown only in development, because
 * placeholder *copy* is a publishing mistake. This is a full-width bar, shown in
 * production, and **cannot be dismissed** — a treasurer who dismisses it in the
 * morning and records twenty entries in the afternoon has lost twenty entries.
 */
export function DemoDataNotice() {
  const { config } = useAuth()

  // `undefined` while the config request is in flight, and on an older API that
  // does not report the field. Only an explicit 'memory' shows the bar, so a
  // network hiccup cannot make a real ledger look like a demo one.
  if (config?.store !== 'memory') return null

  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-900" role="status">
      <Container className="flex items-start gap-2.5 py-2.5">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-xs/relaxed">
          <span className="font-semibold">Sample data.</span> This site has no database
          connected, so the funds, entries and reports below are examples — and anything you
          record here is lost when the server restarts. Nothing is saved.
        </p>
      </Container>
    </div>
  )
}
