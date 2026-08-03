import { pino } from 'pino'

import { env, isDevelopment, isServerless } from '../config/env.js'

/**
 * Application logger.
 *
 * Redaction is not cosmetic: request logs of a club system will otherwise
 * accumulate bearer tokens and member contact details in plain text.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.upiTransactionId',
      'res.headers["set-cookie"]',
      // body-parser attaches the raw payload to its SyntaxError. On a payment or
      // profile endpoint that payload is personal data, and a malformed request
      // is exactly when it would be written to the log unredacted.
      'err.body',
    ],
    censor: '[redacted]',
  },
  /**
   * Pretty output only for a human watching a terminal.
   *
   * Never in a serverless function, for two reasons: pino-pretty is loaded as a
   * worker thread by module name, which cannot be resolved once the function is
   * bundled — it fails with "unable to determine transport target" and every
   * request returns 500 — and it is a devDependency that would not be installed
   * there anyway. Functions want single-line JSON, which is what the platform's
   * log viewer parses.
   */
  ...(isDevelopment && !isServerless
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})
