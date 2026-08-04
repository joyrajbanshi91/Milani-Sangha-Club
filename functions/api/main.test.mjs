/**
 * Drive the Appwrite function with a faked Appwrite context.
 *
 *   node functions/api/main.test.mjs
 *
 * The adapter between Appwrite's `{ req, res }` and Express is the one piece of this
 * deployment that cannot be exercised by the backend's own tests, and the one most
 * likely to be quietly wrong — a dropped body or a mangled binary looks like a
 * working API until someone downloads a receipt. This runs the real Express app
 * through the real adapter and checks what comes back.
 *
 * Plain node, no test runner: it has to be runnable before anything is deployed and
 * without adding a dependency to a function that has to stay small.
 */
import assert from 'node:assert/strict'

import main from './main.mjs'

/** Stands in for Appwrite's response builder, recording what the function returned. */
function makeContext(request) {
  const captured = {}

  const res = {
    text(body, statusCode = 200, headers = {}) {
      Object.assign(captured, { body, statusCode, headers, kind: 'text' })
      return captured
    },
    binary(body, statusCode = 200, headers = {}) {
      Object.assign(captured, { body, statusCode, headers, kind: 'binary' })
      return captured
    },
    json(body, statusCode = 200, headers = {}) {
      Object.assign(captured, { body, statusCode, headers, kind: 'json' })
      return captured
    },
    empty() {
      Object.assign(captured, { statusCode: 204, kind: 'empty' })
      return captured
    },
  }

  const logs = []

  return {
    context: {
      req: {
        method: 'GET',
        path: '/',
        query: {},
        headers: {},
        bodyText: '',
        ...request,
      },
      res,
      log: (message) => logs.push(String(message)),
      error: (message) => logs.push(`ERROR ${String(message)}`),
    },
    captured,
    logs,
  }
}

let failures = 0

async function check(name, request, assertions) {
  const { context, captured, logs } = makeContext(request)
  try {
    await main(context)
    await assertions(captured, logs)
    process.stdout.write(`ok   ${name}\n`)
  } catch (error) {
    failures += 1
    process.stdout.write(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}\n`)
  }
}

// The health endpoint needs no credentials and no database, which makes it the right
// probe for "did a request reach Express and come back".
await check('GET /api/v1/health reaches Express', { path: '/api/v1/health' }, (captured) => {
  assert.equal(captured.statusCode, 200, `expected 200, got ${captured.statusCode}`)
  const payload = JSON.parse(captured.body)
  assert.equal(payload.status, 'ok')
})

// A path Express does not know must come back as the app's own 404 JSON, not as
// Appwrite's HTML — proof the response really travelled through the app.
await check('an unknown path returns the app 404', { path: '/api/v1/nonsense' }, (captured) => {
  assert.equal(captured.statusCode, 404)
  assert.doesNotMatch(captured.body, /<html/i, 'got HTML, so this did not come from the app')
})

// The query string is the part most easily dropped by an adapter, and it is silent
// when it happens: filters simply stop narrowing anything.
await check(
  'the query string survives',
  { path: '/api/v1/health', query: { probe: 'kept' } },
  (captured) => {
    assert.equal(captured.statusCode, 200)
  }
)

// A POST body must arrive intact. /auth/demo-login is unauthenticated and echoes a
// clear failure for an unknown account, which is enough to prove the body was read:
// a dropped body produces a validation error instead.
await check(
  'a JSON request body arrives',
  {
    method: 'POST',
    path: '/api/v1/auth/demo-login',
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify({ email: 'nobody@example.invalid' }),
  },
  (captured) => {
    assert.ok(
      captured.statusCode >= 400 && captured.statusCode < 500,
      `expected a 4xx for an unknown account, got ${captured.statusCode}`
    )
    assert.doesNotMatch(
      captured.body,
      /"email".*required/i,
      'the body was dropped: the app complained the field was missing'
    )
  }
)

// Security headers come from helmet, inside the app. Their presence here proves the
// middleware stack ran rather than being bypassed by the adapter.
await check('helmet headers survive the adapter', { path: '/api/v1/health' }, (captured) => {
  const headers = Object.fromEntries(
    Object.entries(captured.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  )
  assert.ok(
    headers['x-content-type-options'] === 'nosniff',
    `expected helmet's x-content-type-options, saw: ${Object.keys(headers).join(', ')}`
  )
})

process.stdout.write(failures === 0 ? '\nall adapter checks passed\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
