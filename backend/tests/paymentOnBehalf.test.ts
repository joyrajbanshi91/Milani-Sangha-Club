import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { duesForMonths, monthsBetween } from '../src/domain/membership.js'

/**
 * A payment recorded by an officer for a member who cannot use the app.
 *
 * Plenty of members have an account they have never signed into and pay their
 * subscription in cash at the club, as they always have. This is how that money reaches
 * their own record — and the tests here are almost entirely about the way it could go
 * wrong rather than the way it works.
 *
 * The rule being defended is the two-person one. A member's own declaration posts on
 * the first officer to accept it, and that is safe only because the member is the maker
 * and the officer is provably somebody else. This route makes an *officer* the maker,
 * so the same arithmetic gives a different answer: the officer who recorded it may not
 * be the one who accepts it, or the club's money would enter the books on one
 * signature while every screen said two people had been involved.
 *
 * The demo store is shared across the file, so each test uses distinct amounts — the
 * duplicate guard is real and would otherwise refuse the second payment.
 */

let app: Express

async function signIn(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/demo-login').send({ email }).expect(200)
  return response.body.token as string
}

/** The uid the demo accounts use. Mirrors AuthService.listAccounts in demo mode. */
const MEMBER_UID = 'demo-member'
const TREASURER_UID = 'demo-treasurer'

/** Returns the supertest request itself, so a caller can assert the status it expects. */
function recordFor(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/finance/payments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      memberUid: MEMBER_UID,
      purpose: 'donation',
      method: 'cash',
      amount: '300',
      paidOn: '2026-06-10',
      ...overrides,
    })
}

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

describe('an officer recording a payment for a member', () => {
  it('records it against the member, and stores who entered it', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const response = await recordFor(treasurer, { amount: '301' }).expect(201)

    const payment = response.body.payment

    // Whose payment it is, and whose it is not. The member owns the money; the
    // treasurer owns the act of typing it in.
    expect(payment.memberUid).toBe(MEMBER_UID)
    expect(payment.memberName).toBe('Demo Member')
    expect(payment.recordedOnBehalf).toBe(true)
    expect(payment.recordedBy).toBe(TREASURER_UID)
    expect(payment.recordedByName).toBe('Demo Treasurer')
    expect(payment.recordedByRole).toBe('treasurer')

    // Not in the books yet, and the message says so rather than leaving the officer
    // to wonder why no receipt appeared.
    expect(payment.status).toBe('pending_verification')
    expect(payment.receiptNumber).toBeUndefined()
    expect(response.body.message).toMatch(/another office bearer/i)
  })

  it('names the cash-taker as the recording officer when none is given', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const response = await recordFor(treasurer, { amount: '302' }).expect(201)

    // Cash with nobody named fails validation, and the honest default is the officer
    // entering it: they are the one holding the money.
    expect(response.body.payment.handedTo).toBe('Demo Treasurer')
  })

  it('shows up on the member’s own page, as their payment', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const { reference } = (await recordFor(treasurer, { amount: '303' }).expect(201)).body.payment

    const member = await signIn('member@demo.club')
    const mine = await request(app)
      .get('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${member}`)
      .expect(200)

    // The whole point of writing it against their uid rather than as a bare ledger
    // entry: the member can see what the club has recorded for them.
    const found = mine.body.payments.find((p: { reference: string }) => p.reference === reference)
    expect(found).toBeDefined()
    expect(found.recordedOnBehalf).toBe(true)
    expect(found.recordedByName).toBe('Demo Treasurer')
  })
})

