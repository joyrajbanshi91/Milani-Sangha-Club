import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { isFinanceOfficer } from '../domain/approval.js'
import { badRequest, unauthorised } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { sensitiveLimiter } from '../middleware/rateLimit.js'
import { DEMO_ACCOUNTS } from '../services/authService.js'
import { getContainer } from '../services/container.js'

export const authRouter = Router()

const { auth } = getContainer()

/**
 * What sign-in options exist.
 *
 * The web app asks this before rendering the login screen, so it shows a password
 * form against Firebase or the demo account picker, without having to guess.
 */
authRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    mode: auth.mode,
    ...(auth.mode === 'demo'
      ? {
          accounts: DEMO_ACCOUNTS.map(({ email, name, role }) => ({ email, name, role })),
          warning: 'Demo sign-in: fixed accounts, no passwords. Development only.',
        }
      : {}),
  })
})

const demoSignInSchema = z.object({ email: z.email() })

/** Development-only sign-in. Refused outright once Firebase is configured. */
authRouter.post('/demo-login', sensitiveLimiter, (req: Request, res: Response) => {
  if (auth.mode !== 'demo') {
    throw badRequest('Demo sign-in is disabled because Firebase authentication is configured.')
  }

  const { email } = demoSignInSchema.parse(req.body)
  const session = auth.demoSignIn(email)
  if (!session) throw unauthorised('That is not one of the demo accounts.')

  res.json({
    token: session.token,
    user: { ...session.actor, isFinanceOfficer: isFinanceOfficer(session.actor.role) },
  })
})

/** Who am I? The client uses this to decide which areas to show. */
authRouter.get('/me', requireAuth(auth), (req: Request, res: Response) => {
  const actor = req.actor
  if (!actor) throw unauthorised()

  res.json({
    user: { ...actor, isFinanceOfficer: isFinanceOfficer(actor.role) },
  })
})

authRouter.post('/logout', requireAuth(auth), (req: Request, res: Response) => {
  const token = (req.headers.authorization ?? '').split(' ')[1]
  if (token) auth.signOut(token)
  res.status(204).send()
})
