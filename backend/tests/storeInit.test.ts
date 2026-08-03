import { describe, expect, it } from 'vitest'

import { FirestoreFinanceStore } from '../src/services/firestoreStore.js'

/**
 * The Firestore store must not touch Firebase when it is constructed.
 *
 * This is a regression test for a real failure: the container used to call
 * `getDb()` while building the store, at module load. A malformed private key in
 * one environment variable therefore threw during import and took down the entire
 * API — including the health endpoint whose job is to report exactly that. The
 * server would not start at all, with a stack trace and no explanation.
 *
 * Holding a getter instead means credentials are only parsed when a request
 * actually needs data, so the process starts, health answers, and readiness
 * reports 503 with the reason.
 */
describe('FirestoreFinanceStore initialisation', () => {
  it('does not call the database getter while being constructed', () => {
    let called = false

    const store = new FirestoreFinanceStore(() => {
      called = true
      // Stands in for "Failed to parse private key".
      throw new Error('credentials are broken')
    })

    expect(called).toBe(false)
    expect(store.kind).toBe('firestore')
  })

  it('surfaces a credential failure on first use, not at construction', async () => {
    const store = new FirestoreFinanceStore(() => {
      throw new Error('Failed to parse private key')
    })

    await expect(store.listFunds()).rejects.toThrow(/private key/i)
  })
})
