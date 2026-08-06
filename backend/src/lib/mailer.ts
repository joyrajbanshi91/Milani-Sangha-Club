import nodemailer, { type Transporter } from 'nodemailer'

import { env } from '../config/env.js'
import { logger } from './logger.js'

/**
 * Sending email, for the one thing the club sends today: a visitor's enquiry.
 *
 * ## Why the contact form needed a server at all
 *
 * It used to build a `mailto:` link and hand the message to the visitor's own email
 * application. That reads as a reasonable trade — no credentials, no spam surface, and
 * the sender keeps a copy in their sent items — and it fails completely on a machine
 * with no mail client configured, which is most machines now. The club found exactly
 * that: pressing **Send enquiry** switched to another window and nothing happened. A
 * form that silently does nothing is worse than no form, because the visitor believes
 * they have written to the club.
 *
 * So the server sends it. That means credentials, which means this module is careful
 * about three things:
 *
 *   • **It is optional.** With no SMTP settings the transport is null and the route
 *     says so plainly, rather than throwing. A club that has not set up mail should
 *     get a contact page that tells visitors to write directly — not a 500.
 *   • **The destination is never taken from the request.** It comes from `CONTACT_TO`
 *     in the environment. A form that posts its own recipient is an open mail relay
 *     with a nice font, and it will be found within days.
 *   • **The visitor's address goes in `Reply-To`, not `From`.** Sending as somebody
 *     else's address is what spam does, and Gmail fails SPF on it — the message would
 *     land in spam or be rejected outright. `From` is the club's own mailbox; replying
 *     goes to the enquirer.
 */

let cached: Transporter | null | undefined

export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM)
}

/** Where enquiries go. Never from the request — see the note above. */
export function enquiryRecipient(): string | undefined {
  return env.CONTACT_TO?.trim() || env.SMTP_USER
}

/**
 * The transport, built once.
 *
 * Cached because a Netlify function may serve several requests before it is recycled,
 * and building a transport per request throws away the connection pool for no reason.
 * `undefined` means "not asked yet"; `null` means "asked, and there is no configuration".
 */
function transport(): Transporter | null {
  if (cached !== undefined) return cached

  if (!isMailConfigured()) {
    cached = null
    return null
  }

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; 587 starts plain and upgrades with STARTTLS. Deriving it
    // from the port rather than asking for both means one fewer setting to get wrong.
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER as string, pass: env.SMTP_PASSWORD as string },
  })

  return cached
}

export interface Enquiry {
  name: string
  email: string
  phone?: string | undefined
  subject: string
  message: string
  /**
   * The club's own reference for it, 'ENQ-2026-000042'.
   *
   * The enquiry is stored before it is emailed, so the notification can quote the same
   * reference the office sees on screen. Without it somebody replying from Gmail has no
   * way to find the message in the club's list and mark it dealt with.
   */
  reference?: string | undefined
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'not_configured' | 'send_failed' }

/**
 * Send an enquiry to the club.
 *
 * The body is plain text on purpose. It is read by a person in Gmail, an HTML version
 * would add nothing, and a message assembled from a stranger's input is one fewer place
 * to worry about markup if it never becomes markup.
 */
export async function sendEnquiry(enquiry: Enquiry): Promise<SendResult> {
  const mailer = transport()
  const to = enquiryRecipient()

  if (!mailer || !to) return { ok: false, reason: 'not_configured' }

  const lines = [
    enquiry.message,
    '',
    '—',
    `Name:    ${enquiry.name}`,
    `Email:   ${enquiry.email}`,
    ...(enquiry.phone ? [`Phone:   ${enquiry.phone}`] : []),
    `Subject: ${enquiry.subject}`,
    ...(enquiry.reference ? [`Reference: ${enquiry.reference}`] : []),
    '',
    `Sent from the ${env.CLUB_NAME} website contact form.`,
    'Reply to this message and it goes to the person who wrote it.',
    ...(enquiry.reference
      ? ['It is also in the office list under Enquiries — mark it dealt with there.']
      : []),
  ]

  try {
    const sent = await mailer.sendMail({
      from: env.MAIL_FROM,
      to,
      // So a reply reaches the enquirer without anybody copying an address by hand.
      replyTo: `${enquiry.name} <${enquiry.email}>`,
      // Newlines stripped: a header cannot contain them, and a subject assembled from
      // a stranger's choice is exactly where somebody tries to inject one.
      subject: `[Website] ${enquiry.subject}${enquiry.reference ? ` (${enquiry.reference})` : ''}`
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 160),
      text: lines.join('\n'),
    })

    logger.info({ to, subject: enquiry.subject }, 'enquiry sent')
    return { ok: true, messageId: sent.messageId }
  } catch (error) {
    // The visitor is told the club could not be written to and given the address, so
    // their enquiry is not lost. The reason belongs in the logs, not on the page.
    logger.error({ err: error, to }, 'could not send an enquiry')
    return { ok: false, reason: 'send_failed' }
  }
}

/** Forget the cached transport. Tests only. */
export function resetMailerForTests(): void {
  cached = undefined
}
