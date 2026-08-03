import { isRouteErrorResponse, useRouteError } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { isDevelopment } from '@/config/env'

/**
 * Router-level error boundary.
 *
 * Members see a plain apology and a way out; the underlying message is shown
 * only in development, so an unexpected failure never leaks internals such as
 * document paths or stack traces to the public site.
 */
export function RouteErrorPage() {
  const error = useRouteError()

  const status = isRouteErrorResponse(error) ? error.status : 500
  const detail =
    error instanceof Error ? error.message : isRouteErrorResponse(error) ? error.statusText : null

  return (
    <Container className="py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">{status}</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Something went wrong</h1>
      <p className="mx-auto mt-3 max-w-md text-slate-600">
        Sorry — that page could not be displayed. Please try again, and contact the club office if
        the problem continues.
      </p>
      {isDevelopment && detail ? (
        <pre className="mx-auto mt-6 max-w-xl overflow-x-auto rounded-lg bg-slate-900 p-4 text-left text-xs text-slate-100">
          {detail}
        </pre>
      ) : null}
      <Button className="mt-6" onClick={() => window.location.assign('/')}>
        Back to home
      </Button>
    </Container>
  )
}
