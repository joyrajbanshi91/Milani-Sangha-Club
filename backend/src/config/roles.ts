import { FINANCE_ROLES, ROLES, type Role } from './constants.js'
import { env } from './env.js'
import { logger } from '../lib/logger.js'

/**
 * Who may look at the club's money, and who may move it.
 *
 * These used to be one question. The club's Cultural Secretary and Game Secretary made
 * it two: they should be able to *see* what the club is spending — they organise the
 * events it is spent on — without being able to record an entry, approve another
 * officer's, or verify a member's payment.
 *
 * So there are three states, and the club can move a role between them from the Appwrite
 * console without a code change or a deploy:
 *
 *   **Full** — `FINANCE_ROLES` (treasurer, secretary, president, administrator), plus
 *   anything in `FINANCE_ROLES_FULL`. Sees everything and can record and approve.
 *
 *   **Read-only** — anything in `FINANCE_ROLES_READONLY`. Sees every screen in the
 *   office area; every button that changes something is refused, by the server as well
 *   as being hidden by the browser.
 *
 *   **None** — everybody else. A member sees the portal and nothing more.
 *
 * To promote the Cultural Secretary: move `culturalSecretary` from the read-only
 * variable to the full one and restart the function. To demote them again, move it
 * back. That is the whole procedure, and it is why these are variables rather than a
 * list in the source: a club that cannot change its own permissions changes them some
 * other way, usually by sharing the treasurer's password.
 *
 * ## What the variables cannot do
 *
 *   • They cannot take access away from the four core roles. A mistyped value can lock
 *     nobody out of their own books.
 *   • They cannot invent a role. A word that is not one of `ROLES` is ignored and named
 *     in the log — a silent typo looks exactly like the feature not working, and
 *     silently granting something nobody asked for is worse.
 *   • Full wins over read-only if a role is somehow in both, because that is the
 *     reading in which nobody is mysteriously refused a button they were promised.
 *
 * Read once, when the service starts. A permission set that changed between two
 * requests in one session would be very hard to reason about, and restarting a function
 * after changing a variable is one click.
 */
interface Sets {
  full: readonly Role[]
  view: readonly Role[]
}

let cached: Sets | undefined

/** Turn a comma-separated variable into roles, naming anything it does not recognise. */
function parse(value: string | undefined, variable: string): Role[] {
  const found: Role[] = []

  for (const word of (value ?? '').split(',').map((part) => part.trim())) {
    if (word === '') continue

    // Case-insensitive: nobody typing into a dashboard should have to guess at the
    // capital letter in `culturalSecretary`.
    const match = ROLES.find((role) => role.toLowerCase() === word.toLowerCase())

    if (!match) {
      logger.warn(
        { variable, value: word, known: ROLES.join(', ') },
        'names a role that does not exist; ignoring it'
      )
      continue
    }

    if (!found.includes(match)) found.push(match)
  }

  return found
}

function sets(): Sets {
  if (cached) return cached

  const full = [...FINANCE_ROLES, ...parse(env.FINANCE_ROLES_FULL, 'FINANCE_ROLES_FULL')].filter(
    (role, index, all) => all.indexOf(role) === index
  )

  // A role promoted to full is not also read-only; full is the stronger of the two.
  const readOnly = parse(env.FINANCE_ROLES_READONLY, 'FINANCE_ROLES_READONLY').filter(
    (role) => !full.includes(role)
  )

  if (full.length > FINANCE_ROLES.length || readOnly.length > 0) {
    logger.info(
      {
        full: full.filter((role) => !FINANCE_ROLES.includes(role)).join(', ') || '(none extra)',
        readOnly: readOnly.join(', ') || '(none)',
      },
      'finance access beyond the four core roles'
    )
  }

  cached = { full, view: [...full, ...readOnly] }
  return cached
}

/** Roles that may record, approve, reverse and verify — move the club's money. */
export function financeRoles(): readonly Role[] {
  return sets().full
}

/** Roles that may open the office area and read it, whether or not they may act. */
export function financeViewRoles(): readonly Role[] {
  return sets().view
}

/** Forget the cached sets. Tests only. */
export function resetFinanceRolesForTests(): void {
  cached = undefined
}
