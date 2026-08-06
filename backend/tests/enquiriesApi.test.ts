import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { ENQUIRY_LIMITS } from '../src/config/constants.js'

/**
 * The club's enquiries, from both ends.
 *
 * A visitor writes one with no account at all; the secretary and the president read it,
 * answer it, and say what they did. Three things are load-bearing and each of them was
 * asked for:
 *
 *   • **It is stored, not emailed.** Email depends on an app password that expires and a
 *     spam filter nobody controls; each failure loses a message silently. The visitor is
 *     told their enquiry reached the club only when it is actually in the club's records.
 *   • **Only the secretary and the president may read it.** Not the treasurer: an enquiry
 *     is not a financial record, and it carries a stranger's name and telephone number.
 *   • **Every field is capped**, because this is the one table a stranger can write into.
 */

let app: Express

const ENQUIRY = {
  name: 'Bristi Ghosh',
  email: 'bristi@example.org',
  subject: 'Joining the club',
  message: 'I live on Station Road and would like to know how to become a member.',
}

async function signIn(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/demo-login').send({ email }).expect(200)
  return response.body.token as string
}

/** A visitor sends one, and it comes back with the club's reference on it. */
async function send(overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/v1/contact')
    .send({ ...ENQUIRY, ...overrides })
    .expect(201)

  return response.body as { reference: string; message: string }
}

