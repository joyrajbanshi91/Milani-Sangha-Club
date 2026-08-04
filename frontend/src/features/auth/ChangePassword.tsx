import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { Field, Input } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/authContext'

/**
 * Change your own password, from inside the member area.
 *
 * This did not exist. The only way to change a password was the emailed reset link,
 * which meant a member handed a generated password by the club office had no way to
 * replace it with one they could remember — and the office had no way to stop holding
 * a password that still worked.
 *
 * Appwrite requires the current password, and that requirement is the security of the
 * feature: without it, an unlocked laptop would be enough to lock the real member out
 * of their own account.
 *
 * Shown to everyone signed in, officers included. A treasurer's password protects the
 * club's accounts and is the one most worth changing away from whatever was issued.
 */
export function ChangePassword() {
  const { changePassword, config } = useAuth()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Demo sign-in has no passwords, so there is nothing here to change.
  if (config?.mode !== 'appwrite') return null

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    const current = String(form.get('currentPassword'))
    const next = String(form.get('newPassword'))
    const confirm = String(form.get('confirmPassword'))

    setError(null)
    setDone(false)

    // Checked here as a courtesy — a mistyped confirmation should not cost a round
    // trip, and Appwrite would have no way to tell it from a deliberate choice.
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    if (next.length < 8) {
      setError('Appwrite requires at least 8 characters. Longer is better than clever.')
      return
    }
    if (next === current) {
      setError('That is the password you already have.')
      return
    }

    setBusy(true)
    try {
      await changePassword(current, next)
      setDone(true)
      event.currentTarget.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-card border-ink-200 shadow-soft border bg-white p-5">
      <div className="flex items-start gap-4">
        <span className="bg-brand-100 text-brand-700 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-ink-900 text-lg">Change your password</h2>
          <p className="text-ink-600 mt-1 text-sm/relaxed">
            If the club office gave you a password, change it to one only you know.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field htmlFor="currentPassword" label="Current password" required>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>

        <Field htmlFor="newPassword" label="New password" required>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
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

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="bg-brand-50 text-brand-900 rounded-lg p-3 text-sm/relaxed">
            Your password has been changed. Use the new one next time you sign in.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="from-brand-700 to-brand-500 shadow-glow inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r px-6 text-sm font-medium text-white disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  )
}
