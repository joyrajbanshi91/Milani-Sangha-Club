#!/usr/bin/env node
/**
 * Smoke test for the API as it actually runs: an Appwrite Function.
 *
 * `npm test` exercises the Express app through supertest, which is the right tool for
 * routes but bypasses the layer that broke in deployment — the adapter in
 * `functions/api/main.mjs` translating Appwrite's `{ req, res }` into the request and
 * response objects Express expects, and the container deciding which store to build
 * when no credentials exist.
 *
 * This runs **the real entrypoint**, not a copy of it. It used to build its own
 * `serverless-http` handler and invoke it with a Netlify-shaped Lambda event, which
 * stopped testing anything real the day the site moved to Appwrite: the adapter it
 * checked was not the adapter that runs.
 *
 * Every failure it catches was a real one:
 *
 *   • The container threw when it found no database credentials in a serverless
 *     runtime, so every route answered 500 — health included, which is what made it
 *     so hard to diagnose from a deployed site.
 *   • The demo store seeded itself by resolving a relative path to `data/demo`, which
 *     does not survive the backend being bundled into one file.
 *   • A PDF returned as text rather than base64 arrives as mangled UTF-8 and will not
 *     open.
 *
 * Run with `npm run test:function`. `APPWRITE_FUNCTION_ID` is set below because that
 * is what Appwrite sets and `isServerless` in config/env.ts reads it — without it this
 * would test the long-lived-server path and prove nothing about the function.
 */
import assert from 'node:assert/strict'

process.env.NODE_ENV ??= 'production'
process.env.LOG_LEVEL ??= 'silent'
// What Appwrite sets. Makes config/env.ts report isServerless === true.
process.env.APPWRITE_FUNCTION_ID ??= 'api'

/**
 * Deliberately NOT setting TRUST_PROXY.
 *
 * docs/10-appwrite.md says to set it to 1, and with it Express resolves `req.ip` from
 * the forwarded header correctly. Leaving it unset here tests the misconfigured case
 * on purpose: it is the one that used to make express-rate-limit throw
 * ERR_ERL_UNDEFINED_IP_ADDRESS on every request and stop limiting anything at all.
 * The `keyGenerator` in middleware/rateLimit.ts falls back to `x-forwarded-for`, and
 * this is what proves it.
 */

// Deliberately unset, so this tests the no-credentials path a first deploy takes.
for (const key of [
  'APPWRITE_PROJECT_ID',
  'APPWRITE_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
]) {
  delete process.env[key]
}

/**
 * The deployed entrypoint itself, so this tests the adapter that actually runs.
 */
const main = (await import('../functions/api/main.mjs')).default

/** Invoke the function the way Appwrite's runtime does. */
async function invoke(path, { method = 'GET', body, headers = {} } = {}) {
  const [pathname, search = ''] = path.split('?')

  // Appwrite's response object, reduced to what the adapter uses. Capturing what it
  // is handed is the point: a status or a header lost in translation is exactly the
  // class of bug this file exists for.
  let captured = { statusCode: 0, headers: {}, body: '', binary: false }

  const res = {
    text: (value, statusCode, responseHeaders) => {
      captured = { statusCode, headers: responseHeaders ?? {}, body: value, binary: false }
      return captured
    },
    binary: (value, statusCode, responseHeaders) => {
      captured = { statusCode, headers: responseHeaders ?? {}, body: value, binary: true }
      return captured
    },
    json: (value, statusCode, responseHeaders) => {
      captured = {
        statusCode,
        headers: responseHeaders ?? {},
        body: JSON.stringify(value),
        binary: false,
      }
      return captured
    },
  }

  await main({
    req: {
      method,
      path: pathname,
      query: Object.fromEntries(new URLSearchParams(search)),
      headers: {
        'content-type': 'application/json',
        // The rate limiter's key depends on this when TRUST_PROXY is unset.
        'x-forwarded-for': '203.0.113.7',
        ...headers,
      },
      bodyText: body === undefined ? '' : JSON.stringify(body),
      bodyBinary: undefined,
    },
    res,
    log: () => {},
    error: () => {},
  })

  return captured
}

function parse(response, path) {
  const contentType = response.headers?.['content-type'] ?? ''
  assert.ok(
    contentType.includes('application/json'),
    `${path} answered ${contentType || '(no content-type)'} rather than JSON. ` +
      'HTML here is the signature of the SPA fallback swallowing the API route.'
  )
  return JSON.parse(response.body)
}

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

