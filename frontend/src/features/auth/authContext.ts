import { createContext, useContext } from 'react'

import type { Role } from '@/config/constants'

export interface SignedInUser {
  uid: string
  name: string
  role: Role
  isFinanceOfficer: boolean
}

export interface AuthConfig {
  mode: 'appwrite' | 'demo'
  /**
   * Which store is behind the API.
   *
   * Reported separately from `mode` because sign-in and the ledger are configured
   * separately, and it is `store: 'memory'` that means figures are not being kept.
   * Optional so an older API that predates the field does not fail to parse.
   */
  store?: 'memory' | 'appwrite'
  /**
   * Where the browser should reach Appwrite, when the API is using it.
   *
   * Sent by the server rather than compiled into the bundle, so the two cannot
   * disagree and no build-scope environment variable is needed. Neither value is a
   * secret. Absent in demo mode.
   */
  appwrite?: { endpoint: string; projectId: string }
  accounts?: Array<{ email: string; name: string; role: Role }>
  warning?: string
}

export interface AuthState {
  user: SignedInUser | null
  /** True while the stored session is being checked on first load. */
  loading: boolean
  config: AuthConfig | undefined

  /** Appwrite mode. Throws a readable Error on bad credentials. */
  signIn: (email: string, password: string) => Promise<void>
  /** Appwrite mode. Sends a reset email; never reveals whether the account exists. */
  requestPasswordReset: (email: string) => Promise<void>
  /**
   * Finish a reset from the emailed link, which carries `userId` and `secret`.
   *
   * The only way a password changes. There is deliberately no "change password while
   * signed in": the club asked for that removed, so everyone goes through the emailed
   * link, which proves control of the address on record. The trade-off is that a member
   * whose address is wrong cannot change their password at all until the office corrects
   * it — see docs/11-running-the-club-office.md § 2.
   */
  completePasswordReset: (userId: string, secret: string, newPassword: string) => Promise<void>
  /** Demo mode only. */
  signInDemo: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

/**
 * Kept separate from the provider component so that the provider module exports
 * only a component — which is what React Fast Refresh needs in order to reload
 * the tree without losing the signed-in session.
 */
export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