describe('the two-person rule', () => {
  it('refuses the recording officer their own entry', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const { id } = (await recordFor(treasurer, { amount: '304' }).expect(201)).body.payment
    const choice = await chartOfAccounts(treasurer)

    // The self-check on `memberUid` cannot catch this — the payment belongs to the
    // member. Without the check on `recordedBy`, the treasurer would be both the
    // maker and the checker and the money would post on one signature.
    const refused = await request(app)
      .post(`/api/v1/finance/payments/${id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(choice)
      .expect(409)

    expect(refused.body.error.code).toBe('self_verification')
  })

  it('lets a different officer accept it, and issues the receipt then', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const { id } = (await recordFor(treasurer, { amount: '305' }).expect(201)).body.payment

    const secretary = await signIn('secretary@demo.club')
    const choice = await chartOfAccounts(secretary)

    const accepted = await request(app)
      .post(`/api/v1/finance/payments/${id}/record`)
      .set('Authorization', `Bearer ${secretary}`)
      .send(choice)
      .expect(201)

    expect(accepted.body.payment.status).toBe('approved')
    expect(accepted.body.payment.receiptNumber).toMatch(/^RCT-\d{4}-\d{6}$/)
    // Two people are now on it: the treasurer who recorded it, the secretary who
    // accepted it. That is the pair the club's rule asks for.
    expect(accepted.body.payment.recordedByName).toBe('Demo Treasurer')
    expect(accepted.body.payment.reviewedByName).toBe('Demo Secretary')
  })

  it('refuses an officer recording a payment for themselves', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    // Not pedantry: routed through here, an officer would be the maker of a payment
    // that a single other bearer then accepts — which is the ordinary two-person
    // path, but reached by declaring one's own money through the officers' door.
    // Their own membership page is the route, and it is no harder.
    const refused = await recordFor(treasurer, {
      memberUid: TREASURER_UID,
      amount: '306',
    }).expect(409)

    expect(refused.body.error.code).toBe('self_record')
  })
})

describe('who may reach it at all', () => {
  it('refuses an ordinary member', async () => {
    const member = await signIn('member@demo.club')
    await recordFor(member, { amount: '307' }).expect(403)
  })

  it('refuses a caller with no token', async () => {
    await request(app)
      .post('/api/v1/finance/payments')
      .send({ memberUid: MEMBER_UID, purpose: 'donation', method: 'cash', amount: '1', paidOn: '2026-06-10' })
      .expect(401)
  })

  it('refuses a member id the club has no account for', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    await recordFor(treasurer, { memberUid: 'nobody', amount: '308' }).expect(404)
  })

  it('refuses a field the form does not offer', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    // `.strict()`, so an attempt to set the status, the receipt number or the
    // recorded-by trio from the request is refused rather than quietly dropped.
    await recordFor(treasurer, { amount: '309', status: 'approved' }).expect(400)
    await recordFor(treasurer, { amount: '310', recordedBy: 'demo-president' }).expect(400)
  })
})

describe('the money it credits', () => {
  it('marks the months on the member’s register once accepted', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const months = monthsBetween('2026-11', '2026-12')

    const { id } = (
      await recordFor(treasurer, {
        purpose: 'membership',
        periodStart: '2026-11',
        periodEnd: '2026-12',
        amount: String(duesForMonths(months.length) / 100),
      }).expect(201)
    ).body.payment

    const secretary = await signIn('secretary@demo.club')
    await request(app)
      .post(`/api/v1/finance/payments/${id}/record`)
      .set('Authorization', `Bearer ${secretary}`)
      .send(await chartOfAccounts(secretary))
      .expect(201)

    const member = await signIn('member@demo.club')
    const register = await request(app)
      .get('/api/v1/members/me/membership')
      .set('Authorization', `Bearer ${member}`)
      .expect(200)

    // Derived from the payments table, so this is the assertion that the money
    // genuinely landed on the member rather than beside them.
    const paid = register.body.membership.months.filter((m: { paid: boolean }) => m.paid)
    expect(paid.map((m: { month: string }) => m.month)).toEqual(expect.arrayContaining(months))
  })

  it('refuses a duplicate of what the member already declared themselves', async () => {
    const member = await signIn('member@demo.club')
    await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${member}`)
      .send({
        purpose: 'donation',
        method: 'cash',
        amount: '311',
        paidOn: '2026-06-10',
        handedTo: 'Demo Treasurer',
      })
      .expect(201)

    // The case this actually protects against: an officer working through a receipt
    // book has no way of knowing the member already sent it in from their phone, and
    // recording both would credit the club with money it received once.
    const treasurer = await signIn('treasurer@demo.club')
    const refused = await recordFor(treasurer, { amount: '311' }).expect(409)

    expect(refused.body.error.code).toBe('duplicate')
  })
})
