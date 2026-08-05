import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { duesForMonths, monthsBetween } from '../src/domain/membership.js'

/**
 * The member-payment flow over HTTP, on the in-memory demo store.
 *
 * Two questions matter more than the rest, and they are the ones a club would ask:
 *
 *   • Can a member put money into the club's books? No. They can declare a payment
 *     and nothing else — every route that touches the ledger refuses them.
 *   • Can a member mark their own subscription paid? No. A declaration counts for
 *     nothing in the register until an officer has checked it against the club's
 *     records, and an officer cannot check their own.
 *
 * Verifying a payment creates an ordinary pending entry, so the two-person rule
 * applies to it exactly as to one typed in by hand: the verifying officer cannot
 * approve it, and one other bearer — never two — posts it.
 *
 * The demo store is shared across this file, so each test uses distinct amounts —
 * the duplicate guard is real and would otherwise refuse the second submission.
 */

let app: Express

async function signIn(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/demo-login').send({ email }).expect(200)
  return response.body.token as string
}

/**
 * A member declares a payment and gets its id back.
 *
 * A **donation** by default. Membership is priced by the month and has to name which
 * ones, so using it here would make every test about the dues table as well; the
 * membership block below does that deliberately.
 */
async function declare(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; reference: string; amountPaise: number }> {
  const response = await request(app)
    .post('/api/v1/members/me/payments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      purpose: 'donation',
      method: 'upi',
      amount: '500',
      paidOn: '2026-06-10',
      externalReference: '4471829930',
      ...overrides,
    })
    .expect(201)

  return response.body.payment
}

