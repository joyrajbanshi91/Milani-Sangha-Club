import { useAuth } from '@/features/auth/authContext'

/**
 * May the person looking at this screen change anything?
 *
 * The club has three states, not two: no access, **read-only**, and full. A Cultural
 * Secretary can open every screen in the office area and press none of the buttons —
 * they organise the events the club spends money on, and seeing what it costs is
 * reasonable without being able to record it.
 *
 * This hides the buttons. It is **not** the boundary: every write route refuses a
 * read-only role on the server, and would do so even if this returned true. Hiding a
 * control the server would refuse is a courtesy — being shown a button that always
 * fails is worse than not being shown it.
 *
 * Falls back to `isFinanceOfficer` when the flag is absent, which happens for the few
 * minutes a newer browser is talking to an older API during a deploy. Falling the other
 * way would hide the treasurer's own buttons and look like the site was broken.
 */
export function useCanRecordFinance(): boolean {
  const { user } = useAuth()
  return user?.canRecordFinance ?? user?.isFinanceOfficer ?? false
}

/** In the office area, but only to look. Used to explain why the buttons are absent. */
export function useIsFinanceViewerOnly(): boolean {
  const { user } = useAuth()
  return Boolean(user?.isFinanceOfficer) && user?.canRecordFinance === false
}

/** One sentence, used wherever the buttons would have been. */
export const READ_ONLY_NOTE =
  'You can see the club’s accounts but not change them. Ask the treasurer, secretary or ' +
  'president to record anything.'
