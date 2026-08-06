import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { ENQUIRY_ROLES, ENQUIRY_STATUSES } from '../config/constants.js'
import { ENQUIRY_LIMITS, reopen, resolve } from '../domain/enquiry.js'
import { badRequest, notFound, unauthorised, AppError } from '../lib/httpError.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { getContainer } from '../services/container.js'
import { StoreConflictError } from '../services/store.js'

/**
 * The club's enquiries, as the office sees them.
 *
 * Every route here is behind `requireRole(...ENQUIRY_ROLES)` — the **secretary and the
 * president**, who answer the club's post. Deliberately not the treasurer: an enquiry is
 * not a financial record, and a stranger's name, address and telephone number should be
 * readable by as few people as the job allows.
 *
 * The public half — a visitor actually sending one — is in contact.routes.ts, which
 * needs no session at all.
 */
export const enquiriesRouter = Router()

const { auth, enquiries } = getContainer()

enquiriesRouter.use(requireAuth(auth), requireRole(...ENQUIRY_ROLES))

function actorOf(req: Request) {
  const actor = req.actor
  if (!actor) throw unauthorised()
  return actor
}

function param(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value === '') throw badRequest(`Missing ${name}.`)
  return value
}

enquiriesRouter.get('/', async (req: Request, res: Response) => {
  const raw = req.query.status
  const status =
    typeof raw === 'string' && (raw === 'all' || ENQUIRY_STATUSES.includes(raw as never))
      ? (raw as 'all')
      : 'all'

  const rows = await enquiries.list({ status })

  res.json({
    enquiries: rows,
    counts: {
      new: rows.filter((enquiry) => enquiry.status === 'new').length,
      resolved: rows.filter((enquiry) => enquiry.status === 'resolved').length,
    },
  })
})

const resolveSchema = z.object({
  note: z.string().trim().max(ENQUIRY_LIMITS.note).optional(),
})

/**
 * Mark one dealt with, with a note about what was done.
 *
 * The note is the reason this is worth more than a mailbox: six months later "resolved"
 * on its own tells the next secretary nothing, and the club's record of what it told
 * somebody is exactly the thing worth keeping.
 */
enquiriesRouter.post('/:id/resolve', async (req: Request, res: Response) => {
  const { note } = resolveSchema.parse(req.body ?? {})
  const id = param(req, 'id')

  const existing = await enquiries.get(id)
  if (!existing) throw notFound('That enquiry could not be found.')

  const actor = actorOf(req)
  const result = resolve(existing, actor, new Date().toISOString(), note)

  if (!result.ok) throw new AppError(409, result.code, result.reason)

  try {
    const saved = await enquiries.update(id, result.value, existing.status)
    res.json({ enquiry: saved, message: 'Marked as dealt with.' })
  } catch (error) {
    if (error instanceof StoreConflictError) throw new AppError(409, 'conflict', error.message)
    throw error
  }
})

/** Put one back in the open list, when it turns out not to be finished. */
enquiriesRouter.post('/:id/reopen', async (req: Request, res: Response) => {
  const id = param(req, 'id')

  const existing = await enquiries.get(id)
  if (!existing) throw notFound('That enquiry could not be found.')

  const result = reopen(existing)
  if (!result.ok) throw new AppError(409, result.code, result.reason)

  try {
    const saved = await enquiries.update(id, result.value, existing.status)
    res.json({ enquiry: saved, message: 'Put back in the open list.' })
  } catch (error) {
    if (error instanceof StoreConflictError) throw new AppError(409, 'conflict', error.message)
    throw error
  }
})

/**
 * Delete one for good.
 *
 * Spam, and enquiries the club has finished with. There is no audit trail behind this
 * and there does not need to be one: this is somebody's message to the club, not a
 * financial record, and the club asked to be able to keep the table small. Deleting is
 * also the only way to remove a stranger's personal details once they are of no further
 * use, which is a reason to have the button rather than an argument against it.
 */
enquiriesRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = param(req, 'id')

  const existing = await enquiries.get(id)
  if (!existing) throw notFound('That enquiry could not be found.')

  await enquiries.remove(id)
  res.json({ message: `${existing.reference} deleted.` })
})
