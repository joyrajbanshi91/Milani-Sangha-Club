import type { Actor } from '../domain/types.js'

/**
 * The verified caller, attached by `requireAuth`.
 *
 * Optional on purpose: a route that has not been through the guard genuinely has
 * no actor, and the type should say so rather than let a handler assume one.
 */
declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor
  }
}
