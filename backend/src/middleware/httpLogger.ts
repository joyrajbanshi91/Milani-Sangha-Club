import { randomUUID } from 'node:crypto'

import { pinoHttp } from 'pino-http'

import { logger } from '../lib/logger.js'

/**
 * Request logging with a correlation id.
 *
 * An inbound X-Request-Id is honoured so that a request can be followed across
 * Firebase Hosting, this service and the client's error report; otherwise one is
 * generated. The id is echoed back on the response and included in error bodies.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id']
    const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID()
    res.setHeader('X-Request-Id', id)
    return id
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  autoLogging: {
    // Probes are polled continuously, and readiness answers 503 by design until
    // credentials are provisioned. Logging that as a request error would fill the
    // log with fabricated stack traces and trip alerting on a healthy deploy —
    // the routes themselves log when something is genuinely wrong.
    ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false,
  },
})
