import { Router, type Request, type Response } from 'express'

import { env } from '../config/env.js'
import { getContainer } from '../services/container.js'

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
 * Readiness probe. Confirms the service can actually reach the database it is
 * configured to use, so that a bad credential is caught at deploy time rather than
 * by the first member trying to renew a membership.
 *
 * Probes whichever store is actually in use rather than a named product: it checked
 * Firestore unconditionally until the ledger moved to Appwrite, at which point it
 * reported `not_configured` on a perfectly healthy deployment — a readiness check
 * that lies is worse than none, because it is what you consult when something else
 * breaks.
 */
healthRouter.get('/ready', async (req: Request, res: Response) => {
  const { store } = getContainer()

  // Still a 503, deliberately. The API starts and serves the site in this state —
  // that is the point of the demo store — but "ready" means ready to hold the
  // club's accounts, and memory is not. The message says which variables change it,
  // because this endpoint is what someone checks when sign-in works but nothing
  // saves.
  if (store.kind === 'memory') {
    res.status(503).json({
      status: 'not_ready',
      checks: {
        database: 'not_configured',
        store: store.kind,
        message:
          'No database credentials, so the finance area is showing sample data that is ' +
          'lost on restart. Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY (or the ' +
          'FIREBASE_* trio) to use a real ledger. See docs/10-appwrite.md.',
      },
    })
    return
  }

  try {
    // Listing funds is the cheapest read that proves credentials, network and
    // schema all work: it goes through the same store the ledger uses.
    await store.listFunds()
    res.json({ status: 'ready', checks: { database: 'ok', store: store.kind } })
  } catch (error) {
    // Logged here rather than by the request logger, which skips probe routes.
    // An unreachable database is worth an alert; a 503 from every poll is not.
    req.log.error({ err: error }, 'readiness check failed: database unreachable')
    res.status(503).json({
      status: 'not_ready',
      checks: {
        database: 'unreachable',
        store: store.kind,
        message: error instanceof Error ? error.message : 'unknown error',
      },
    })
  }
})
