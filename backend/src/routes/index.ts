import { Router } from 'express'

import { authRouter } from './auth.routes.js'
import { contactRouter } from './contact.routes.js'
import { financeRouter } from './finance.routes.js'
import { healthRouter } from './health.routes.js'
import { membersRouter } from './members.routes.js'
import { reportsRouter } from './reports.routes.js'

/**
 * API v1 router.
 *
 * Feature routers are mounted here as their phases land:
 *   /auth          session and role claims           (Phase 3)
 *   /members       directory, profile, approvals     (Phase 5, 6)
 *   /applications  membership applications           (Phase 5)
 *   /payments      UPI reference, verification queue  (Phase 7)
 *   /receipts      PDF generation and verification   (Phase 8)
 *   /events        events, registration, attendance  (Phase 9)
 *   /gallery       albums and media                  (Phase 10)
 *   /finance       ledger, cashbook                  (Phase 11)
 *   /reports       PDF, Excel, CSV exports           (Phase 12)
 *   /notifications email, push, reminders            (Phase 13)
 *   /tickets       help desk                         (Phase 5)
 *   /settings      club configuration                (Phase 5)
 */
export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
/**
 * The public contact form — the only route here anybody at all may call.
 *
 * Rate-limited and honeypotted inside the router, and it sends to an address from the
 * environment rather than from the request. See contact.routes.ts.
 */
apiRouter.use('/contact', contactRouter)
// Scoped to the caller's own record; any signed-in member may use it.
apiRouter.use('/members', membersRouter)
// Both of these are gated by requireAuth + requireFinanceOfficer inside the
// router itself, so no finance route can be added without the guard.
apiRouter.use('/finance', financeRouter)
apiRouter.use('/reports', reportsRouter)
