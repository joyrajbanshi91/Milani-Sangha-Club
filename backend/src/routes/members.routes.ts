import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { PAYMENT_METHODS, PAYMENT_PURPOSES } from '../config/constants.js'
import { isIsoDate } from '../domain/dates.js'
import { rupeesToPaise } from '../domain/money.js'
import type { Actor } from '../domain/types.js'
import { AppError, badRequest, notFound, unauthorised } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { getContainer } from '../services/container.js'
import { PhotoRejected, assertValidPhoto } from '../services/profileStore.js'
import { StoreConflictError } from '../services/store.js'

/**
 * A member's own record.
 *
 * Every route is scoped to the caller's own uid taken from their verified token —
 * there is no `/members/:uid` here, so one member cannot read another's profile or
 * payment history by changing a number in the address bar.
 */
export const membersRouter = Router()

const { auth, profiles, payments } = getContainer()

membersRouter.use(requireAuth(auth))

function actorOf(req: Request): Actor {
  const actor = req.actor
  if (!actor) throw unauthorised()
  return actor
}

membersRouter.get('/me', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  res.json({ profile: await profiles.get(actor.uid, actor.name) })
})

const photoSchema = z.object({
  /** A data URL produced by the browser after resizing. */
  photo: z.string().min(1),
})

membersRouter.put('/me/photo', async (req: Request, res: Response) => {
  const actor = req.actor
  if (!actor) throw unauthorised()

  const { photo } = photoSchema.parse(req.body)

  try {
    assertValidPhoto(photo)
  } catch (error) {
    // The browser resizes before upload, but that is a courtesy, not a control.
    throw badRequest(error instanceof PhotoRejected ? error.message : 'That image was rejected.')
  }

  const profile = await profiles.setPhoto(actor.uid, photo)
  res.json({ profile, message: 'Your picture has been updated.' })
})

membersRouter.delete('/me/photo', async (req: Request, res: Response) => {
  const actor = req.actor
  if (!actor) throw unauthorised()

  const profile = await profiles.setPhoto(actor.uid, null)
  res.json({ profile, message: 'Your picture has been removed.' })
})

// ---------------------------------------------------------------------------
// Declaring a payment to the club
//
// The member's half of the flow: they say what they paid, and an officer confirms
// it against the club's records before it reaches the books. These routes can
// therefore create a row a member controls, and nothing else — no fund, no
// category, no amount that counts towards a balance. The officer's half lives in
// finance.routes.ts behind requireFinanceOfficer.
// ---------------------------------------------------------------------------

const paymentSchema = z
  .object({
    purpose: z.enum(PAYMENT_PURPOSES),
    method: z.enum(PAYMENT_METHODS),
    /** Rupees as typed by a person. Converted to exact paise below. */
    amount: z.union([z.string(), z.number()]).transform((value, ctx) => {
      try {
        return rupeesToPaise(value)
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: error instanceof Error ? error.message : 'Enter a valid amount',
        })
        return z.NEVER
      }
    }),
    paidOn: z.string().refine(isIsoDate, 'Use the format YYYY-MM-DD'),
    externalReference: z.string().trim().max(128).optional(),
    handedTo: z.string().trim().max(128).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

membersRouter.get('/me/payments', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  res.json({ payments: await payments.listMine(actor.uid) })
})

membersRouter.post('/me/payments', async (req: Request, res: Response) => {
  const input = paymentSchema.parse(req.body)
  const actor = actorOf(req)

  // The name is taken from the verified account, not the form: a declaration must
  // say who actually made it.
  const result = await payments.submit(
    {
      memberUid: actor.uid,
      memberName: actor.name,
      purpose: input.purpose,
      method: input.method,
      amountPaise: input.amount,
      paidOn: input.paidOn,
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      ...(input.handedTo ? { handedTo: input.handedTo } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
    actor
  )

  if (!result.ok) throw toHttpError(result)

  res.status(201).json({
    payment: result.value,
    message:
      `Sent to the office bearers. Your acknowledgement number is ${result.value.reference} — quote it ` +
      'if you need to ask about this payment. A receipt follows once it has been verified.',
  })
})

membersRouter.post('/me/payments/:id/withdraw', async (req: Request, res: Response) => {
  const id = req.params.id
  if (typeof id !== 'string' || id === '') throw badRequest('Missing id.')

  const result = await payments.withdraw(id, actorOf(req))
  if (!result.ok) throw toHttpError(result)

  res.json({ payment: result.value, message: 'Withdrawn. The office bearers will not see it.' })
})

/** Map a domain refusal onto the right HTTP status. */
function toHttpError(result: { code: string; reason: string }): AppError {
  switch (result.code) {
    case 'not_found':
      return notFound(result.reason)
    case 'duplicate':
    case 'not_open':
    case 'not_owner':
      // 409: the request is well formed but conflicts with the state of the record.
      return new AppError(409, result.code, result.reason)
    default:
      return new AppError(400, result.code, result.reason)
  }
}

/** A losing race on the optimistic lock is a 409, not a 500. */
membersRouter.use(
  (error: unknown, _req: Request, _res: Response, next: (error?: unknown) => void) => {
    if (error instanceof StoreConflictError) {
      next(new AppError(409, 'conflict', error.message))
      return
    }
    next(error)
  }
)