async function listFor(token: string, status = 'all') {
  const response = await request(app)
    .get(`/api/v1/enquiries?status=${status}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)

  return response.body as {
    enquiries: Array<Record<string, string>>
    counts: { new: number; resolved: number }
  }
}

beforeAll(() => {
  app = createApp()
})

describe('a visitor sending an enquiry', () => {
  it('is told it reached the club, with a reference to quote', async () => {
    const sent = await send({ message: 'The first message, about joining the club.' })

    expect(sent.reference).toMatch(/^ENQ-\d{4}-\d{6}$/)
    expect(sent.message).toContain(sent.reference)
  })

  it('reaches the club even with no email configured at all', async () => {
    /**
     * The whole point of storing them.
     *
     * This used to answer 503 when SMTP was unset, so the club could not receive an
     * enquiry until somebody had made a Gmail app password. Nothing in this test suite
     * configures mail, and the enquiry still arrives.
     */
    const sent = await send({ message: 'A message sent while the club has no mail set up.' })
    const secretary = await signIn('secretary@demo.club')

    const list = await listFor(secretary)
    expect(list.enquiries.some((enquiry) => enquiry.reference === sent.reference)).toBe(true)
  })

  it('refuses a message longer than the cap, so one visitor cannot fill the database', async () => {
    const response = await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, message: 'x'.repeat(ENQUIRY_LIMITS.message + 1) })
      .expect(400)

    expect(response.body.error.code).toBe('validation_error')
  })

  it('refuses an over-long name or address too', async () => {
    await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, name: 'x'.repeat(ENQUIRY_LIMITS.name + 1) })
      .expect(400)

    await request(app)
      .post('/api/v1/contact')
      .send({ ...ENQUIRY, email: `${'x'.repeat(ENQUIRY_LIMITS.email)}@example.org` })
      .expect(400)
  })
})

describe('who may read them', () => {
  it('lets the secretary and the president in', async () => {
    for (const email of ['secretary@demo.club', 'president@demo.club']) {
      await request(app)
        .get('/api/v1/enquiries')
        .set('Authorization', `Bearer ${await signIn(email)}`)
        .expect(200)
    }
  })

  it('refuses the treasurer, who has no business reading the club’s post', async () => {
    // Not an oversight: an enquiry carries a stranger's name, address and telephone
    // number, and it is not a financial record.
    await request(app)
      .get('/api/v1/enquiries')
      .set('Authorization', `Bearer ${await signIn('treasurer@demo.club')}`)
      .expect(403)
  })

  it('refuses an ordinary member, and anybody with no session', async () => {
    await request(app)
      .get('/api/v1/enquiries')
      .set('Authorization', `Bearer ${await signIn('member@demo.club')}`)
      .expect(403)

    await request(app).get('/api/v1/enquiries').expect(401)
  })
})

describe('dealing with an enquiry', () => {
  it('records who dealt with it and what they did', async () => {
    const sent = await send({ message: 'A message that the secretary will answer today.' })
    const secretary = await signIn('secretary@demo.club')

    const before = await listFor(secretary, 'new')
    const mine = before.enquiries.find((enquiry) => enquiry.reference === sent.reference)
    expect(mine).toBeDefined()

    const resolved = await request(app)
      .post(`/api/v1/enquiries/${mine?.id}/resolve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({ note: 'Rang and explained the fee; sent the form by email.' })
      .expect(200)

    expect(resolved.body.enquiry.status).toBe('resolved')
    expect(resolved.body.enquiry.resolvedByName).toBeTruthy()
    // The note is the reason this beats a mailbox: six months later "resolved" on its
    // own tells the next secretary nothing.
    expect(resolved.body.enquiry.resolutionNote).toMatch(/explained the fee/i)
  })

  it('refuses to let a second officer overwrite the first one’s answer', async () => {
    const sent = await send({ message: 'A message two officers open at the same moment.' })
    const secretary = await signIn('secretary@demo.club')
    const president = await signIn('president@demo.club')

    const list = await listFor(secretary, 'new')
    const target = list.enquiries.find((enquiry) => enquiry.reference === sent.reference)

    await request(app)
      .post(`/api/v1/enquiries/${target?.id}/resolve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({ note: 'Answered by telephone.' })
      .expect(200)

    const second = await request(app)
      .post(`/api/v1/enquiries/${target?.id}/resolve`)
      .set('Authorization', `Bearer ${president}`)
      .send({ note: 'Answered by email.' })
      .expect(409)

    expect(second.body.error.code).toBe('already_resolved')
  })

  it('can be put back in the open list when it turns out not to be finished', async () => {
    const sent = await send({ message: 'A message answered too soon, as it turns out.' })
    const president = await signIn('president@demo.club')

    const list = await listFor(president, 'new')
    const target = list.enquiries.find((enquiry) => enquiry.reference === sent.reference)

    await request(app)
      .post(`/api/v1/enquiries/${target?.id}/resolve`)
      .set('Authorization', `Bearer ${president}`)
      .send({ note: 'Thought this was the same as the earlier one.' })
      .expect(200)

    const reopened = await request(app)
      .post(`/api/v1/enquiries/${target?.id}/reopen`)
      .set('Authorization', `Bearer ${president}`)
      .expect(200)

    expect(reopened.body.enquiry.status).toBe('new')
    // The note survives: it is a record of what was done, and it stays true.
    expect(reopened.body.enquiry.resolutionNote).toMatch(/earlier one/i)
  })

  it('deletes one for good, which is how the table stays small', async () => {
    const sent = await send({ message: 'A message that turns out to be nothing but spam.' })
    const secretary = await signIn('secretary@demo.club')

    const list = await listFor(secretary)
    const target = list.enquiries.find((enquiry) => enquiry.reference === sent.reference)

    await request(app)
      .delete(`/api/v1/enquiries/${target?.id}`)
      .set('Authorization', `Bearer ${secretary}`)
      .expect(200)

    const after = await listFor(secretary)
    expect(after.enquiries.some((enquiry) => enquiry.reference === sent.reference)).toBe(false)
  })

  it('refuses to let a treasurer resolve or delete anything', async () => {
    const sent = await send({ message: 'A message the treasurer should not be able to touch.' })
    const secretary = await signIn('secretary@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const list = await listFor(secretary)
    const target = list.enquiries.find((enquiry) => enquiry.reference === sent.reference)

    await request(app)
      .post(`/api/v1/enquiries/${target?.id}/resolve`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({})
      .expect(403)

    await request(app)
      .delete(`/api/v1/enquiries/${target?.id}`)
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(403)
  })
})
