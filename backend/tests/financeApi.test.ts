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
    expect(response.headers['content-disposition']).toContain('statement-2026-04-01')
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

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

  it('posts the entry when a different officer approves', async () => {
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
  })

  it('keeps a pending entry out of the dashboard figures until it is approved', async () => {
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

    // The opposite kind, same amount, pending.
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
    expect(original.reversedBy).toBeTruthy()
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
