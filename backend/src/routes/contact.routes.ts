import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { AppError } from '../lib/httpError.js'
import { logger } from '../lib/logger.js'
import { enquiryRecipient, isMailConfigured, sendEnquiry } from '../lib/mailer.js'
import { sensitiveLimiter } from '../middleware/rateLimit.js'

/**
 * The public contact form.
 *
 * The only route in this API that anybody at all may call, and the only one that sends
 * email — so it is also the only one an abuser can point at somebody else. Four things
 * hold that down:
 *
 *   • **The recipient is not in the request.** It is `CONTACT_TO` in the environment.
 *     A form that carries its own `to` is an open relay, and open relays are found by
 *     automated scanners within days of going live.
 *   • **`sensitiveLimiter`** — ten submissions per quarter of an hour per caller, the
 *     same limit sign-in and password reset use.
 *   • **A honeypot field.** Browsers never fill `website` because it is not on screen;
 *     form-filling bots fill everything they find. A submission with it set is answered
 *     with a cheerful 200 and thrown away, because telling a bot it was detected only
 *     teaches it to try again differently.
 *   • **A twenty-character minimum on the message.** Not a spam measure so much as a
 *     usefulness one: "call me" with no context is an enquiry nobody can answer.
 *
 * What it deliberately does *not* do is store the enquiry. A help-desk with tickets is
 * a later phase; until then the club's inbox is the record, and inventing a second
 * half-maintained one would mean enquiries sitting unanswered in a database nobody
 * opens.
 */
export const contactRouter = Router()

const enquirySchema = z
  .object({
    name: z.string().trim().min(2, 'Please give your name').max(120),
    email: z.email('That email address does not look right'),
    phone: z.string().trim().max(20).optional(),
    subject: z.string().trim().min(1, 'Please choose a subject').max(120),
    message: z
      .string()
      .trim()
      .min(20, 'Please give a little more detail — at least 20 characters')
      .max(2000, 'Please keep the message under 2000 characters'),
    /**
     * The honeypot. Never rendered, so a human cannot fill it in.
     *
     * Accepted by the schema rather than rejected by it, deliberately: a 400 tells a bot
     * precisely which field gave it away, and the next attempt leaves that one alone.
     * The handler below takes it, answers 202, and throws the message in the bin.
     */
    website: z.string().max(300).optional(),
  })
  .strict()

contactRouter.post('/', sensitiveLimiter, async (req: Request, res: Response) => {
  const enquiry = enquirySchema.parse(req.body)

  if (enquiry.website) {
    // Answered as though it worked. A bot told it was caught comes back in disguise;
    // one that believes it succeeded moves on.
    logger.warn({ ip: req.ip }, 'contact form honeypot filled; discarded')
    res.status(202).json({ message: 'Thank you — your message has been sent to the club.' })
    return
  }

  if (!isMailConfigured() || !enquiryRecipient()) {
    /**
     * Not configured is a 503, and it says what to do instead.
     *
     * The visitor has typed a message and pressed a button; the one thing they must not
     * get is silence. A 503 naming the club's address means their enquiry is not lost —
     * they can write it themselves — and the front end shows exactly that.
     */
    throw new AppError(
      503,
      'mail_not_configured',
      'The club’s website cannot send email yet. Please write to the address on this page instead — ' +
        'your message has not been sent.'
    )
  }

  const result = await sendEnquiry(enquiry)

  if (!result.ok) {
    throw new AppError(
      502,
      'mail_failed',
      'Your message could not be sent just now. Please write to the address on this page instead — ' +
        'nothing has been sent to the club.'
    )
  }

  res.status(201).json({
    message: 'Thank you — your message has been sent to the club. Somebody will reply to you.',
  })
})
