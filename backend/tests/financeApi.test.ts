import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'

/**
 * End-to-end tests over the HTTP API, on the in-memory demo store.
 *
 * The first block is the one that matters most: an ordinary member must not be
 * able to reach any part of the finance area. Everything else in the officer
 * interface is a convenience; that boundary is a promise to the club.
 */

let app: Express

async function signIn(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/demo-login')
    .send({ email })
    .expect(200)
  return response.body.token as string
}

const FINANCE_ROUTES = [
  '/api/v1/finance/dashboard',
  '/api/v1/finance/funds',
  '/api/v1/finance/categories',
  '/api/v1/finance/transactions',
  '/api/v1/reports/period',
  '/api/v1/reports/period.pdf',
]

beforeAll(() => {
  app = createApp()
})

describe('the finance area is closed to members', () => {
  it('refuses every finance route without a token', async () => {
    for (const route of FINANCE_ROUTES) {
      const response = await request(app).get(route)
      expect(response.status, route).toBe(401)
    }
  })

  it('refuses every finance route to a signed-in member', async () => {
    const token = await signIn('member@demo.club')

    for (const route of FINANCE_ROUTES) {
      const response = await request(app).get(route).set('Authorization', `Bearer ${token}`)
      expect(response.status, route).toBe(403)
    }
  })

  it('refuses a member the write routes too, not only the reads', async () => {
    const token = await signIn('member@demo.club')

    const posts: Array<[string, object]> = [
      ['/api/v1/finance/transactions', { kind: 'income', date: '2026-04-01', amount: '100' }],
      ['/api/v1/finance/import', { csv: 'date,kind\n' }],
      ['/api/v1/finance/funds', { name: 'Sneaky', kind: 'cash', openingDate: '2026-04-01' }],
    ]

    for (const [route, body] of posts) {
      const response = await request(app)
        .post(route)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
      expect(response.status, route).toBe(403)
    }
  })

  it('leaks nothing about the finances in the refusal', async () => {
    const token = await signIn('member@demo.club')
    const response = await request(app)
      .get('/api/v1/finance/dashboard')
      .set('Authorization', `Bearer ${token}`)

    const body = JSON.stringify(response.body)
    expect(body).not.toMatch(/paise|balance|fund/i)
  })

  it('rejects a made-up token', async () => {
    await request(app)
      .get('/api/v1/finance/dashboard')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401)
  })

  it('tells a member they are not a finance officer, so the app can hide the area', async () => {
    const token = await signIn('member@demo.club')
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.user.isFinanceOfficer).toBe(false)
  })
})

