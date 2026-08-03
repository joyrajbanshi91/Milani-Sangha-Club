/**
 * Error type for expected, reportable failures.
 *
 * `isOperational` distinguishes "the caller did something we anticipated" from
 * "the process is in an unknown state". Only the former is safe to describe back
 * to the caller verbatim.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: unknown
  readonly isOperational = true

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Error.captureStackTrace?.(this, AppError)
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details)

export const unauthorised = (message = 'Authentication is required') =>
  new AppError(401, 'unauthorised', message)

export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'forbidden', message)

export const notFound = (message = 'Resource not found') =>
  new AppError(404, 'not_found', message)

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details)

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable_entity', message, details)

export const serviceUnavailable = (message: string, details?: unknown) =>
  new AppError(503, 'service_unavailable', message, details)
