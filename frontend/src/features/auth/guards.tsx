import { Loader2, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { Container } from '@/components/ui/Container'
import { LinkButton } from '@/components/ui/LinkButton'
import { useAuth } from '@/features/auth/authContext'

/**
 * Route guards.
 *
 * These decide what to *render*. They are not the security boundary — the API
 * refuses a member's request regardless of what the browser shows, verifying the
 * caller's Appwrite JWT and reading their role from account labels, which only a
 * server key can set. Hiding a link is a courtesy; the server is the control.
 *
 * This is also why the two sign-in doors on /login grant nothing: they change the
 * wording and the landing page, and a member who picks the office door is refused
 * here, politely, rather than at the point of signing in.
 */

function Waiting() {
  return (
    <Container className="py-24 text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
      <p className="mt-3 text-sm text-ink-500">Checking your sign-in…</p>
    </Container>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Waiting />
  // Remember where they were going, so sign-in returns them there.
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  return <>{children}</>
}

/** For the finance area: signed in *and* an office bearer. */
export function RequireOfficer({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Waiting />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  if (!user.isFinanceOfficer) {
    return (
      <Container className="py-24">
        <div className="mx-auto max-w-lg rounded-card border border-amber-200 bg-amber-50 p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl text-ink-900">Not available to you</h1>
          <p className="mt-3 text-sm/relaxed text-ink-600">
            The club's financial records are limited to the president, secretary and treasurer. Your
            membership area has everything else.
          </p>
          <LinkButton to="/portal" className="mt-6">
            Go to my membership
          </LinkButton>
        </div>
      </Container>
    )
  }

  return <>{children}</>
}