/** A membership declaration for whole months, at the club's rate. */
async function declareMembership(
  token: string,
  periodStart: string,
  periodEnd: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; reference: string; amountPaise: number }> {
  const months = monthsBetween(periodStart, periodEnd).length

  return declare(token, {
    purpose: 'membership',
    periodStart,
    periodEnd,
    amount: String(duesForMonths(months) / 100),
    ...overrides,
  })
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
        purpose: 'donation',
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

  it('enters it in the books as pending, and issues the receipt at that moment', async () => {
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
    expect(recorded.body.transaction.amountPaise).toBe(65_100)
    // Dated when the member paid, not when the officer looked at it.
    expect(recorded.body.transaction.date).toBe('2026-06-11')
    // The declaration and the entry point at each other.
    expect(recorded.body.payment.transactionReference).toBe(recorded.body.transaction.reference)
    expect(recorded.body.transaction.description).toContain(payment.reference)
    // The receipt exists only now — never at declaration time.
    expect(recorded.body.payment.receiptNumber).toMatch(/^RCT-2026-\d{6}$/)

    /**
     * The entry is an ordinary one: pending, needing exactly one other bearer.
     *
     * Verifying a member's payment is not a way round the two-person rule. The
     * message counts the outstanding signature so the officer is not left guessing
     * how many more people are involved.
     */
    expect(recorded.body.transaction.status).toBe('pending')
    expect(recorded.body.message).toMatch(/needs 1 more approval/i)

    const during = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)
    expect(during.body.totals.incomePaise).toBe(before.body.totals.incomePaise)

    // The verifying officer cannot approve their own entry, as for any other.
    const self = await request(app)
      .post(`/api/v1/finance/transactions/${recorded.body.transaction.id}/approve`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({})
      .expect(409)
    expect(self.body.error.code).toBe('self_approval')

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

  it('names the approving officer on the receipt once somebody has approved', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')

    const payment = await declare(member, { amount: '657' })
    const recorded = await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(await chartOfAccounts(treasurer))
      .expect(201)

    // A receipt is available at once — the member handed over money and is entitled
    // to something — but it must not claim a signature nobody has given yet.
    const early = await request(app)
      .get(`/api/v1/members/me/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${member}`)
      .expect(200)
    expect(early.body.subarray(0, 5).toString()).toBe('%PDF-')

    await request(app)
      .post(`/api/v1/finance/transactions/${recorded.body.transaction.id}/approve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({})
      .expect(200)

    const complete = await request(app)
      .get(`/api/v1/members/me/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${member}`)
      .expect(200)

    // The approved receipt is a different document — it now carries a name where it
    // previously carried the waiting note. Byte length is the observable difference
    // here; receipt.test.ts asserts the actual text.
    expect(complete.body.byteLength).not.toBe(early.body.byteLength)
  })

  it('gives the member a receipt PDF, and nobody else theirs', async () => {
    const member = await signIn('member@demo.club')
    const president = await signIn('president@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declare(member, { amount: '655' })

    // No receipt before it is verified: that is money nobody has confirmed arrived.
    const early = await request(app)
      .get(`/api/v1/members/me/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${member}`)
      .expect(409)
    expect(early.body.error.code).toBe('not_verified')

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(await chartOfAccounts(treasurer))
      .expect(201)

    const receipt = await request(app)
      .get(`/api/v1/members/me/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${member}`)
      .expect(200)

    expect(receipt.headers['content-type']).toContain('application/pdf')
    expect(receipt.headers['content-disposition']).toMatch(/receipt-RCT-2026-\d{6}/)
    expect(receipt.headers['cache-control']).toContain('no-store')
    expect(receipt.body.subarray(0, 5).toString()).toBe('%PDF-')

    // Another member cannot fetch it by id — the same answer as one that does not
    // exist, so ids cannot be probed.
    await request(app)
      .get(`/api/v1/members/me/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${president}`)
      .expect(404)

    // An officer can reprint it, which is the commonest request an office gets.
    await request(app)
      .get(`/api/v1/finance/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)
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

  it('refuses a receipt for a declined payment', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declare(member, { amount: '656' })

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/decline`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ reason: 'No payment with that ID reached the club account.' })
      .expect(200)

    await request(app)
      .get(`/api/v1/members/me/payments/${payment.id}/receipt.pdf`)
      .set('Authorization', `Bearer ${member}`)
      .expect(409)
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

/**
 * The membership register over HTTP.
 *
 * Which months a member has paid is the thing the club actually looks at, and it is
 * derived from their declarations rather than stored, so these tests are as much
 * about the two ends agreeing — a member's own page and the officers' roster — as
 * about the arithmetic.
 */
describe('the membership register', () => {
  it('starts a member owing the whole year', async () => {
    const token = await signIn('member@demo.club')

    const response = await request(app)
      .get('/api/v1/members/me/membership?year=2030-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const { membership, dues } = response.body
    expect(membership.months).toHaveLength(12)
    expect(membership.months[0].month).toBe('2030-04')
    expect(membership.months[11].month).toBe('2031-03')
    expect(membership.monthsPaid).toBe(0)
    expect(membership.outstandingPaise).toBe(60_000)

    // The rates the form has to price against.
    expect(dues.monthlyPaise).toBe(5_000)
    expect(dues.yearlyPaise).toBe(60_000)
  })

  it('marks the months as paid once an officer verifies the declaration', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declareMembership(member, '2031-04', '2031-06', {
      paidOn: '2026-06-12',
    })
    expect(payment.amountPaise).toBe(15_000)

    // Not paid until somebody has checked it: a form is not money.
    const claimed = await request(app)
      .get('/api/v1/members/me/membership?year=2031-32')
      .set('Authorization', `Bearer ${member}`)
    expect(claimed.body.membership.monthsPaid).toBe(0)

    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(await chartOfAccounts(treasurer))
      .expect(201)

    const verified = await request(app)
      .get('/api/v1/members/me/membership?year=2031-32')
      .set('Authorization', `Bearer ${member}`)

    expect(verified.body.membership.monthsPaid).toBe(3)
    expect(verified.body.membership.monthsUnpaid).toBe(9)
    expect(verified.body.membership.months[0].paid).toBe(true)
    expect(verified.body.membership.months[0].receiptNumber).toMatch(/^RCT-/)
    expect(verified.body.membership.months[3].paid).toBe(false)
  })

  it('refuses a membership amount that does not match the months', async () => {
    const token = await signIn('member@demo.club')

    const response = await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        purpose: 'membership',
        method: 'upi',
        amount: '50',
        paidOn: '2026-06-10',
        periodStart: '2032-04',
        periodEnd: '2033-03',
        externalReference: '4471829930',
      })
      .expect(400)

    expect(response.body.error.message).toContain('600.00')
  })

  it('refuses months the member has already claimed', async () => {
    const token = await signIn('member@demo.club')
    await declareMembership(token, '2033-04', '2033-05', { paidOn: '2026-06-13' })

    const clash = await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        purpose: 'membership',
        method: 'upi',
        amount: '100',
        paidOn: '2026-06-14',
        periodStart: '2033-05',
        periodEnd: '2033-06',
        externalReference: '4471829931',
      })
      .expect(409)

    expect(clash.body.error.code).toBe('months_already_covered')
    expect(clash.body.error.message).toMatch(/May 2033/)
  })

  it('refuses a period that crosses two membership years', async () => {
    const token = await signIn('member@demo.club')

    await request(app)
      .post('/api/v1/members/me/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        purpose: 'membership',
        method: 'upi',
        amount: '600',
        paidOn: '2026-06-10',
        periodStart: '2034-10',
        periodEnd: '2035-09',
        externalReference: '4471829930',
      })
      .expect(400)
  })
})

describe('the officers’ roster', () => {
  it('is closed to a member', async () => {
    const token = await signIn('member@demo.club')
    await request(app)
      .get('/api/v1/finance/members')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  it('lists every account, including one that has never paid anything', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    const response = await request(app)
      .get('/api/v1/finance/members?year=2040-41')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    const emails = response.body.members.map((row: { email: string }) => row.email)
    // All four demo accounts, not only the ones with payments — the member who has
    // paid nothing is precisely the row an officer is looking for.
    expect(emails).toContain('member@demo.club')
    expect(emails).toContain('president@demo.club')
    expect(response.body.totals.members).toBe(emails.length)

    for (const row of response.body.members) {
      expect(row.membership.months).toHaveLength(12)
      expect(row.membership.monthsPaid).toBe(0)
    }

    expect(response.body.totals.nothingPaid).toBe(emails.length)
    expect(response.body.financialYear).toBe('2040-41')
  })

  it('shows what a member has paid, and totals the year', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declareMembership(member, '2041-04', '2042-03', {
      paidOn: '2026-06-15',
    })
    await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(await chartOfAccounts(treasurer))
      .expect(201)

    const response = await request(app)
      .get('/api/v1/finance/members?year=2041-42')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    const row = response.body.members.find(
      (candidate: { email: string }) => candidate.email === 'member@demo.club'
    )

    expect(row.membership.monthsPaid).toBe(12)
    expect(row.membership.paidInFull).toBe(true)
    expect(response.body.totals.paidInFull).toBe(1)
  })

  it('puts whoever owes the most at the top, because the list is there to be acted on', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    const response = await request(app)
      .get('/api/v1/finance/members?year=2026-27')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    const overdue = response.body.members.map(
      (row: { membership: { monthsOverdue: number } }) => row.membership.monthsOverdue
    )

    expect([...overdue].sort((a: number, b: number) => b - a)).toEqual(overdue)
  })
})

/**
 * The club's year, over HTTP.
 *
 * Closing a year settles it: the committee adopts a carry-forward, that figure opens
 * the next year, and nothing more can be dated into the old one. Money that arrives
 * late is not refused — it lands in the year that is open, which is where the club
 * actually received it.
 */
describe('closing a year and carrying the balance forward', () => {
  /** Undo whatever a test opened, so the shared demo store stays usable. */
  async function reopen(token: string, year: string): Promise<void> {
    await request(app)
      .delete(`/api/v1/finance/years/${year}`)
      .set('Authorization', `Bearer ${token}`)
  }

  it('is closed to a member', async () => {
    const token = await signIn('member@demo.club')

    await request(app).get('/api/v1/finance/years').set('Authorization', `Bearer ${token}`).expect(403)
    await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ financialYear: '2030-31', balances: {} })
      .expect(403)
  })

  it('suggests what the ledger says should be carried, per fund', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    const response = await request(app)
      .get('/api/v1/finance/years?suggestFor=2030-31')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    expect(response.body.suggestion.fromYear).toBe('2029-30')
    expect(Array.isArray(response.body.suggestion.balances)).toBe(true)
    expect(response.body.suggestion.totalPaise).toBeTypeOf('number')
  })

  it('opens the year with the figures the committee adopted, not the suggested ones', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const funds = await request(app)
      .get('/api/v1/finance/funds')
      .set('Authorization', `Bearer ${treasurer}`)

    const cash = funds.body.funds[0].id

    const opened = await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({
        financialYear: '2031-32',
        balances: { [cash]: '7500' },
        note: 'Adopted at the AGM; ₹120 short after the cash count.',
      })
      .expect(201)

    expect(opened.body.year.financialYear).toBe('2031-32')
    expect(opened.body.year.balances[cash]).toBe(750_000)
    // What the ledger said at the time is kept beside it, so a later difference is
    // explicable rather than mysterious.
    expect(opened.body.year.suggestedTotalPaise).toBeTypeOf('number')
    expect(opened.body.message).toContain('2030-31 is now closed')

    await reopen(treasurer, '2031-32')
  })

  it('refuses to open the same year twice', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ financialYear: '2032-33', balances: {} })
      .expect(201)

    const again = await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ financialYear: '2032-33', balances: {} })
      .expect(409)

    expect(again.body.error.message).toMatch(/already been opened/i)

    await reopen(treasurer, '2032-33')
  })

  it('refuses an entry dated into a year that has been closed', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const [funds, categories] = await Promise.all([
      request(app).get('/api/v1/finance/funds').set('Authorization', `Bearer ${treasurer}`),
      request(app).get('/api/v1/finance/categories').set('Authorization', `Bearer ${treasurer}`),
    ])

    await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ financialYear: '2026-27', balances: {} })
      .expect(201)

    // 2025-26 is now closed, so nothing may be dated into it.
    const refused = await request(app)
      .post('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({
        kind: 'income',
        date: '2025-08-01',
        amount: '100',
        fundId: funds.body.funds[0].id,
        categoryId: categories.body.categories.find((c: { kind: string }) => c.kind === 'income').id,
        source: 'Late',
        description: 'Should be refused',
      })
      .expect(409)

    expect(refused.body.error.code).toBe('year_closed')
    expect(refused.body.error.message).toMatch(/2025-26 has been closed/)
    // And it says what to do instead, rather than only refusing.
    expect(refused.body.error.message).toMatch(/when the money actually reached the club/)

    await reopen(treasurer, '2026-27')
  })

  it('lets an officer reopen a year to correct it', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ financialYear: '2033-34', balances: {} })
      .expect(201)

    const reopened = await request(app)
      .delete('/api/v1/finance/years/2033-34')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    expect(reopened.body.message).toMatch(/2032-33 can be corrected/)

    const years = await request(app)
      .get('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)

    expect(
      years.body.years.some((year: { financialYear: string }) => year.financialYear === '2033-34')
    ).toBe(false)
  })

  /**
   * The late-payment case the club asked about.
   *
   * A subscription for months in a closed year, declared afterwards. The money is
   * real, so it is entered — dated when the club actually received it, which is the
   * open year — while the member's months are still marked against the year they
   * paid for.
   */
  it('carries a late payment into the open year, and still credits the right months', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    const payment = await declareMembership(member, '2035-04', '2035-05', {
      paidOn: '2026-06-20',
    })

    // Close every year up to and including the one the money was paid in.
    await request(app)
      .post('/api/v1/finance/years')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({ financialYear: '2027-28', balances: {} })
      .expect(201)

    const recorded = await request(app)
      .post(`/api/v1/finance/payments/${payment.id}/record`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send(await chartOfAccounts(treasurer))
      .expect(201)

    // Not refused, and not dated back into the settled year.
    expect(recorded.body.transaction.date).toBe('2027-04-01')
    expect(recorded.body.transaction.description).toMatch(/arrears, paid 2026-06-20/)

    // The months are still the ones the member paid for.
    const register = await request(app)
      .get('/api/v1/members/me/membership?year=2035-36')
      .set('Authorization', `Bearer ${member}`)
    expect(register.body.membership.monthsPaid).toBe(2)

    await reopen(treasurer, '2027-28')
  })
})
