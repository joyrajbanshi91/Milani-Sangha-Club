import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'

/**
 * The member-payment flow over HTTP, on the in-memory demo store.
 *
 * Two questions matter more than the rest, and they are the ones a club would ask:
 *
 *   • Can a member put money into the club's books? No. They can declare a payment
 *     and nothing else — every route that touches the ledger refuses them.
 *   • Can one officer take a member's declaration all the way into a balance? No.
 *     Recording it creates a *pending* entry, so a second officer still has to
 *     approve it, exactly as for an entry typed in by hand.
 *
 * The demo store is shared across this file, so each test uses distinct amounts —
 * the duplicate guard is real and would otherwise refuse the second submission.
 */

let app: Express

async function signIn(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/demo-login').send({ email }).expect(200)
  return response.body.token as string
}

/** A member declares a payment and gets its id back. */
async function declare(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; reference: string; amountPaise: number }> {
  const response = await request(app)
    .post('/api/v1/members/me/payments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      purpose: 'membership',
      method: 'upi',
      amount: '500',
      paidOn: '2026-06-10',
      externalReference: '4471829930',
      ...overrides,
    })
    .expect(201)

  return response.body.payment
}

/** The fund and category an officer would choose when recording one. */
async function chartOfAccounts(token: string): Promise<{ fundId: string; categoryId: string }> {
  const [funds, categories] = await Promise.all([
    request(app).get('/api/v1/finance/funds').set('Authorization', `Bearer ${token}`),
    request(app).get('/api/v1/finance/categories').set('Authorization', `Bearer ${token}`),
  ])

  return {
    fundId: funds.body.funds[0].id,
    categoryId: categories.body.categories.find((c: { kind: string }) => c.kind === 'income').id,
  }
}

beforeAll(() => {
  app = createApp()
})

describe('a member declaring a payment', () => {
  it('accepts the declaration and returns an acknowledgement reference', async () => {
    const token = await signIn('member@demo.club')
    const payment = await declare(token, { amount: '501' })

    expect(payment.reference).toMatch(/^REF-2026-\d{6}$/)
    expect(payment.amountPaise).toBe(50_100)
    expect((payment as unknown as { status: string }).status).toBe('pending_verification')
  })

  it('parses rupees exactly, without going through a float', async () => {
    const token = await signIn('member@demo.club')
    const payment = await declare(token, { amount: '1,234.56' })
    expect(payment.amountPaise).toBe(123_456)
  })

  it('refuses an unauthenticated declaration', async () => {
    await request(app)
      .post('/api/v1/members/me/payments')
      .send({ purpose: 'membership', method: 'cash', amount: '100', paidOn: '2026-06-10' })
      .expect(401)
  })

  it('refuses a future-dated payment', async () => {
    const token = await signIn('member@demo.club')
    await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        purpose: 'membership',
        method: 'upi',
        amount: '100',
        paidOn: '2099-01-01',
        externalReference: '1',
      })
      .expect(400)
  })

  it('refuses the same declaration sent twice', async () => {
    const token = await signIn('member@demo.club')
    await declare(token, { amount: '777' })

    const again = await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        purpose: 'membership',
        method: 'upi',
        amount: '777',
        paidOn: '2026-06-10',
        externalReference: '4471829930',
      })
      .expect(409)

    expect(again.body.error.code).toBe('duplicate')
  })

  it('refuses a body that tries to set its own status or reference', async () => {
    // A member posting `status: 'approved'` must not be able to verify themselves.
    // The schema is strict, so an unknown field is refused outright rather than
    // dropped — a caller who thinks they set the status should be told they did not.
    const token = await signIn('member@demo.club')
    await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        purpose: 'membership',
        method: 'upi',
        amount: '888',
        paidOn: '2026-06-10',
        externalReference: '4471829930',
        status: 'approved',
        reference: 'REF-2026-000001',
      })
      .expect(400)
  })

  it('shows a member their own declarations and nobody else’s', async () => {
    const member = await signIn('member@demo.club')
    const president = await signIn('president@demo.club')

    const mine = await declare(member, { amount: '611' })
    const theirs = await declare(president, { amount: '612' })

    const list = await request(app)
      .get('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${member}`)
      .expect(200)

    const ids = list.body.payments.map((payment: { id: string }) => payment.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
  })

  it('lets a member withdraw their own, and not somebody else’s', async () => {
    const member = await signIn('member@demo.club')
    const president = await signIn('president@demo.club')

    const mine = await declare(member, { amount: '621' })
    const theirs = await declare(president, { amount: '622' })

    await request(app)
      .post(`/api/v1/members/me/payments/${mine.id}/withdraw`)
      .set('Authorization', `Bearer ${member}`)
      .expect(200)

    // Not 403: telling a member that an id exists but is not theirs would let them
    // enumerate the club's declarations.
    await request(app)
      .post(`/api/v1/members/me/payments/${theirs.id}/withdraw`)
      .set('Authorization', `Bearer ${member}`)
      .expect(404)
  })
})

