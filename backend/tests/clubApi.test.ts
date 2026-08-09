import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'

/**
 * The club's public statistics.
 *
 * Two properties matter and neither is about the happy path. It must answer without a
 * token, because the home page of a public website has none — and it must not leak
 * anything beyond the count, because it is the only unauthenticated route that reads
 * from the membership side of the system at all.
 *
 * The suite runs with no credentials, so sign-in is in demo mode and the count is
 * `null`: a handful of demo fixtures published as the club's membership would be a
 * wrong number on the front page of the website.
 */
describe('GET /api/v1/club/stats', () => {
  let app: Express

  beforeAll(() => {
    app = createApp()
  })

  it('answers a caller with no token at all', async () => {
    const response = await request(app).get('/api/v1/club/stats').expect(200)
    expect(response.body).toHaveProperty('members')
  })

  it('withholds a number rather than publishing the demo accounts', async () => {
    const response = await request(app).get('/api/v1/club/stats').expect(200)

    // null, not 0. Zero would read as a club that has lost every member, and the
    // website would print it.
    expect(response.body.members).toBeNull()
  })

  it('returns the count and nothing else', async () => {
    const response = await request(app).get('/api/v1/club/stats').expect(200)

    // The guard on the whole idea: no names, no emails, no roles, no money. If this
    // fails, someone widened a public endpoint into the membership register.
    expect(Object.keys(response.body)).toEqual(['members'])
  })

  it('asks browsers to cache it, so a busy home page does not re-count', async () => {
    const response = await request(app).get('/api/v1/club/stats').expect(200)
    expect(response.headers['cache-control']).toMatch(/max-age=\d+/)
  })
})
