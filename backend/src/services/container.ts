import { join } from 'node:path'

import { databaseId, getTables } from '../config/appwrite.js'
import { env, hasAppwriteCredentials, hasFirebaseCredentials, isServerless } from '../config/env.js'
import { getDb } from '../config/firebase.js'
import { logger } from '../lib/logger.js'
import { AppwriteFinanceStore } from './appwriteStore.js'
import { AuthService } from './authService.js'
import { FinanceService, type AuditEntry } from './financeService.js'
import { FirestoreFinanceStore } from './firestoreStore.js'
import { InMemoryFinanceStore } from './memoryStore.js'
import { buildProfileStore, type ProfileStore } from './profileStore.js'
import type { FinanceStore } from './store.js'

/**
 * Wires the services together once, at boot.
 *
 * The choice of store is made here and nowhere else: with Firebase Admin
 * credentials the ledger is in Firestore, without them it is the in-memory demo
 * seeded from data/demo/. Every layer above is identical either way.
 */

export interface Container {
  auth: AuthService
  finance: FinanceService
  store: FinanceStore
  profiles: ProfileStore
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
    if (store instanceof FirestoreFinanceStore || store instanceof AppwriteFinanceStore) {
      try {
        await store.writeAuditLog(record)
      } catch (error) {
        logger.error({ err: error, record }, 'FAILED TO WRITE AUDIT LOG')
      }
    }

    logger.info(record, 'audit')
  }

  container = {
    auth,
    store,
    profiles: buildProfileStore(),
    finance: new FinanceService(store, env.CLUB_NAME, audit),
  }

  logger.info({ store: store.kind, auth: auth.mode }, 'services ready')
  return container
}

function buildStore(): FinanceStore {
  // Appwrite is checked first: while both are configured — which is the state
  // during the migration — Appwrite is the one being moved to, and a deployment
  // that still carries stale Firebase variables should not silently keep writing
  // the ledger to Firestore.
  if (hasAppwriteCredentials) {
    return new AppwriteFinanceStore(getTables, databaseId)
  }

  if (hasFirebaseCredentials) {
    return new FirestoreFinanceStore(getDb)
  }

  // The demo store seeds itself from data/demo using import.meta.dirname, which is
  // empty once the function is bundled to CommonJS — and a club's accounts have no
  // business living in a function's memory regardless. Fail with the cause named.
  if (isServerless) {
    throw new Error(
      'No database credentials in a serverless deployment. Set APPWRITE_PROJECT_ID ' +
        'and APPWRITE_API_KEY in the hosting dashboard. See docs/10-appwrite.md.'
    )
  }

  const memory = new InMemoryFinanceStore()
  // import.meta.dirname is backend/src/services at run time, backend/dist/services
  // once compiled; data/demo sits two levels above either.
  memory.seedFromDemoCsv(join(import.meta.dirname, '..', '..', '..', 'data', 'demo'))
  return memory
}

/** Test seam: drop the singleton so a test can build a fresh container. */
export function resetContainer(): void {
  container = undefined
}
