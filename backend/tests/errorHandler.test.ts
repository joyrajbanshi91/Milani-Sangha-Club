import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { AppError } from '../src/lib/httpError.js'
import { errorHandler } from '../src/middleware/errorHandler.js'

/**
 * What a failure tells the person who hit it.
 *
 * The case that matters here cost the club an evening. A release added a column to the
 * payments table, provisioning had not run, and Appwrite refused every write with
 * "unknown attribute" — which reached the member as *An unexpected error occurred*, on
 * the one screen where an unexplained failure reads as "the club has lost my money".
 * Nothing on any screen named the cause, so the whole diagnosis had to happen by hand.
 *
 * A generic 500 is right for a genuine bug: a driver message on a public endpoint is an
 * information leak, and the detail belongs in the logs. A database that is simply behind
 * the code is not a bug — it is one command away from working, and the answer should say
 * so.
 */

/** An app whose only route throws whatever it is given. */
function appThrowing(error: unknown): Express {
  const app = express()
  app.get('/boom', () => {
    throw error
  })
  app.use(errorHandler)
  return app
}

/** The shape Appwrite throws for a write carrying a column the table lacks. */
function appwriteUnknownAttribute(): Error {
  const error = new Error(
    'Invalid document structure: unknown attribute: "securityCode"'
  ) as Error & { type: string; code: number }
  error.type = 'document_invalid_structure'
  error.code = 400
  return error
}

describe('a database that is behind the code', () => {
  it('says what is wrong and the command that fixes it', async () => {
    const response = await request(appThrowing(appwriteUnknownAttribute())).get('/boom').expect(503)

    expect(response.body.error.code).toBe('schema_out_of_date')
    // The two things the reader needs: their money was not taken, and what to ask for.
    expect(response.body.error.message).toMatch(/nothing was recorded/i)
    expect(response.body.error.message).toContain('appwrite:provision')
  })

  it('is a 503, because the request was fine and the service is not ready', async () => {
    // Not a 500: nothing is broken and nobody needs to debug it. Not a 400 either —
    // the member's form was correct.
    await request(appThrowing(appwriteUnknownAttribute())).get('/boom').expect(503)
  })
})

describe('everything else', () => {
  it('keeps an ordinary validation fault as a fault to investigate', async () => {
    // Same Appwrite error type, different cause: a value too long for its column is
    // this application's bug, and dressing it up as "run provisioning" would send
    // somebody to fix the wrong thing.
    const error = new Error('Invalid document structure: attribute "note" has invalid type') as Error & {
      type: string
    }
    error.type = 'document_invalid_structure'

    const response = await request(appThrowing(error)).get('/boom')

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('internal_error')
  })

  it('passes a deliberate refusal through with its own words', async () => {
    const response = await request(appThrowing(new AppError(409, 'duplicate', 'Already declared.')))
      .get('/boom')
      .expect(409)

    expect(response.body.error).toMatchObject({ code: 'duplicate', message: 'Already declared.' })
  })
})
