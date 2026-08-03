import { Router, type Request, type Response } from 'express'

import { COLLECTIONS } from '../config/constants.js'
import { env, hasFirebaseCredentials } from '../config/env.js'
import { getDb } from '../config/firebase.js'

export const healthRouter = Router()

/**
 * Liveness probe. Deliberately dependency-free: it answers "is this process
 * running", which is the only question a restart policy should ask.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'milani-sangha-api',
    version: env.APP_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

/**
 * Readiness probe. Confirms the service can actually reach Firestore, so that a
 * bad credential is caught at deploy time rather than by the first member trying
 * to renew a membership.
 */
healthRouter.get('/ready', async (req: Request, res: Response) => {
  if (!hasFirebaseCredentials) {
    res.status(503).json({
      status: 'not_ready',
      checks: { firestore: 'not_configured' },
    })
    return
  }

  try {
    await getDb().collection(COLLECTIONS.settings).limit(1).get()
    res.json({ status: 'ready', checks: { firestore: 'ok' } })
  } catch (error) {
    // Logged here rather than by the request logger, which skips probe routes.
    // An unreachable Firestore is worth an alert; a 503 from every poll is not.
    req.log.error({ err: error }, 'readiness check failed: Firestore unreachable')
    res.status(503).json({
      status: 'not_ready',
      checks: {
        firestore: 'unreachable',
        message: error instanceof Error ? error.message : 'unknown error',
      },
    })
  }
})
