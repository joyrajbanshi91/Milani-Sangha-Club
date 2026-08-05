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

    // What it is, then the period it covers, then which of the two statements — so a
    // downloads folder sorts them by date and two downloads of the same month never
    // arrive as statement.pdf and statement(1).pdf.
    expect(detailed.headers['content-disposition']).toContain(
      'filename="Statement_2026-04_detailed.pdf"'
    )
    expect(summary.headers['content-disposition']).toContain(
      'filename="Statement_2026-04_summary.pdf"'
    )
  })

  it('exposes the filename to the browser, which is how it reaches the download', async () => {
    /**
     * The header a cross-origin fetch cannot read unless the API says it may.
     *
     * A statement is fetched rather than linked, because a link cannot carry the
     * Authorization header — and the name the server chose travels in
     * Content-Disposition. Where the site and the API are not the same origin, the
     * browser hides that header, the front end falls back to its own name, and the
     * club reported that every statement was called `statement.pdf`.
     */
    const token = await signIn('treasurer@demo.club')

    const response = await request(app)
      .get('/api/v1/reports/period.pdf?month=2026-04')
      .set('Origin', 'http://localhost:5173')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.headers['access-control-expose-headers']).toMatch(/Content-Disposition/i)
  })

  it('names an arbitrary range by its two dates', async () => {
    const token = await signIn('treasurer@demo.club')

    const response = await request(app)
      .get('/api/v1/reports/period.pdf?from=2026-04-05&to=2026-05-20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.headers['content-disposition']).toContain(
      'filename="Statement_2026-04-05_to_2026-05-20_detailed.pdf"'
    )
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
 * The two-person rule over HTTP: the recorder plus exactly one other, never a third.
 *
 * The club hit this and misread it — an officer records an entry, clicks Approve, is
 * refused, and concludes the system wants two more people. It wants one signature,
 * from anyone but the author. These tests count it out.
 */
describe('the two-person rule over HTTP', () => {
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

    expect(created.body.transaction.status).toBe('pending')
    // Parsed exactly, not through a float.
    expect(created.body.transaction.amountPaise).toBe(123_456)
    // The message counts the outstanding signatures rather than leaving it to be
    // inferred — the whole reason the club thought a third person was needed.
    expect(created.body.message).toMatch(/needs 1 more approval/i)

    return created.body.transaction.id
  }

  it('refuses to let the author approve their own entry', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const id = await newEntry(treasurer)

    const response = await request(app)
      .post(`/api/v1/finance/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({})
      .expect(409)

    expect(response.body.error.code).toBe('self_approval')
  })

  /** The one that matters: ONE other signature posts it. Not two. */
  it('posts on the first approval from anyone but the author', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')
    const id = await newEntry(treasurer)

    const response = await request(app)
      .post(`/api/v1/finance/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({ note: 'Bill seen' })
      .expect(200)

    expect(response.body.transaction.status).toBe('posted')
    expect(response.body.transaction.approvals).toHaveLength(1)
    expect(response.body.message).toMatch(/approved and posted/i)
  })

  it('needs no third person, whichever bearer gives the approval', async () => {
    // Any finance role can be the second person, so one officer being away does not
    // stop the club. Each of them posts an entry on their own signature.
    for (const approver of ['secretary@demo.club', 'president@demo.club']) {
      const treasurer = await signIn('treasurer@demo.club')
      const id = await newEntry(treasurer)

      const response = await request(app)
        .post(`/api/v1/finance/transactions/${id}/approve`)
        .set('Authorization', `Bearer ${await signIn(approver)}`)
        .send({})
        .expect(200)

      expect(response.body.transaction.status, approver).toBe('posted')
    }
  })

  it('keeps a pending entry out of the figures until that one approval arrives', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')

    const before = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)

    const id = await newEntry(treasurer)

    const during = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)
    expect(during.body.totals.expensePaise).toBe(before.body.totals.expensePaise)

    await request(app)
      .post(`/api/v1/finance/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({})
      .expect(200)

    const after = await request(app)
      .get('/api/v1/finance/dashboard?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${treasurer}`)
    expect(after.body.totals.expensePaise).toBe(before.body.totals.expensePaise + 123_456)
  })

  /**
   * There is no way to change a recorded entry — not for anyone, author included.
   *
   * The club asked for this in as many words. It is not enforced by a check but by
   * the absence of a route: nothing accepts a new amount, date or description for an
   * entry that exists. A test rather than a comment, because a future PATCH added for
   * convenience would silently undo it.
   */
  it('offers no way to edit an entry, to its author or anyone else', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')
    const id = await newEntry(treasurer)

    const attempts: Array<[string, 'put' | 'patch' | 'delete']> = [
      [`/api/v1/finance/transactions/${id}`, 'put'],
      [`/api/v1/finance/transactions/${id}`, 'patch'],
      [`/api/v1/finance/transactions/${id}`, 'delete'],
    ]

    for (const [route, method] of attempts) {
      for (const token of [treasurer, secretary]) {
        const agent = request(app)
        const response = await agent[method](route)
          .set('Authorization', `Bearer ${token}`)
          .send({ amount: '1', description: 'changed' })

        // 404: the route does not exist at all. Anything 2xx would mean it does.
        expect(response.status, `${method.toUpperCase()} ${route}`).toBe(404)
      }
    }

    // And the entry is exactly as it was recorded.
    const all = await request(app)
      .get('/api/v1/finance/transactions?status=all')
      .set('Authorization', `Bearer ${treasurer}`)
    const entry = all.body.transactions.find((candidate: { id: string }) => candidate.id === id)
    expect(entry.amountPaise).toBe(123_456)
    expect(entry.description).toBe('API test entry')
  })

  it('lets the author withdraw their own entry, but only before anyone approves it', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')

    const mine = await newEntry(treasurer)
    await request(app)
      .post(`/api/v1/finance/transactions/${mine}/withdraw`)
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    // Once approved it is posted, and withdrawal is no longer on offer at all.
    const approved = await newEntry(treasurer)
    await request(app)
      .post(`/api/v1/finance/transactions/${approved}/approve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({})
      .expect(200)

    const late = await request(app)
      .post(`/api/v1/finance/transactions/${approved}/withdraw`)
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(409)

    expect(late.body.error.code).toBe('not_pending')
  })

  it('reverses rather than deletes, and needs a second officer for that too', async () => {
    const treasurer = await signIn('treasurer@demo.club')
    const secretary = await signIn('secretary@demo.club')
    const president = await signIn('president@demo.club')

    const id = await newEntry(treasurer)
    await request(app)
      .post(`/api/v1/finance/transactions/${id}/approve`)
      .set('Authorization', `Bearer ${secretary}`)
      .send({})
      .expect(200)

    const reversal = await request(app)
      .post(`/api/v1/finance/transactions/${id}/reverse`)
      .set('Authorization', `Bearer ${president}`)
      .send({ reason: 'Wrong fund' })
      .expect(201)

    // The opposite kind, same amount, pending its own approval.
    expect(reversal.body.transaction.kind).toBe('income')
    expect(reversal.body.transaction.amountPaise).toBe(123_456)
    expect(reversal.body.transaction.status).toBe('pending')

    await request(app)
      .post(`/api/v1/finance/transactions/${reversal.body.transaction.id}/approve`)
      .set('Authorization', `Bearer ${president}`)
      .send({})
      .expect(409)

    await request(app)
      .post(`/api/v1/finance/transactions/${reversal.body.transaction.id}/approve`)
      .set('Authorization', `Bearer ${treasurer}`)
      .send({})
      .expect(200)

    const all = await request(app)
      .get('/api/v1/finance/transactions?status=all')
      .set('Authorization', `Bearer ${treasurer}`)

    const original = all.body.transactions.find((t: { id: string }) => t.id === id)
    expect(original.status).toBe('reversed')
    expect(original.reversedBy).toBe(reversal.body.transaction.id)
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
