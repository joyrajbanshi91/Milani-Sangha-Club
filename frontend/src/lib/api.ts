import { env } from '@/config/env'
import { ApiError } from '@/lib/apiError'
import { resolveToken } from '@/lib/session'

export { ApiError }

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON. Use `rawBody` for FormData or Blob payloads. */
  body?: unknown
  rawBody?: BodyInit
  /** Skip attaching the caller's token (public endpoints). */
  anonymous?: boolean
}

interface ApiErrorBody {
  error?: { message?: string; code?: string; details?: unknown }
  message?: string
}

/**
 * The bearer token for the current request.
 *
 * Async because in Appwrite mode this mints a short-lived JWT, which refreshes
 * one that is close to expiring. Whichever mode is in use, the client sends only
 * the token — never a role. The server decides what the caller may do.
 */
async function authHeader(): Promise<Record<string, string>> {
  const token = await resolveToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Thin fetch wrapper around the backend API.
 *
 * Every privileged call carries the caller's Appwrite JWT; the backend
 * verifies it and derives the role from custom claims. The client never sends
 * a role of its own — it would be trivially forgeable.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, rawBody, anonymous, headers, ...init } = options

  const url = `${env.VITE_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

  const resolvedHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(anonymous ? {} : await authHeader()),
    ...((headers as Record<string, string>) ?? {}),
  }

  const response = await fetch(url, {
    ...init,
    headers: resolvedHeaders,
    body: body !== undefined ? JSON.stringify(body) : rawBody,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  const payload: unknown = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const parsed = (isJson ? payload : { message: String(payload) }) as ApiErrorBody
    throw new ApiError(
      parsed.error?.message ?? parsed.message ?? `Request failed with status ${response.status}`,
      response.status,
      parsed.error?.code,
      parsed.error?.details
    )
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
}
