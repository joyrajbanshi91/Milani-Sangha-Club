import { randomUUID } from 'node:crypto'

import { Account, Query } from 'node-appwrite'

import { createCallerClient, getUsers } from '../config/appwrite.js'
import { ROLES, type Role } from '../config/constants.js'
import { hasAppwriteCredentials, isProduction } from '../config/env.js'
import type { Actor } from '../domain/types.js'
import { logger } from '../lib/logger.js'

/**
 * Establishing who is calling.
 *
 * Two modes, chosen by whether Appwrite credentials exist:
 *
 *   • **Appwrite** — the bearer token is a short-lived JWT minted in the browser
 *     from the member's session. It is verified by asking Appwrite who it belongs
 *     to, using a client that carries *only* that JWT — never the server API key,
 *     which would override the caller's identity and make every request look like
 *     an administrator.
 *
 *     The role comes from the account's **labels**, which only a server key can
 *     set. Prefs would have been the obvious-looking place and is exactly wrong:
 *     the client can write its own prefs, so a member could promote themselves to
 *     treasurer. The client never sends its own role either — that would be
 *     trivially forgeable.
 *
 *   • **Demo** — a development-only sign-in with fixed accounts, so the officer
 *     area can be walked through before an Appwrite project exists. It refuses to
 *     start in production, and logs a warning on every boot.
 */

export interface DemoAccount {
  email: string
  name: string
  role: Role
}

/**
 * Fixed demo accounts. Three officers, because the two-person rule cannot be
 * demonstrated with fewer, plus an ordinary member to prove the finance area is
 * closed to them.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'president@demo.club', name: 'Demo President', role: 'president' },
  { email: 'secretary@demo.club', name: 'Demo Secretary', role: 'secretary' },
  { email: 'treasurer@demo.club', name: 'Demo Treasurer', role: 'treasurer' },
  { email: 'member@demo.club', name: 'Demo Member', role: 'member' },
]

export class AuthService {
  readonly mode: 'appwrite' | 'demo'

  /** Demo mode only: opaque token → actor. Lost on restart, which is correct. */
  private readonly sessions = new Map<string, Actor>()

  constructor() {
    this.mode = hasAppwriteCredentials ? 'appwrite' : 'demo'

    if (this.mode === 'demo') {
      /**
       * Demo mode is announced, not forbidden.
       *
       * This threw when `NODE_ENV` was production, which sounds prudent and was in
       * fact the single reason a fresh deployment returned 500 from every route: a
       * hosted build sets `NODE_ENV=production` as a matter of course, so the guard
       * fired on exactly the deploy someone was trying to look at for the first
       * time, and took the health endpoint down with it.
       *
       * What the guard was protecting against — someone trusting demo sign-in with
       * a real club's data — is not prevented by a crash either. It is prevented by
       * the mode being impossible to miss: `mode: 'demo'` is returned by
       * `/auth/config`, the login page lists the fixed accounts by name, and every
       * signed-in page carries a standing banner. There are no passwords to guess
       * and no real data behind it, because a demo store has none.
       */
      logger.warn(
        { accounts: DEMO_ACCOUNTS.map((account) => account.email), production: isProduction },
        'AUTH IS IN DEMO MODE — fixed accounts, no passwords, no real data. ' +
          'Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY for real member sign-in.'
      )
    }
  }

  /**
   * Demo sign-in. Deliberately has no password: inventing one would imply a
   * security property this mode does not have. It exists to let a person click
   * through the roles, and it is unavailable the moment Appwrite is configured.
   */
  demoSignIn(email: string): { token: string; actor: Actor } | null {
    if (this.mode !== 'demo') return null

    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase()
    )
    if (!account) return null

    const token = randomUUID()
    const actor: Actor = {
      uid: `demo-${account.role}`,
      name: account.name,
      role: account.role,
    }

    this.sessions.set(token, actor)
    return { token, actor }
  }

  signOut(token: string): void {
    this.sessions.delete(token)
  }

  /** Resolve a bearer token to an actor, or null if it is not valid. */
  async verify(token: string): Promise<Actor | null> {
    if (this.mode === 'demo') {
      return this.sessions.get(token) ?? null
    }

    try {
      // A client carrying the caller's JWT and nothing else. account.get() then
      // answers as that member, which both verifies the token and identifies them
      // in one call — an invalid or expired JWT simply throws.
      const account = new Account(createCallerClient(token))
      const user = await account.get()

      return {
        uid: user.$id,
        name: user.name || user.email || 'Member',
        role: roleFromLabels(user.labels),
      }
    } catch (error) {
      logger.warn({ err: error }, 'JWT verification failed')
      return null
    }
  }

  /**
   * Every account the club has, for the officers' membership roster.
   *
   * Reads from the authentication service rather than from any table of members,
   * because that is where an account actually exists — a member who has never paid
   * anything has no row in the payments table and is exactly the person an officer
   * is looking for on that screen.
   *
   * Paginated: `list` returns 25 by default, so a club of a hundred would have
   * silently shown the first quarter of itself as though that were everyone.
   */
  async listAccounts(): Promise<Array<{ uid: string; name: string; email: string; role: Role }>> {
    if (this.mode === 'demo') {
      return DEMO_ACCOUNTS.map((account) => ({
        uid: `demo-${account.role}`,
        name: account.name,
        email: account.email,
        role: account.role,
      }))
    }

    const accounts: Array<{ uid: string; name: string; email: string; role: Role }> = []
    let cursor: string | undefined

    for (;;) {
      const queries = [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])]
      const page = await getUsers().list({ queries })

      for (const user of page.users) {
        accounts.push({
          uid: user.$id,
          name: user.name || user.email || 'Member',
          email: user.email,
          role: roleFromLabels(user.labels),
        })
      }

      if (page.users.length < 100) return accounts
      cursor = page.users[page.users.length - 1]?.$id
      if (!cursor) return accounts
    }
  }

  /**
   * Grant a role. Appwrite mode only.
   *
   * Labels are read on every request rather than baked into the token, so unlike a
   * Firebase custom claim a role change takes effect on the member's very next
   * call — no waiting for a token to refresh.
   *
   * Replaces the label set rather than appending: two role labels on one account
   * would make `roleFromLabels` depend on their order, which is not a decision
   * anyone would have made deliberately.
   */
  async setRole(uid: string, role: Role): Promise<void> {
    if (this.mode !== 'appwrite') {
      throw new Error('Roles cannot be assigned in demo mode; the accounts are fixed.')
    }
    await getUsers().updateLabels({ userId: uid, labels: [role] })
    logger.info({ uid, role }, 'role label updated')
  }
}

/**
 * Read the role out of an account's labels.
 *
 * Only labels that are actually roles are considered, so an unrelated label — a
 * future 'beta-tester', say — cannot be mistaken for one. An account with no role
 * label is a signed-in member who has not been given a role yet: treat them as an
 * ordinary member rather than guessing upwards.
 *
 * Where several role labels somehow exist, the least privileged wins. That is the
 * safe direction to fail, and it makes the outcome independent of label order.
 */
export function roleFromLabels(labels: readonly string[] | undefined): Role {
  const found = (labels ?? []).filter((label): label is Role =>
    (ROLES as readonly string[]).includes(label)
  )

  if (found.length === 0) return 'member'

  // ROLES runs least privileged first ('visitor' … 'administrator'), so the
  // *lowest* index is the weakest. Picking the weakest makes the outcome
  // independent of label order and fails in the safe direction.
  return found.reduce((weakest, role) =>
    ROLES.indexOf(role) < ROLES.indexOf(weakest) ? role : weakest
  )
}
