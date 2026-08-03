import rateLimit from 'express-rate-limit'

import { env, isTest } from '../config/env.js'

const shared = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
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
