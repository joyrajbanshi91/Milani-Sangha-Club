import { createApp } from './app.js'
import { env, hasAppwriteCredentials } from './config/env.js'
import { logger } from './lib/logger.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      version: env.APP_VERSION,
      corsOrigins: env.CORS_ORIGINS,
    },
    `API listening on http://localhost:${env.PORT}/api/v1/health`
  )

  if (!hasAppwriteCredentials) {
    logger.warn(
      'Appwrite credentials are not configured — the demo ledger is in use. ' +
        'See backend/.env.example.'
    )
  }
})

/**
 * Graceful shutdown. Cloud Run and Cloud Functions send SIGTERM before removing
 * an instance; finishing in-flight requests avoids a member seeing a failed
 * payment submission during a routine deploy.
 */
function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down')

  const forceExit = setTimeout(() => {
    logger.error('did not close connections in time, forcing exit')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'error while closing server')
      process.exit(1)
    }
    logger.info('shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection')
})

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception — exiting')
  process.exit(1)
})

export { app, server }
