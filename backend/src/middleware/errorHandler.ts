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