describe('officers can see the finances', () => {
  it('gives the treasurer a dashboard that balances', async () => {
    const token = await signIn('treasurer@demo.club')
    const response = await request(app)
      .get('/api/v1/finance/dashboard?month=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const { totals, fundBalances, totalFundsPaise } = response.body
    expect(totals.incomePaise).toBeGreaterThan(0)
    expect(totals.netPaise).toBe(totals.incomePaise - totals.expensePaise)
    expect(
      fundBalances.reduce((sum: number, fund: { balancePaise: number }) => sum + fund.balancePaise, 0)
    ).toBe(totalFundsPaise)
  })

  it('lets each of the three officer roles in', async () => {
    for (const email of ['president@demo.club', 'secretary@demo.club', 'treasurer@demo.club']) {
      const token = await signIn(email)
      await request(app)
        .get('/api/v1/finance/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    }
  })

  it('serves the statement as a PDF attachment that is never cached', async () => {
    const token = await signIn('treasurer@demo.club')
    const response = await request(app)
      .get('/api/v1/reports/period.pdf?month=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('names the download so it can be found again months later', async () => {
    const token = await signIn('treasurer@demo.club')

    const detailed = await request(app)
      .get('/api/v1/reports/period.pdf?month=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const summary = await request(app)
      .get('/api/v1/reports/period.pdf?month=2026-04&detail=summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    // Club, which report, the period, and the day it was issued — so two downloads
    // of the same month do not arrive as statement.pdf and statement(1).pdf.
    expect(detailed.headers['content-disposition']).toMatch(/detailed-2026-04-issued-\d{4}-\d{2}-\d{2}\.pdf/)
    expect(summary.headers['content-disposition']).toMatch(/summary-2026-04-issued-\d{4}-\d{2}-\d{2}\.pdf/)
    expect(detailed.headers['content-disposition']).toContain('Milani')
  })

  it('names an arbitrary range by its two dates', async () => {
    const token = await signIn('treasurer@demo.club')

    const response = await request(app)
      .get('/api/v1/reports/period.pdf?from=2026-04-05&to=2026-05-20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.headers['content-disposition']).toContain('2026-04-05-to-2026-05-20')
  })

  it('makes the summary shorter than the detailed statement', async () => {
    // The difference is the point: the summary merges every member's subscription
    // into its category, so a page of individual names does not go on the
    // noticeboard.
    const token = await signIn('treasurer@demo.club')

    const detailed = await request(app)
      .get('/api/v1/reports/period.pdf?month=2026-04')
      .set('Authorization', `Bearer ${token}`)

    const summary = await request(app)
      .get('/api/v1/reports/period.pdf?month=2026-04&detail=summary')
      .set('Authorization', `Bearer ${token}`)

    expect(summary.body.byteLength).toBeLessThan(detailed.body.byteLength)
  })
})

/**
 * One officer, over HTTP.
 *
 * `REQUIRED_APPROVALS` is 0, so recording is posting and there is no approval queue.
 * The two-person machinery is still exercised in approval.test.ts with an explicit
 * requirement, which is what keeps turning it back on a one-line change.
 */
describe('recording an entry as a single officer', () => {
  async function newEntry(token: string): Promise<string> {
    const [funds, categories] = await Promise.all([
      request(app).get('/api/v1/finance/funds').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/v1/finance/categories').set('Authorization', `Bearer ${token}`),
    ])

    const fundId = funds.body.funds[0].id
    const categoryId = categories.body.categories.find(
      (category: { kind: string }) => category.kind === 'expense'
    ).id

    const created = await request(app)
      .post('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'expense',
        date: '2026-06-01',
        amount: '1,234.56',
        fundId,
        categoryId,
        source: 'Test Vendor',
        description: 'API test entry',
      })
      .expect(201)

    expect(created.body.transaction.status).toBe('posted')
    // Parsed exactly, not through a float.
    expect(created.body.transaction.amountPaise).toBe(123_456)

    return created.body.transaction.id
  }

  it('posts the entry the moment one officer records it', async () => {
    const treasurer = await signIn('treasurer@demo.club')

    const before = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)

    await newEntry(treasurer)

    const after = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)

    expect(after.body.totals.expensePaise).toBe(before.body.totals.expensePaise + 123_456)
  })

  it('leaves nothing sitting in an approval queue', async () => {
    // The failure this guards against is not a wrong figure but an invisible one:
    // an entry left 'pending' when nobody can approve it would stay outside every
    // balance for ever, and no screen would ever ask anyone to deal with it.
    const treasurer = await signIn('treasurer@demo.club')
    await newEntry(treasurer)

    const pending = await request(app)
      .get('/api/v1/finance/transactions?status=pending')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    expect(pending.body.transactions.filter((t: { reverses?: string }) => !t.reverses)).toEqual([])
  })

  it('names the officer who recorded it, which is the only trace of who did', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const id = await newEntry(treasurer)

    const all = await request(app)
      .get('/api/v1/finance/transactions?status=all')
      .set('Authorization', `Bearer ${treasurer}`)

    const entry = all.body.transactions.find((t: { id: string }) => t.id === id)
    expect(entry.createdByName).toBe('Demo Treasurer')
    expect(entry.postedAt).toBeTruthy()
  })

  it('reverses rather than deletes, and cancels the original as it posts', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const president = await signIn('president@demo.club')

    const id = await newEntry(treasurer)

    const reversal = await request(app)
      .post(`/api/v1/finance/transactions/${id}/reverse`)
      .set('Authorization', `Bearer ${president}`)
      .send({ reason: 'Wrong fund' })
      .expect(201)

    // The opposite kind, same amount, posted straight away.
    expect(reversal.body.transaction.kind).toBe('income')
    expect(reversal.body.transaction.amountPaise).toBe(123_456)
    expect(reversal.body.transaction.status).toBe('posted')

    const all = await request(app)
      .get('/api/v1/finance/transactions?status=all')
      .set('Authorization', `Bearer ${treasurer}`)

    /**
     * The original must be marked in the same breath.
     *
     * With a second approval required, this happened when that approval arrived.
     * At zero the reversal posts on creation, and the original was left looking
     * live — so the ledger held a posted payment and a posted cancellation of it,
     * and counted both.
     */
    const original = all.body.transactions.find((t: { id: string }) => t.id === id)
    expect(original.status).toBe('reversed')
    expect(original.reversedBy).toBe(reversal.body.transaction.id)
  })

  it('nets a reversal against its original in the figures', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const president = await signIn('president@demo.club')

    // A window wide enough to hold both. A reversal is dated the day it is made, not
    // the day of the entry it cancels, so a June-only view would show the expense
    // and not the reversal — which looks exactly like the bug this is testing for.
    const wide = 'from=2026-01-01&to=2027-12-31'

    const before = await request(app)
      .get(`/api/v1/finance/dashboard?${wide}`)
      .set('Authorization', `Bearer ${treasurer}`)

    const id = await newEntry(treasurer)
    await request(app)
      .post(`/api/v1/finance/transactions/${id}/reverse`)
      .set('Authorization', `Bearer ${president}`)
      .send({ reason: 'Wrong fund' })
      .expect(201)

    const after = await request(app)
      .get(`/api/v1/finance/dashboard?${wide}`)
      .set('Authorization', `Bearer ${treasurer}`)

    // The reversal is income of the same amount as the expense it cancels, so the
    // club's position is exactly where it started.
    expect(after.body.totalFundsPaise).toBe(before.body.totalFundsPaise)
  })

  it('refuses to reverse the same entry twice', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const president = await signIn('president@demo.club')

    const id = await newEntry(treasurer)
    await request(app)
      .post(`/api/v1/finance/transactions/${id}/reverse`)
      .set('Authorization', `Bearer ${president}`)
      .send({ reason: 'Wrong fund' })
      .expect(201)

    const again = await request(app)
      .post(`/api/v1/finance/transactions/${id}/reverse`)
      .set('Authorization', `Bearer ${president}`)
      .send({ reason: 'Again' })
      .expect(409)

    expect(again.body.error.code).toBe('not_posted')
  })

  it('rejects a future-dated entry', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const funds = await request(app)
      .get('/api/v1/finance/funds')
      .set('Authorization', `Bearer ${treasurer}`)

    await request(app)
      .post('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${treasurer}`)
      .send({
        kind: 'income',
        date: '2099-01-01',
        amount: '100',
        fundId: funds.body.funds[0].id,
        categoryId: 'cat-1',
        source: 'Future',
        description: 'Should be refused',
      })
      .expect(400)
  })
})
