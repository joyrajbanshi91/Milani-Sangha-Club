import { AlertTriangle, KeyRound, LogIn, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { PageHero } from '@/components/layout/PageHero'
import { Container } from '@/components/ui/Container'
import { Field, Input } from '@/components/ui/Field'
import { Section } from '@/components/ui/Section'
import { useAuth } from '@/features/auth/authContext'
import { cn } from '@/lib/cn'
import { hueByIndex } from '@/lib/hues'

export function LoginPage() {
  const { user, loading, config } = useAuth()
  const location = useLocation()

  const destination = (location.state as { from?: string } | null)?.from

  if (user) {
    // Officers land in the finance area, members in their own portal.
    return <Navigate to={destination ?? (user.isFinanceOfficer ? '/office' : '/portal')} replace />
  }

  return (
    <>
      <PageHero
        eyebrow="Member area"
        title="Sign in"
        lead="Members can view their membership and pay their dues. Office bearers also see the club's financial records."
      />

      <Section>
        <Container className="max-w-lg">
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : config?.mode === 'appwrite' ? (
            <PasswordForm destination={destination} />
          ) : config?.mode === 'demo' ? (
            <DemoPicker destination={destination} />
          ) : (
            <p role="alert" className="rounded-card bg-red-50 p-4 text-sm text-red-700">
              Could not reach the club's server. Is the API running?
            </p>
          )}
        </Container>
      </Section>
    </>
  )
}

/** Real sign-in, against Appwrite Authentication. */
function PasswordForm({ destination }: { destination?: string }) {
  const { signIn, requestPasswordReset } = useAuth()
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      await signIn(String(form.get('email')), String(form.get('password')))
      navigate(destination ?? '/portal', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (email.trim() === '') {
      setError('Enter your email address first, then choose "reset".')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      // Deliberately the same message whether or not the account exists.
      setNotice(
        `If ${email.trim()} has an account, a link to set a new password is on its way. Check the spam folder too.`
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-card border-ink-200 shadow-soft border bg-white p-6">
      <div className="space-y-5">
        <Field htmlFor="email" label="Email address" required>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field htmlFor="password" label="Password" required>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="bg-brand-50 text-brand-900 mt-4 rounded-lg p-3 text-sm/relaxed">
          {notice}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="from-brand-700 to-brand-500 shadow-glow inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r px-6 text-sm font-medium text-white disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void reset()}
          className="border-ink-200 text-ink-700 inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Reset password
        </button>
      </div>

      <p className="text-ink-500 mt-5 text-xs/relaxed">
        Accounts are created by the club office. If you are a member and do not have one yet, please
        contact the secretary.
      </p>
    </form>
  )
}

/** Development sign-in, shown only while no Appwrite project is connected. */
function DemoPicker({ destination }: { destination?: string }) {
  const { config, signInDemo } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (email: string) => {
    setBusy(email)
    setError(null)
    try {
      await signInDemo(email)
      navigate(destination ?? '/portal', { replace: true })
    } catch {
      setError('That sign-in did not work. Is the API running?')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="rounded-card flex gap-3 border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="text-sm/relaxed text-amber-800">
          <p className="font-semibold">Demonstration sign-in</p>
          <p className="mt-1">
            No Appwrite project is connected, so these are fixed accounts with no passwords, and the
            data resets when the API restarts. See{' '}
            <code className="rounded bg-white/70 px-1">docs/10-appwrite.md</code> to switch to real
            sign-in.
          </p>
        </div>
      </div>

      <ul className="mt-6 grid gap-3">
        {config?.accounts?.map((account, index) => {
          const hue = hueByIndex(index)
          const officer = account.role !== 'member'

          return (
            <li key={account.email}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void signIn(account.email)}
                className={cn(
                  'rounded-card shadow-soft flex w-full items-center gap-4 border bg-white p-4 text-left transition-all duration-300',
                  'hover:shadow-lift hover:-translate-y-0.5 disabled:opacity-60',
                  hue.border
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    hue.tile
                  )}
                >
                  {officer ? (
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <LogIn className="h-5 w-5" aria-hidden="true" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-ink-900 block font-medium">{account.name}</span>
                  <span className="text-ink-500 block text-xs capitalize">
                    {account.role}
                    {officer
                      ? ' — sees the finances and can approve entries'
                      : ' — membership only, no access to the finances'}
                  </span>
                </span>

                <span className="text-brand-700 shrink-0 text-xs font-medium">
                  {busy === account.email ? 'Signing in…' : 'Sign in'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </>
  )
}
