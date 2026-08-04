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
   * Change your own password while signed in.
   *
   * The current password is required by Appwrite and that is the point: without it,
   * anyone who found an unlocked laptop could lock the real member out of their own
   * account. This is the everyday path — a member who has forgotten their password
   * cannot use it and needs `requestPasswordReset` instead.
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  /**
   * Finish a reset from the emailed link, which carries `userId` and `secret`.
   *
   * Separate from `changePassword` because there is no session yet — the secret from
   * the email stands in for one, and it is valid for an hour.
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
