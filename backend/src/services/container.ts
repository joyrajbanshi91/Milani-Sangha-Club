import { databaseId, getTables } from '../config/appwrite.js'
import { env, hasAppwriteCredentials, isServerless } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { AppwriteFinanceStore } from './appwriteStore.js'
import { AuthService } from './authService.js'
import { DEMO_CSV } from './demoSeed.js'
import { FinanceService, type AuditEntry } from './financeService.js'
import { InMemoryFinanceStore } from './memoryStore.js'
import { PaymentService } from './paymentService.js'
import { buildPaymentStore } from './paymentStore.js'
import { buildProfileStore, type ProfileStore } from './profileStore.js'
import type { FinanceStore } from './store.js'

/**
 * Wires the services together once, at boot.
 *
 * The choice of store is made here and nowhere else: Appwrite credentials put the
 * ledger in Appwrite, and without them it is the embedded demo ledger. Every layer
 * above is identical either way, and the API always starts — see `buildStore()` for
 * why that last part matters.
 */

export interface Container {
  auth: AuthService
  finance: FinanceService
  store: FinanceStore
  profiles: ProfileStore
  payments: PaymentService
}

let container: Container | undefined

export function getContainer(): Container {
  if (container) return container

  const auth = new AuthService()
  const store = buildStore()

  const audit = async (entry: AuditEntry): Promise<void> => {
    const record = {
      action: entry.action,
      actorUid: entry.actor.uid,
      actorName: entry.actor.name,
      actorRole: entry.actor.role,
      targetId: entry.targetId,
      details: entry.details,
      at: new Date().toISOString(),
    }

    // The audit trail is append-only and must survive the request that caused it,
    // so a logging failure is reported but never fails the operation itself.
    if (store instanceof AppwriteFinanceStore) {
      try {
        await store.writeAuditLog(record)
      } catch (error) {
        logger.error({ err: error, record }, 'FAILED TO WRITE AUDIT LOG')
      }
    }

    logger.info(record, 'audit')
  }

  const finance = new FinanceService(
    store,
    {
      name: env.CLUB_NAME,
      address: env.CLUB_ADDRESS,
      registrationNumber: env.CLUB_REGISTRATION_NUMBER,
    },
    audit
  )

  container = {
    auth,
    store,
    profiles: buildProfileStore(),
    finance,
    // Takes the finance service rather than the store: recording a member's payment
    // must go through exactly the path an officer's own entry does, so the
    // two-person rule cannot be bypassed by writing to the store directly.
    payments: new PaymentService(buildPaymentStore(), finance, audit),
  }

  logger.info({ store: store.kind, auth: auth.mode }, 'services ready')
  return container
}

function buildStore(): FinanceStore {
  if (hasAppwriteCredentials) {
    return new AppwriteFinanceStore(getTables, databaseId)
  }

  /**
   * No credentials: the demo ledger, wherever we are running.
   *
   * This used to throw in a serverless runtime, for two reasons that were both
   * true and neither of which justified it. The demo store did seed itself from
   * `data/demo` by relative path, which no longer survives bundling — fixed at
   * source by embedding the CSVs in services/demoSeed.ts. And a club's accounts
   * genuinely have no business in a function's memory — which is an argument for
   * saying so plainly, not for refusing to start.
   *
   * Refusing to start was the worse failure. It meant a first deploy could not be
   * looked at until a database had been provisioned and six variables entered
   * correctly, and when any of that was wrong the only symptom was 500 from every
   * route, health included. Now the site comes up, the finance area works against
   * sample figures, and `kind === 'memory'` is carried all the way to a banner on
   * every signed-in page so nobody can mistake it for the real ledger.
   */
  const memory = new InMemoryFinanceStore()
  memory.seed(DEMO_CSV)

  if (isServerless) {
    logger.warn(
      'DEPLOYED WITH NO DATABASE. The finance area is showing sample data and every ' +
        'entry will be lost when this function goes cold. Set APPWRITE_PROJECT_ID and ' +
        'APPWRITE_API_KEY in the Netlify dashboard to use a real ledger — see ' +
        'docs/09-netlify.md.'
    )
  }

  return memory
}

/** Test seam: drop the singleton so a test can build a fresh container. */
export function resetContainer(): void {
  container = undefined
}