check('GET /api/v1/health is 200 and reports ok', async () => {
  const response = await invoke('/api/v1/health')
  assert.equal(response.statusCode, 200)
  const body = parse(response, '/api/v1/health')
  assert.equal(body.status, 'ok')
  assert.equal(body.environment, 'production')
})

check('GET /api/v1/health/ready is an honest 503 with no database', async () => {
  const response = await invoke('/api/v1/health/ready')
  assert.equal(
    response.statusCode,
    503,
    'Readiness must fail without a database. A 200 here would mean a deployment ' +
      'holding sample data reports itself ready to hold the club’s accounts.'
  )
  const body = parse(response, '/api/v1/health/ready')
  assert.equal(body.checks.store, 'memory')
  assert.match(body.checks.message, /APPWRITE_PROJECT_ID/)
})

check('GET /api/v1/auth/config tells the client it is a demo', async () => {
  const response = await invoke('/api/v1/auth/config')
  assert.equal(response.statusCode, 200)
  const body = parse(response, '/api/v1/auth/config')
  assert.equal(body.mode, 'demo')
  assert.equal(
    body.store,
    'memory',
    'The client renders its Sample data banner from this field. Without it, a ' +
      'deployment with no database looks exactly like the real thing.'
  )
  assert.ok(Array.isArray(body.accounts) && body.accounts.length === 4)

  // No `appwrite` block in demo mode. If one appeared here the browser would build a
  // client against a project that is not configured, and sign-in would fail with an
  // opaque network error instead of showing the demo picker.
  assert.equal(body.appwrite, undefined)
})

check('the demo ledger is actually seeded', async () => {
  const login = await invoke('/api/v1/auth/demo-login', {
    method: 'POST',
    body: { email: 'treasurer@demo.club' },
  })
  assert.equal(login.statusCode, 200, `demo sign-in failed: ${login.body}`)
  const { token, user } = parse(login, '/api/v1/auth/demo-login')
  assert.equal(user.role, 'treasurer')
  assert.equal(user.isFinanceOfficer, true)

  const funds = await invoke('/api/v1/finance/funds', {
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(funds.statusCode, 200, `funds failed: ${funds.body}`)
  const body = parse(funds, '/api/v1/finance/funds')
  const rows = Array.isArray(body) ? body : (body.funds ?? body.data)
  assert.ok(
    Array.isArray(rows) && rows.length > 0,
    'The demo ledger seeded no funds. This is what the embedded CSVs in ' +
      'services/demoSeed.ts exist to prevent — a relative path to data/demo does ' +
      'not survive bundling.'
  )
})

check('an unauthenticated privileged route is refused, not 500', async () => {
  const response = await invoke('/api/v1/finance/funds')
  assert.equal(response.statusCode, 401, `expected 401, got ${response.statusCode}`)
})

check('the rate limiter identifies a caller without req.ip', async () => {
  // A working limiter emits the draft-7 RateLimit headers. When it cannot derive a
  // key it throws ERR_ERL_UNDEFINED_IP_ADDRESS internally, answers anyway, and
  // counts nothing — so the absence of these headers is the tell that rate limiting
  // is silently off. `skip: () => isTest` would also remove them, which is why this
  // script runs with NODE_ENV=production rather than test.
  const response = await invoke('/api/v1/health')
  const headers = Object.fromEntries(
    Object.entries(response.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  )

  assert.ok(
    'ratelimit' in headers || 'ratelimit-limit' in headers,
    'No RateLimit headers, so the limiter is not counting this request. With no ' +
      'socket and TRUST_PROXY unset, req.ip is undefined — see the keyGenerator in ' +
      'middleware/rateLimit.ts.'
  )
})

let failed = 0

for (const { name, fn } of checks) {
  try {
    await fn()
    process.stdout.write(`  ok    ${name}\n`)
  } catch (error) {
    failed += 1
    process.stdout.write(`  FAIL  ${name}\n        ${error.message.split('\n').join('\n        ')}\n`)
  }
}

process.stdout.write(
  `\n${checks.length - failed}/${checks.length} function checks passed.\n${
    failed > 0 ? '\nThe API would not work as an Appwrite Function in this state.\n' : ''
  }`
)

process.exit(failed > 0 ? 1 : 0)
