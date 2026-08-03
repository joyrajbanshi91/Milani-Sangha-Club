import compression from 'compression'
import cors, { type CorsOptions } from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

import { env } from './config/env.js'
import { AppError } from './lib/httpError.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { httpLogger } from './middleware/httpLogger.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { apiRouter } from './routes/index.js'

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // A missing Origin means a non-browser caller (curl, server-to-server,
    // uptime check) — there is no cross-origin risk to mitigate.
    if (!origin || env.CORS_ORIGINS.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new AppError(403, 'cors_rejected', `Origin ${origin} is not permitted`))
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86_400,
}

export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  // Required for correct client IP detection (and therefore rate limiting)
  // when running behind Firebase Hosting or Cloud Run.
  app.set('trust proxy', env.TRUST_PROXY)

  app.use(
    helmet({
      // This service returns JSON and PDFs, never HTML, so a CSP would have
      // nothing to protect; the web app's CSP is set by Firebase Hosting.
      contentSecurityPolicy: false,
      // Receipts and gallery media are fetched by the web app on another origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  )
  app.use(cors(corsOptions))
  app.use(compression())
  app.use(httpLogger)
  // 1.5mb: large enough for a resized profile photograph sent as a data URL,
  // small enough that it is not a denial-of-service surface.
  app.use(express.json({ limit: '1.5mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  app.use('/api', apiLimiter)
  app.use('/api/v1', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
