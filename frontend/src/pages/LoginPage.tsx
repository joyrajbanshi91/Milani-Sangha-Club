import { AlertTriangle, ArrowLeft, KeyRound, LogIn, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'

import { PageHero } from '@/components/layout/PageHero'
import { Container } from '@/components/ui/Container'
import { Field, Input } from '@/components/ui/Field'
import { Section } from '@/components/ui/Section'
import { ROLE_LABEL } from '@/config/constants'
import { useAuth } from '@/features/auth/authContext'
import { cn } from '@/lib/cn'
import { hueByIndex } from '@/lib/hues'

/**
 * Which door someone came in by.
 *
 * Presentation only. It changes the wording and where a successful sign-in lands,
 * and it grants nothing: the API decides what a caller may do from the role label on
 * their account, so an ordinary member who picks the office door signs in perfectly
 * well and simply has no finance area to be shown. `RequireOfficer` says so in plain
 * words rather than failing.
 *
 * Kept in the query string rather than the path so that no router change is needed
 * and a link like /login?as=office survives a reload and the back button.
 */
type Door = 'office' | 'member'

function parseDoor(value: string | null): Door | null {
  return value === 'office' || value === 'member' ? value : null
}

export function LoginPage() {
  const { user, loading, config } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()

  const destination = (location.state as { from?: string } | null)?.from
  const door = parseDoor(params.get('as'))

  if (user) {
    // Where they actually belong, from the role the server reported — never from the
    // door they chose.
    return <Navigate to={destination ?? (user.isFinanceOfficer ? '/office' : '/portal')} replace />
  }

  // A guard sent them here from somewhere specific, so skip the chooser: they have
  // already said where they were going.
  const chooserNeeded = door === null && destination === undefined

  return (
    <>
      <PageHero
        eyebrow="Member area"
        title={door === 'office' ? 'Office bearer sign-in' : 'Sign in'}
        lead={
          door === 'office'
            ? "For the president, secretary and treasurer. As well as the club's financial records, you have the same membership page as every other member."
            : 'Members can view their membership and pay their dues. Office bearers also see the club’s financial records.'
        }
      />

      <Section>
        <Container className="max-w-lg">
          {loading ? (
            <p className="text-ink-500 text-sm">Loading…</p>
          ) : config?.mode === 'demo' ? (
            <DemoPicker destination={destination} />
          ) : config?.mode === 'appwrite' ? (
            chooserNeeded ? (
              <DoorChooser />
            ) : (
              <>
                <PasswordForm destination={destination} door={door ?? 'member'} />
                {door ? (
                  <Link
                    to="/login"
                    className="text-ink-500 hover:text-ink-800 mt-5 inline-flex items-center gap-1.5 text-xs font-medium"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Choose a different sign-in
                  </Link>
                ) : null}
              </>
            )
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

/**
 * The two doors.
 *
 * Both lead to the same form and the same Appwrite sign-in. The split exists because
 * the two groups arrive with different questions — an officer wants the club's books,
 * a member wants their own subscription — and one undifferentiated form answers
 * neither.
 *
 * Deliberately says out loud that the choice does not decide access. Otherwise the
 * obvious reading of two doors is that picking the left one makes you a president,
 * and the first member to try it would think the site was broken when it did not.
 */
function DoorChooser() {
  const doors = [
    {
      to: '/login?as=office',
      icon: ShieldCheck,
      title: 'Office bearers',
      who: 'President · Secretary · Treasurer',
      body: "The club's funds, entries and reports, plus your own membership page.",
    },
    {
      to: '/login?as=member',
      icon: Users,
      title: 'General members',
      who: 'Every member of the club',
      body: 'Your membership status, dues and payment history.',
    },
  ]

  return (
    <>
      <ul className="grid gap-3">
        {doors.map((door, index) => {
          const hue = hueByIndex(index)

          return (
            <li key={door.to}>
              <Link
                to={door.to}
                className={cn(
                  'rounded-card shadow-soft flex w-full items-start gap-4 border bg-white p-5 text-left transition-all duration-300',
                  'hover:shadow-lift hover:-translate-y-0.5',
                  hue.border
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    hue.tile
                  )}
                >
                  <door.icon className="h-5 w-5" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-ink-900 block font-medium">{door.title}</span>
                  <span className="text-ink-500 mt-0.5 block text-xs">{door.who}</span>
                  <span className="text-ink-600 mt-2 block text-sm/relaxed">{door.body}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="text-ink-500 mt-5 text-xs/relaxed">
        Both use the same email address and password. The office bearer entrance admits only
        accounts the club office has given an officer role — a general member is redirected here
        rather than let in. If you are unsure, choose <strong>General members</strong>: it works for
        everyone, office bearers included.
      </p>
    </>
  )
}

/** Real sign-in, against Appwrite Authentication. */
function PasswordForm({ destination, door }: { destination?: string; door: Door }) {
  const { signIn, requestPasswordReset, signOut } = useAuth()
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
      const signedIn = await signIn(String(form.get('email')), String(form.get('password')))

      /**
       * The office-bearer entrance admits office bearers only.
       *
       * The check happens after the credentials are accepted, because it must: nothing
       * about an email address says what role it holds, and asking the server before
       * authenticating would let anyone discover who the officers are.
       *
       * A general member who arrives here is signed straight back out rather than left
       * holding a session they did not mean to start. The message names the other
       * entrance, so it is a redirection rather than a refusal — a member being told
       * "wrong door" must not be left thinking their password is wrong.
       *
       * Presentation, still: the API refuses a member's request whatever the browser
       * did, and `RequireOfficer` refuses the route. This door is the third layer, and
       * the only one that says anything useful at the moment of the mistake.
       */
      if (door === 'office' && !signedIn?.isFinanceOfficer) {
        await signOut()
        setError(
          signedIn
            ? 'That account is a general member, so it cannot use the office bearer ' +
                'sign-in. Please use the General members entrance — your membership, dues ' +
                'and payment history are all there.'
            : 'Signed in, but your role could not be confirmed. Please try the General ' +
                'members entrance.'
        )
        return
      }

      navigate(destination ?? (door === 'office' ? '/office' : '/portal'), { replace: true })
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
                  <span className="text-ink-500 block text-xs">
                    {ROLE_LABEL[account.role]}
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
