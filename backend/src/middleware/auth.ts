import type { NextFunction, Request, Response } from 'express'

import type { Role } from '../config/constants.js'
import { isFinanceOfficer } from '../domain/approval.js'
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
 * Gate for everything in the finance area.
 *
 * Ordinary members are refused here and cannot read finance data from Firestore
 * either. The message deliberately does not describe what is behind the door.
 */
export function requireFinanceOfficer(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor
  if (!actor) {
    next(unauthorised())
    return
  }
  if (!isFinanceOfficer(actor.role)) {
    next(forbidden('This area is limited to the president, secretary and treasurer.'))
    return
  }
  next()
}
