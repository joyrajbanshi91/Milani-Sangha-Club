import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'

describe('GET /api/v1/health', () => {
  let app: Express

  beforeAll(() => {
    app = createApp()
  })

  it('reports the service as ok', async () => {
    const response = await request(app).get('/api/v1/health').expect(200)

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'milani-sangha-api',
      environment: 'test',
    })
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('reports not ready when Firebase credentials are absent', async () => {
    const response = await request(app).get('/api/v1/health/ready').expect(503)

    expect(response.body).toMatchObject({
      status: 'not_ready',
      checks: { firestore: 'not_configured' },
    })
  })
})

describe('error handling', () => {
  it('returns a structured 404 for unknown routes', async () => {
    const response = await request(createApp()).get('/api/v1/does-not-exist').expect(404)

    expect(response.body.error).toMatchObject({ code: 'route_not_found' })
  })

  it('rejects malformed JSON with a readable error', async () => {
    const response = await request(createApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400)

    expect(response.body.error.code).toBe('malformed_json')
  })

  it('does not advertise the server technology', async () => {
    const response = await request(createApp()).get('/api/v1/health')

    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})
