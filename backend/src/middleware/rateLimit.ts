import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import type { Request } from 'express'

import { env, isTest } from '../config/env.js'

/**
 * Who is calling, for counting purposes.
 *
 * Supplied explicitly because the default — `req.ip` — is not reliable in a
 * function. Express derives `req.ip` from the socket unless `trust proxy` is set,
 * and inside a Netlify Function there is no real socket: `serverless-http`
 * fabricates the request from an event. With `TRUST_PROXY` unset the value comes
 * back `undefined`, and express-rate-limit then throws
 * `ERR_ERL_UNDEFINED_IP_ADDRESS` on every request — so the limiter stops limiting
 * anything, silently, in exactly the deployment where it matters most.
 *
 * `TRUST_PROXY=1` fixes `req.ip` properly and is what docs/09-netlify.md says to
 * set. This is the fallback for when someone has not, which is a configuration
 * mistake that should cost the club a coarser rate limit rather than none at all.
 *
 * `x-nf-client-connection-ip` is Netlify's own header and is preferred over
 * `x-forwarded-for`, which is a client-supplied list and only trustworthy from the
 * right — hence taking the *first* entry only when it is all we have.
 *
 * The final fallback puts every unidentifiable caller in one bucket. That throttles
 * more aggressively than reality, never less, which is the safe direction: an
 * over-strict limiter is a support question, an absent one is an open door.
 *
 * Every IP goes through `ipKeyGenerator`, which groups IPv6 addresses by their /64
 * rather than counting each one separately. Without it a caller with any ordinary
 * IPv6 allocation bypasses the limit entirely by varying the low bits of their own
 * address — trillions of distinct keys, one bucket each. The library warns about
 * exactly this when a custom key generator handles an IP without it.
 */
function callerKey(req: Request): string {
  if (req.ip) return ipKeyGenerator(req.ip)

  const netlifyIp = req.headers['x-nf-client-connection-ip']
  if (typeof netlifyIp === 'string' && netlifyIp !== '') return ipKeyGenerator(netlifyIp)

  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  if (first) return ipKeyGenerator(first)

  return 'unidentified'
}

const shared = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  keyGenerator: callerKey,
  // Tests would otherwise interfere with one another through a shared counter.
  skip: () => isTest,
  message: {
    error: {
      code: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
    },
  },
}

/** Baseline limit applied to the whole API. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
})

/**
 * Tight limit for endpoints that are attractive to abuse: login, OTP, password
 * reset, membership application, payment submission. Applied per route from
 * Phase 3 onwards.
 */
export const sensitiveLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
})
