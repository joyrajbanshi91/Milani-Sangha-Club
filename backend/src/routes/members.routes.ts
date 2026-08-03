import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { badRequest, unauthorised } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { getContainer } from '../services/container.js'
import { PhotoRejected, assertValidPhoto } from '../services/profileStore.js'

/**
 * A member's own record.
 *
 * Every route is scoped to the caller's own uid taken from their verified token —
 * there is no `/members/:uid` here, so one member cannot read another's profile by
 * changing a number in the address bar.
 */
export const membersRouter = Router()

const { auth, profiles } = getContainer()

membersRouter.use(requireAuth(auth))

membersRouter.get('/me', async (req: Request, res: Response) => {
  const actor = req.actor
  if (!actor) throw unauthorised()

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
