import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

import { isProduction } from '../config/env.js'
import { AppError } from '../lib/httpError.js'
import { logger } from '../lib/logger.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId?: string
}

/** 404 for unmatched routes — registered after all route modules. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'route_not_found',
      message: `Cannot ${req.method} ${req.path}`,
    },
  } satisfies ErrorBody)
}

/**
 * Is this the database refusing a column it has never heard of?
 *
 * Appwrite answers a write carrying an unknown attribute with
 * `document_invalid_structure`, and the message names the attribute. Matched on both
 * the type and the wording rather than only the type, because the same type covers
 * ordinary validation faults — a string too long for its column — which are the
 * application's bug and should stay a 500 that somebody investigates.
 */
function isSchemaMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const type = (error as { type?: unknown }).type
  const looksLikeAppwrite = type === 'document_invalid_structure' || type === 'row_invalid_structure'

  return looksLikeAppwrite && /unknown attribute|unknown column/i.test(error.message)
}

/**
 * Terminal error handler.
 *
 * Anything unrecognised becomes a generic 500 in production: a stack trace or a
 * driver message leaking to a public endpoint is an information disclosure, and
 * the detail is already in the logs where it belongs.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = typeof req.id === 'string' ? req.id : undefined
  const log = req.log ?? logger

  let status = 500
  let body: ErrorBody = {
    error: { code: 'internal_error', message: 'An unexpected error occurred.' },
    ...(requestId ? { requestId } : {}),
  }

  if (error instanceof ZodError) {
    status = 400
    body = {
      error: {
        code: 'validation_error',
        message: 'The submitted data is invalid.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      ...(requestId ? { requestId } : {}),
    }
  } else if (error instanceof AppError) {
    status = error.statusCode
    body = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      ...(requestId ? { requestId } : {}),
    }
  } else if (
    error instanceof SyntaxError &&
    'type' in error &&
    (error as { type?: string }).type === 'entity.parse.failed'
  ) {
    status = 400
    body = {
      error: { code: 'malformed_json', message: 'Request body is not valid JSON.' },
      ...(requestId ? { requestId } : {}),
    }
  } else if (isSchemaMismatch(error)) {
    /**
     * The database is behind the code.
     *
     * This cost the club an evening. A release added a column to the payments table,
     * the schema had not been provisioned yet, and Appwrite refused every write with
     * "unknown attribute" — which arrived at the member as *An unexpected error
     * occurred*, on the one screen where an unexplained failure means "the club has
     * lost my money". Nothing on any screen or in any message named the cause.
     *
     * A 503 with the command that fixes it, because that is what is true: the request
     * was fine, the service is not ready for it, and somebody has to run one thing.
     */
    status = 503
    body = {
      error: {
        code: 'schema_out_of_date',
        message:
          'The club’s database is missing a column this version of the software needs, so this ' +
          'could not be saved. Nothing was recorded — please tell an office bearer, and ask them ' +
          'to run: npm run appwrite:provision -- --write',
      },
      ...(requestId ? { requestId } : {}),
    }
  } else if (!isProduction && error instanceof Error) {
    body = {
      error: { code: 'internal_error', message: error.message, details: error.stack },
      ...(requestId ? { requestId } : {}),
    }
  }

  if (status >= 500) {
    log.error({ err: error }, 'unhandled request error')
  } else {
    log.warn({ err: error, status }, 'request failed')
  }

  res.status(status).json(body)
}
