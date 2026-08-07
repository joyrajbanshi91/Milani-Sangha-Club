import type { NextFunction, Request, Response } from 'express'

import type { Role } from '../config/constants.js'
import { canViewFinances, isFinanceOfficer } from '../domain/approval.js'
import { forbidden, unauthorised } from '../lib/httpError.js'
import type { AuthService } from '../services/authService.js'

/**
 * Authentication and authorisation.
 *
 * `requireAuth` establishes who is calling from their bearer token. The role comes
 * from the verified token, never from the request body or a header — the client
 * cannot claim to be the treasurer.
 *
 * `requireRole` and `requireFinanceOfficer` gate individual routes. These are the
 * server-side half of the rule; Firestore security rules enforce the same
 * boundary independently, so a bug here does not expose the ledger.
 */

export function requireAuth(auth: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization ?? ''
    const [scheme, token] = header.split(' ')

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      next(unauthorised('Sign in to continue.'))
      return
    }

    const actor = await auth.verify(token)
    if (!actor) {
      next(unauthorised('Your session has expired. Please sign in again.'))
      return
    }

    req.actor = actor
    next()
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = req.actor
    if (!actor) {
      next(unauthorised())
      return
    }
    if (!roles.includes(actor.role)) {
      next(forbidden('You do not have permission to do that.'))
      return
    }
    next()
  }
}

/**
 * Gate on the door of the finance area: may this person look?
 *
 * Wider than it used to be, because a club can now give a role read-only access — the
 * Cultural Secretary who wants to see what the club is spending without being able to
 * spend it. Ordinary members are still refused here, and the Appwrite rules refuse them
 * the tables independently. The message deliberately does not describe what is behind
 * the door.
 */
export function requireFinanceOfficer(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor
  if (!actor) {
    next(unauthorised())
    return
  }
  if (!canViewFinances(actor.role)) {
    next(forbidden('This area is limited to the club’s office bearers.'))
    return
  }
  next()
}

/**
 * Gate on every button that changes something.
 *
 * The read-only roles get past `requireFinanceOfficer` and stop here. Applied to the
 * write routes as well as being checked inside the domain, because two of them —
 * creating a fund and creating a category — have no domain rule of their own, and a
 * permission that depends on remembering to check it is one that will eventually not
 * be checked.
 *
 * The refusal says what the person can do instead, because "forbidden" on a screen they
 * were invited to open reads as a fault rather than as a rule.
 */
export function requireFinanceWriter(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor
  if (!actor) {
    next(unauthorised())
    return
  }
  if (!isFinanceOfficer(actor.role)) {
    next(
      forbidden(
        'You can see the club’s accounts but not change them. Ask the treasurer, ' +
          'secretary or president to record this.'
      )
    )
    return
  }
  next()
}