describe('a member cannot reach the officers’ half of the flow', () => {
  it('refuses the queue and both review actions', async () => {
    const token = await signIn('member@demo.club')
    const payment = await declare(token, { amount: '631' })

    await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fundId: 'fund-1', categoryId: 'cat-1' })
      .expect(403)

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/decline`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Because I say so' })
      .expect(403)
  })
})

describe('an officer verifying a declaration', () => {
  it('shows what is waiting, oldest first', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    await declare(member, { amount: '641' })

    const queue = await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    expect(queue.body.payments.length).toBeGreaterThan(0)
    for (const payment of queue.body.payments) {
      expect(payment.status).toBe('pending_verification')
    }

    const submitted = queue.body.payments.map((p: { submittedAt: string }) => p.submittedAt)
    expect([...submitted].sort()).toEqual(submitted)
  })

  it('enters it in the books as PENDING, so a second officer is still needed', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')

    const payment = await declare(member, { amount: '651', paidOn: '2026-06-11' })
    const choice = await chartOfAccounts(treasurer)

    const before = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)

    const recorded = await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(choice)
      .expect(201)

    expect(recorded.body.payment.status).toBe('approved')
    expect(recorded.body.transaction.status).toBe('pending')
    expect(recorded.body.transaction.amountPaise).toBe(65_100)
    // Dated when the member paid, not when the officer looked at it.
    expect(recorded.body.transaction.date).toBe('2026-06-11')
    // The declaration and the entry point at each other.
    expect(recorded.body.payment.transactionReference).toBe(recorded.body.transaction.reference)
    expect(recorded.body.transaction.description).toContain(payment.reference)

    // Nothing has moved yet.
    const during = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)
    expect(during.body.totals.incomePaise).toBe(before.body.totals.incomePaise)

    // The recording officer cannot approve their own entry — the ordinary rule.
    const selfApproval = await request(app)
      .post(`/api/v1/finance/transactions/${recorded.body.transaction.id}/approve`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({})
      .expect(409)
    expect(selfApproval.body.error.code).toBe('self_approval')

    await request(app)
      .post(`/api/v1/finance/transactions/${recorded.body.transaction.id}/approve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({})
      .expect(200)

    const after = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)
    expect(after.body.totals.incomePaise).toBe(before.body.totals.incomePaise + 65_100)
  })

  /**
   * The rule the feature turns on.
   *
   * A treasurer pays their subscription like anyone else. Confirming it themselves
   * would make the verification a person agreeing with themselves, and the
   * two-person rule downstream does not help: the question here is whether the
   * money arrived, not whether the entry is wanted.
   */
  it('refuses an officer recording their own payment', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')

    const own = await declare(treasurer, { amount: '661' })
    const choice = await chartOfAccounts(treasurer)

    const refused = await request(app)
      .post(`/api/v1/finance/payments/${own.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(choice)
      .expect(409)

    expect(refused.body.error.code).toBe('self_verification')

    // Another officer may, and that is the documented way out.
    await request(app)
      .post(`/api/v1/finance/payments/${own.id}/record`)
      .set('Authorization', `Bearer ${secretary}`)
      .send(choice)
      .expect(201)
  })

  it('refuses to record one twice', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')
    const president = await signIn('president@demo.club')

    const payment = await declare(member, { amount: '671' })
    const choice = await chartOfAccounts(treasurer)

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(choice)
      .expect(201)

    const again = await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${president}`)
      .send(choice)
      .expect(409)

    expect(again.body.error.code).toBe('not_open')
  })

  it('leaves the declaration queued when the officer picks a category that does not exist', async () => {
    // The officer's mistake, not the member's. They must be able to try again.
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declare(member, { amount: '681' })
    const { fundId } = await chartOfAccounts(treasurer)

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ fundId, categoryId: 'cat-does-not-exist' })
      .expect(400)

    const queue = await request(app)
      .get('/api/v1/finance/payments')
      .set('Authorization', `Bearer ${treasurer}`)

    expect(queue.body.payments.map((p: { id: string }) => p.id)).toContain(payment.id)
  })

  it('declines with a reason the member can see', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declare(member, { amount: '691' })

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/decline`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ reason: 'x' })
      .expect(400)

    const declined = await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/decline`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ reason: 'No payment with that ID reached the club account.' })
      .expect(200)

    expect(declined.body.payment.status).toBe('rejected')

    const mine = await request(app)
      .get('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${member}`)

    const found = mine.body.payments.find((p: { id: string }) => p.id === payment.id)
    expect(found.declineReason).toMatch(/reached the club account/)
    expect(found.reviewedByName).toBe('Demo Treasurer')
  })

  it('will not let a member withdraw one that has been entered in the books', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declare(member, { amount: '701' })
    const choice = await chartOfAccounts(treasurer)

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(choice)
      .expect(201)

    const refused = await request(app)
      .post(`/api/v1/members/me/payments/${payment.id}/withdraw`)
      .set('Authorization', `Bearer ${member}`)
      .expect(409)

    expect(refused.body.error.code).toBe('not_open')
  })
})
