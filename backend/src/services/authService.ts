import { randomUUID } from 'node:crypto'

import type { Role } from '../config/constants.js'
import { hasFirebaseCredentials, isProduction } from '../config/env.js'
import { getAdminAuth } from '../config/firebase.js'
import type { Actor } from '../domain/types.js'
import { logger } from '../lib/logger.js'

/**
 * Establishing who is calling.
 *
 * Two modes, chosen by whether Firebase Admin credentials exist:
 *
 *   • **Firebase** — the bearer token is a Firebase ID token. It is verified with
 *     the Admin SDK and the role is read from a custom claim, which only the
 *     server can set. The client never sends its own role: that would be trivially
 *     forgeable.
 *
 *   • **Demo** — a development-only sign-in with fixed accounts, so the officer
 *     area can be walked through before a Firebase project exists. It refuses to
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
  readonly mode: 'firebase' | 'demo'

  /** Demo mode only: opaque token → actor. Lost on restart, which is correct. */
  private readonly sessions = new Map<string, Actor>()

  constructor() {
    this.mode = hasFirebaseCredentials ? 'firebase' : 'demo'

    if (this.mode === 'demo') {
      if (isProduction) {
        throw new Error(
          'Demo sign-in cannot run in production. Configure Firebase Admin credentials.'
        )
      }
      logger.warn(
        { accounts: DEMO_ACCOUNTS.map((account) => account.email) },
        'AUTH IS IN DEMO MODE — fixed accounts, no passwords. Never expose this beyond your machine.'
      )
    }
  }

  /**
   * Demo sign-in. Deliberately has no password: inventing one would imply a
   * security property this mode does not have. It exists to let a person click
   * through the roles, and it is unavailable the moment Firebase is configured.
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
      const decoded = await getAdminAuth().verifyIdToken(token, true)

      // The role lives in a custom claim, set by the server. A token without one
      // is a signed-in user who has not been given a role yet — treat them as an
      // ordinary member rather than guessing upwards.
      const role = (decoded.role as Role | undefined) ?? 'member'

      return {
        uid: decoded.uid,
        name: (decoded.name as string | undefined) ?? decoded.email ?? 'Member',
        role,
      }
    } catch (error) {
      logger.warn({ err: error }, 'ID token verification failed')
      return null
    }
  }

  /**
   * Grant a role. Firebase mode only.
   *
   * Custom claims reach the client on its next token refresh, so a role change
   * takes effect within the hour, or immediately if the client forces a refresh.
   */
  async setRole(uid: string, role: Role): Promise<void> {
    if (this.mode !== 'firebase') {
      throw new Error('Roles cannot be assigned in demo mode; the accounts are fixed.')
    }
    await getAdminAuth().setCustomUserClaims(uid, { role })
    logger.info({ uid, role }, 'role claim updated')
  }
}
