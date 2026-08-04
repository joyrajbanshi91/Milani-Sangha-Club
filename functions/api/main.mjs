import serverless from 'serverless-http'

import { createApp } from '../../backend/dist/app.js'

/**
 * The Express API as a single Appwrite Function.
 *
 * Appwrite hands a function `{ req, res, log, error }` with objects of its own
 * design — not Node's `IncomingMessage` and `ServerResponse` — so Express cannot be
 * mounted directly and its own community documentation says as much.
 * `serverless-http` bridges that: it fabricates the request and response objects
 * Express expects from a plain description of the call, which lets `createApp()` be
 * reused completely unchanged. The middleware the finance area depends on — helmet,
 * CORS, the rate limiter, request logging, body parsing — all keep working, and the
 * backend's 148 tests continue to exercise the same code.
 *
 * The same library already runs this app on Netlify, so the repository has one
 * mental model for "the API as a function" rather than two.
 *
 * ## One function, not one per route
 *
 * Appwrite's free plan allows two functions per project, so a function per route
 * was never on the table. `req.path` carries the full path, so this one routes
 * everything itself — which is what Express was already doing.
 *
 * ## Execute access must be "Any"
 *
 * A function reached through its own domain treats every caller as a guest, so
 * Appwrite requires `any` (or `guests`) execute access for the domain to work at
 * all. That is not the security boundary being relied on: every privileged route
 * verifies an Appwrite JWT through `AuthService` and reads the caller's role from
 * their account labels, which only a server key can set. The open door leads
 * straight to a locked one.
 *
 * ## Cross-origin, unavoidably
 *
 * The function has its own domain, separate from the site's, and Appwrite Sites has
 * no documented path rewrite to hide that. So CORS is genuinely exercised here,
 * unlike the single-origin arrangement Netlify allowed. Set `CORS_ORIGINS` to the
 * site's URL, or the browser will refuse every response the API sends.
 */
const app = createApp()

const handler = serverless(app, {
  /**
   * Which responses must be base64-encoded.
   *
   * A function's reply carries a text body, so anything that is not text has to be
   * base64-encoded and flagged. Without this the PDF statement and the Excel export
   * arrive as mangled UTF-8 and will not open — the same trap as on Netlify.
   */
  binary: ['application/pdf', 'application/octet-stream', 'image/*', 'font/*'],
})

/**
 * Appwrite's context, translated into the event shape serverless-http reads.
 *
 * Deliberately built from `req` field by field rather than passed through: the two
 * shapes agree on very little, and an accidental pass-through would silently drop
 * the body or the query string.
 */
function toEvent(req) {
  // Body: Appwrite offers parsed JSON, text and binary. The raw text is what Express
  // wants, because its own body parsers are in the middleware stack and will parse
  // it again — handing over pre-parsed JSON would bypass the size limits set there.
  let body = req.bodyText ?? ''
  let isBase64Encoded = false

  const contentType = req.headers?.['content-type'] ?? ''
  const looksBinary = contentType !== '' && !/^(application\/(json|.*\+json)|text\/|application\/x-www-form-urlencoded)/i.test(contentType)

  if (looksBinary && req.bodyBinary) {
    body = Buffer.from(req.bodyBinary).toString('base64')
    isBase64Encoded = true
  }

  return {
    httpMethod: req.method,
    path: req.path,
    // serverless-http reads either; providing both avoids depending on which.
    queryStringParameters: req.query ?? {},
    multiValueQueryStringParameters: undefined,
    headers: req.headers ?? {},
    body,
    isBase64Encoded,
    requestContext: { path: req.path, httpMethod: req.method },
  }
}

export default async function main({ req, res, log, error }) {
  try {
    const response = await handler(toEvent(req), {})

    const status = response.statusCode ?? 200
    const headers = response.headers ?? {}

    if (response.isBase64Encoded) {
      // res.binary wants bytes, and the body arrived as base64 text.
      return res.binary(Buffer.from(response.body ?? '', 'base64'), status, headers)
    }

    return res.text(response.body ?? '', status, headers)
  } catch (thrown) {
    // A throw here means the adapter failed, not a route: a route error is handled
    // by the app's own error middleware and comes back as a normal response. Log it
    // where an operator will see it, and answer in the shape the client expects
    // rather than letting Appwrite return its own HTML.
    error(thrown instanceof Error ? `${thrown.message}\n${thrown.stack ?? ''}` : String(thrown))
    log('The API adapter threw. This is a bug in functions/api/main.mjs, not a route.')

    return res.text(JSON.stringify({ error: { message: 'The club server could not answer.' } }), 500, {
      'content-type': 'application/json',
    })
  }
}
