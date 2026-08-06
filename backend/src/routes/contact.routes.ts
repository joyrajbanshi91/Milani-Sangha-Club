import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { ENQUIRY_LIMITS } from '../domain/enquiry.js'
import { logger } from '../lib/logger.js'
import { enquiryRecipient, isMailConfigured, sendEnquiry } from '../lib/mailer.js'
import { sensitiveLimiter } from '../middleware/rateLimit.js'
import { getContainer } from '../services/container.js'

/**
 * The public contact form.
 *
 * The only route in this API that anybody at all may call. It does two things, in this
 * order, and the order is the whole design:
 *
 *   1. **Writes the enquiry to the club's own records.** This is what makes it reliable.
 *      An emailed enquiry depends on things the club does not control — an app password
 *      that expires, 2-step verification switched off, a message filed as spam — and
 *      every one of those loses a message silently. Stored, it is on a screen the
 *      secretary and president open, and it stays there until somebody deals with it.
 *   2. **Emails it, if email is configured.** A notification now, not the record. If it
 *      fails, the visitor is still told their message reached the club, because it did.
 *
 * That inversion is the point. It used to answer 503 when email was not set up, which
 * meant the club could not receive enquiries at all until an app password existed.
 *
 * Four things hold down the abuse this route invites, being public and writing to a
 * database:
 *
 *   • **Every field is capped** — see ENQUIRY_LIMITS. This is the one table a stranger
 *     can write into, so the columns are as small as a real enquiry needs.
 *   • **`sensitiveLimiter`** — ten submissions per quarter of an hour per caller.
 *   • **A honeypot field.** Browsers never fill `website` because it is not on screen;
 *     form-filling bots fill everything. A submission with it set gets a cheerful 202
 *     and is thrown away — telling a bot it was caught only teaches it to try again.
 *   • **The email recipient is never in the request.** It is `CONTACT_TO`. A form that
 *     carries its own `to` is an open mail relay, and scanners find those in days.
 */
export const contactRouter = Router()

const { enquiries } = getContainer()

const enquirySchema = z
  .object({
    name: z.string().trim().min(2, 'Please give your name').max(ENQUIRY_LIMITS.name),
    email: z.email('That email address does not look right').max(ENQUIRY_LIMITS.email),
    phone: z.string().trim().max(ENQUIRY_LIMITS.phone).optional(),
    subject: z.string().trim().min(1, 'Please choose a subject').max(ENQUIRY_LIMITS.subject),
    message: z
      .string()
      .trim()
      .min(20, 'Please give a little more detail — at least 20 characters')
      .max(
        ENQUIRY_LIMITS.message,
        `Please keep the message under ${ENQUIRY_LIMITS.message} characters — about 150 words.`
      ),
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
    logger.warn({ ip: req.ip }, 'contact form honeypot filled; discarded')
    res.status(202).json({ message: 'Thank you — your message has been sent to the club.' })
    return
  }

  const { website: _honeypot, ...submission } = enquiry

  /**
   * Stored first, and the visitor's answer depends on this alone.
   *
   * If the write fails there is nothing to tell them but the truth, so the error
   * propagates and they are asked to write to the address on the page instead.
   */
  const saved = await enquiries.create(submission)

  /**
   * Then emailed, and a failure here is not the visitor's problem.
   *
   * The enquiry is already safe in the club's records. Logging is the right response to
   * a mail failure; telling somebody their message did not arrive when it did would be
   * a lie, and would have them send it again.
   */
  if (isMailConfigured() && enquiryRecipient()) {
    const sent = await sendEnquiry({ ...submission, reference: saved.reference })
    if (!sent.ok) {
      logger.warn(
        { reference: saved.reference, reason: sent.reason },
        'enquiry stored but the notification email did not go; it is in the office queue'
      )
    }
  } else {
    logger.info(
      { reference: saved.reference },
      'enquiry stored; no mail configured, so no notification was sent'
    )
  }

  res.status(201).json({
    reference: saved.reference,
    message:
      `Thank you — your message has reached the club, and your reference is ${saved.reference}. ` +
      'An office bearer will reply to the address you gave.',
  })
})
