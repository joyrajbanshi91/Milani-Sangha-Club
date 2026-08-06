import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The public contact form.
 *
 * It replaced a `mailto:` link, which handed the message to the visitor's own email
 * application and did nothing at all on a machine with no mail client configured. The
 * club found exactly that: press the button, the window changes, nothing happens. A form
 * that silently drops a message is worse than no form, because the visitor believes they
 * have written to the club.
 *
 * So these cover the two things that matter: the message reaches the club's mailbox, and
 * when it cannot, the visitor is told — never a shrug, never a success they did not get.
 *
 * `sendEnquiry` is mocked. A test that opened an SMTP connection would be testing Gmail.
 */

const sendEnquiry = vi.fn()
const isMailConfigured = vi.fn(() => true)
const enquiryRecipient = vi.fn(() => 'office@example.org')

vi.mock('../src/lib/mailer.js', () => ({
  sendEnquiry: (...args: unknown[]) => sendEnquiry(...args),
  isMailConfigured: () => isMailConfigured(),
  enquiryRecipient: () => enquiryRecipient(),
}))

let app: Express

const ENQUIRY = {
  name: 'Bristi Ghosh',
  email: 'bristi@example.org',
  subject: 'Joining the club',
  message: 'I live on Station Road and would like to know how to become a member.',
}

beforeEach(async () => {
  vi.clearAllMocks()
  isMailConfigured.mockReturnValue(true)
  enquiryRecipient.mockReturnValue('office@example.org')
  sendEnquiry.mockResolvedValue({ ok: true, messageId: '<1@club>' })

  const { createApp } = await import('../src/app.js')
  app = createApp()
})

afterEach(() => {
  vi.resetModules()
})

describe('a visitor sending an enquiry', () => {
  it('stores it and emails it, with no session of any kind', async () => {
    // No Authorization header: a visitor has no account and must not need one.
    const response = await request(app).post('/api/v1/contact').send(ENQUIRY).expect(201)

    // Stored first, so the visitor is given the club's own reference for it.
    expect(response.body.reference).toMatch(/^ENQ-\d{4}-\d{6}$/)
    expect(response.body.message).toMatch(/reached the club/i)

    // Then emailed, carrying the same reference so a reply in Gmail can be matched to
    // the message on the office's screen.
    expect(sendEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ ...ENQUIRY, reference: response.body.reference })
    )
  })

  it('carries the phone number when one is given, and not when it is not', async () => {
    await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, phone: '+91 98765 43210' })
      .expect(201)

    expect(sendEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+91 98765 43210' })
    )
  })

  it('cannot choose who the message goes to', async () => {
    /**
     * The whole reason the recipient lives in the environment.
     *
     * A form that accepts its own `to` is an open mail relay, and automated scanners
     * find those within days. The schema is strict, so an attempt is refused outright
     * rather than quietly ignored — a 200 would invite a thousand more tries.
     */
    await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, to: 'victim@example.org' })
      .expect(400)

    expect(sendEnquiry).not.toHaveBeenCalled()
  })
})

describe('what it refuses', () => {
  it('will not take a message too short to answer', async () => {
    const response = await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, message: 'call me' })
      .expect(400)

    expect(response.body.error.code).toBe('validation_error')
    expect(sendEnquiry).not.toHaveBeenCalled()
  })

  it('will not take an address it cannot reply to', async () => {
    await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, email: 'not-an-address' })
      .expect(400)

    expect(sendEnquiry).not.toHaveBeenCalled()
  })

  it('accepts a bot’s submission and throws it away', async () => {
    // `website` is never rendered, so only a form-filling robot fills it. Answered as
    // though it worked: a bot told it was caught comes back in disguise.
    const response = await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, website: 'http://spam.example.org' })
      .expect(202)

    expect(response.body.message).toMatch(/thank you/i)
    expect(sendEnquiry).not.toHaveBeenCalled()
  })
})

describe('when the club’s mail is not working', () => {
  /**
   * The inversion the club asked for.
   *
   * This used to answer 503 when SMTP was unset, which meant the club could not receive
   * an enquiry at all until somebody had made a Gmail app password — and a visitor who
   * had typed a message was told to send it again by hand. The enquiry is now written to
   * the club's records first, and email is a notification. A mail failure is the club's
   * problem to notice in the logs, not the visitor's to solve.
   */
  it('still takes the message, because the record is the club’s own list', async () => {
    isMailConfigured.mockReturnValue(false)

    const response = await request(app).post('/api/v1/contact').send(ENQUIRY).expect(201)

    expect(response.body.reference).toMatch(/^ENQ-/)
    expect(response.body.message).toMatch(/reached the club/i)
    // Nothing was attempted, because there is nothing configured to attempt it with.
    expect(sendEnquiry).not.toHaveBeenCalled()
  })

  it('still takes the message when the mail host refuses it', async () => {
    sendEnquiry.mockResolvedValue({ ok: false, reason: 'send_failed' })

    const response = await request(app).post('/api/v1/contact').send(ENQUIRY).expect(201)

    // The enquiry is safe in the club's records; telling the visitor it failed would be
    // a lie, and would have them send it twice.
    expect(response.body.reference).toMatch(/^ENQ-/)
    expect(sendEnquiry).toHaveBeenCalled()
  })
})
