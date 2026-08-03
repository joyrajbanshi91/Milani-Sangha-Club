import type { Express } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { MAX_PHOTO_BYTES, assertValidPhoto, PhotoRejected } from '../src/services/profileStore.js'

let app: Express

async function signIn(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/demo-login').send({ email }).expect(200)
  return response.body.token as string
}

/** A 1×1 transparent PNG — the smallest valid image. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

beforeAll(() => {
  app = createApp()
})

describe('photo validation', () => {
  it('accepts JPEG, PNG and WebP data URLs', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(() => assertValidPhoto(`data:${mime};base64,AAAA`)).not.toThrow()
    }
  })

  it('rejects anything that is not an image', () => {
    // An SVG can carry script, and a PDF is not a portrait.
    for (const bad of [
      'data:image/svg+xml;base64,AAAA',
      'data:application/pdf;base64,AAAA',
      'data:text/html;base64,AAAA',
      'https://example.com/photo.jpg',
      'not a data url',
      '',
    ]) {
      expect(() => assertValidPhoto(bad), bad).toThrow(PhotoRejected)
    }
  })

  it('rejects an image beyond the size limit', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(MAX_PHOTO_BYTES * 2)}`
    expect(() => assertValidPhoto(huge)).toThrow(PhotoRejected)
  })
})

describe('a member manages their own picture', () => {
  it('starts with no picture', async () => {
    const token = await signIn('member@demo.club')
    const response = await request(app)
      .get('/api/v1/members/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.profile.photo).toBeNull()
  })

  it('saves, returns and removes a picture', async () => {
    const token = await signIn('member@demo.club')

    const saved = await request(app)
      .put('/api/v1/members/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .send({ photo: TINY_PNG })
      .expect(200)

    expect(saved.body.profile.photo).toBe(TINY_PNG)
    expect(saved.body.profile.photoUpdatedAt).toBeTruthy()

    const fetched = await request(app)
      .get('/api/v1/members/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(fetched.body.profile.photo).toBe(TINY_PNG)

    const removed = await request(app)
      .delete('/api/v1/members/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(removed.body.profile.photo).toBeNull()
  })

  it('refuses a non-image upload with a readable message', async () => {
    const token = await signIn('member@demo.club')

    const response = await request(app)
      .put('/api/v1/members/me/photo')
      .set('Authorization', `Bearer ${token}`)
      .send({ photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
      .expect(400)

    expect(response.body.error.message).toMatch(/JPEG, PNG or WebP/i)
  })

  it('requires a signed-in caller', async () => {
    await request(app).get('/api/v1/members/me').expect(401)
    await request(app).put('/api/v1/members/me/photo').send({ photo: TINY_PNG }).expect(401)
  })

  it('keeps one member’s picture separate from another’s', async () => {
    const member = await signIn('member@demo.club')
    const treasurer = await signIn('treasurer@demo.club')

    await request(app)
      .put('/api/v1/members/me/photo')
      .set('Authorization', `Bearer ${member}`)
      .send({ photo: TINY_PNG })
      .expect(200)

    // There is deliberately no /members/:uid route, so the only record anyone can
    // reach is their own.
    const other = await request(app)
      .get('/api/v1/members/me')
      .set('Authorization', `Bearer ${treasurer}`)
      .expect(200)

    expect(other.body.profile.photo).toBeNull()
    expect(other.body.profile.uid).not.toBe('demo-member')
  })
})

describe('the removed import endpoints', () => {
  it('no longer accepts CSV uploads', async () => {
    const token = await signIn('treasurer@demo.club')

    // The screen was removed at the club's request; the route went with it, so a
    // stale client cannot post a spreadsheet into the ledger.
    await request(app)
      .post('/api/v1/finance/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: 'date,kind\n' })
      .expect(404)
  })
})
