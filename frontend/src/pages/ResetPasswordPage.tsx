import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { PageHero } from '@/components/layout/PageHero'
import { Container } from '@/components/ui/Container'
import { Field, Input } from '@/components/ui/Field'
import { LinkButton } from '@/components/ui/LinkButton'
import { Section } from '@/components/ui/Section'
import { useAuth } from '@/features/auth/authContext'

/**
 * Where the emailed password-reset link lands.
 *
 * This page did not exist. `requestPasswordReset` has always told Appwrite to send
 * members to `/reset-password`, and the router had no such route — so every reset
 * email led to the Not Found page. The feature looked implemented from the sign-in
 * screen, which showed a confirmation that the email was on its way, and was broken
 * at the only step that matters.
 *
 * Appwrite appends `userId` and `secret` to the link. The secret is valid for an hour
 * and is what stands in for a session here; there is no signed-in user yet, and this
 * deliberately does not create one — being signed in by following a link in an email
 * is not a property worth having.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const { completePasswordReset } = useAuth()
  const navigate = useNavigate()

  const userId = params.get('userId')
  const secret = params.get('secret')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const linkIsUsable = Boolean(userId && secret)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !secret) return

    const form = new FormData(event.currentTarget)
    const next = String(form.get('newPassword'))
    const confirm = String(form.get('confirmPassword'))

    setError(null)

    if (next !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    if (next.length < 8) {
      setError('Appwrite requires at least 8 characters. Longer is better than clever.')
      return
    }

    setBusy(true)
    try {
      await completePasswordReset(userId, secret, next)
      setDone(true)
      // Long enough to read the confirmation, short enough not to feel stuck.
      setTimeout(() => void navigate('/login', { replace: true }), 2500)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set the new password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Member area"
        title="Set a new password"
        lead="Choose a new password for your club account."
      />

      <Section>
        <Container className="max-w-lg">
          {!linkIsUsable ? (
            <div className="rounded-card border border-amber-300 bg-amber-50 p-5">
              <p className="text-sm/relaxed text-amber-900">
                <span className="font-semibold">This link is not complete.</span> A reset link
                carries a one-time code, and this address has none — which usually means it was
                copied by hand, or opened after the code had already been used.
              </p>
              <p className="mt-3 text-sm/relaxed text-amber-900">
                Reset links are valid for one hour. Ask for a fresh one from the sign-in page.
              </p>
              <LinkButton to="/login" className="mt-4">
                Back to sign in
              </LinkButton>
            </div>
          ) : done ? (
            <div
              role="status"
              className="rounded-card border-brand-200 bg-brand-50 text-brand-900 border p-5"
            >
              <p className="text-sm/relaxed">
                <span className="font-semibold">Your password has been changed.</span> Taking you to
                the sign-in page…
              </p>
              <LinkButton to="/login" className="mt-4">
                Sign in now
              </LinkButton>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="rounded-card border-ink-200 shadow-soft border bg-white p-6"
            >
              <div className="space-y-5">
                <Field htmlFor="newPassword" label="New password" required>
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="new-password"
                  />
                </Field>

                <Field htmlFor="confirmPassword" label="New password again" required>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="from-brand-700 to-brand-500 shadow-glow mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r px-6 text-sm font-medium text-white disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {busy ? 'Saving…' : 'Set new password'}
              </button>

              <p className="text-ink-500 mt-5 text-xs/relaxed">
                Already know your password?{' '}
                <Link to="/login" className="text-brand-700 font-medium underline">
                  Sign in instead
                </Link>
                .
              </p>
            </form>
          )}
        </Container>
      </Section>
    </>
  )
}
