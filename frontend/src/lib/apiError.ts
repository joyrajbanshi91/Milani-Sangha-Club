/**
 * Error returned by the backend REST API.
 *
 * Kept in its own module — free of any Appwrite import — so that modules which
 * only need to *classify* an error (the query client's retry policy, error
 * boundaries) do not drag the Appwrite SDK into the initial bundle.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(message: string, status: number, code = 'internal_error', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** 4xx responses are the caller's fault and should not be retried. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}
