import { FieldValue, type Firestore } from 'firebase-admin/firestore'

import { COLLECTIONS } from '../config/constants.js'
import type { Category, Fund, Transaction } from '../domain/types.js'
import {
  applyFilter,
  formatReference,
  StoreConflictError,
  type FinanceStore,
  type TransactionFilter,
} from './store.js'

/**
 * Firestore-backed finance store.
 *
 * Two things here are not incidental:
 *
 *   • **Reference numbers are allocated inside a Firestore transaction** against a
 *     counter document, never by counting existing entries. Counting is racy: two
 *     officers saving at the same instant would both read "41" and both write
 *     TXN-2026-000042.
 *
 *   • **Every status change is a compare-and-set** on the previous status. Two
 *     officers can open the same pending entry; without the check, both could
 *     approve against a stale copy and the second approval would overwrite the
 *     first officer's signature.
 */
export class FirestoreFinanceStore implements FinanceStore {
  readonly kind = 'firestore' as const

  /**
   * Takes a *getter*, not a Firestore instance.
   *
   * Initialising Firebase Admin needs the credentials to parse, and a malformed
   * private key throws. If that happened while this class was being constructed
   * at boot, a typo in one environment variable would take down the whole API —
   * including the health endpoint that is supposed to report the problem. Held
   * lazily, the failure surfaces on the first request that needs the database,
   * with a message naming the cause.
   */
  constructor(private readonly getDatabase: () => Firestore) {}

  private get db(): Firestore {
    return this.getDatabase()
  }

  private get funds() {
    return this.db.collection(COLLECTIONS.funds)
  }
  private get categories() {
    return this.db.collection(COLLECTIONS.financeCategories)
  }
  private get transactions() {
    return this.db.collection(COLLECTIONS.financeTransactions)
  }
  private get counters() {
    return this.db.collection(COLLECTIONS.settings)
  }

  async listFunds(): Promise<Fund[]> {
    const snapshot = await this.funds.orderBy('name').get()
    return snapshot.docs.map((doc) => ({ ...(doc.data() as Omit<Fund, 'id'>), id: doc.id }))
  }

  async createFund(fund: Omit<Fund, 'id'>): Promise<Fund> {
    const reference = await this.funds.add(fund)
    return { ...fund, id: reference.id }
  }

  async listCategories(): Promise<Category[]> {
    const snapshot = await this.categories.orderBy('name').get()
    return snapshot.docs.map((doc) => ({ ...(doc.data() as Omit<Category, 'id'>), id: doc.id }))
  }

  async createCategory(category: Omit<Category, 'id'>): Promise<Category> {
    const reference = await this.categories.add(category)
    return { ...category, id: reference.id }
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    // Date range and status are pushed to Firestore; free-text search is applied
    // in memory, because Firestore cannot do substring matching. Full-text search
    // across the ledger is a later phase (SRS §18).
    let query = this.transactions.orderBy('date', 'desc').limit(filter?.limit ?? 500)

    if (filter?.status && filter.status !== 'all') {
      query = this.transactions
        .where('status', '==', filter.status)
        .orderBy('date', 'desc')
        .limit(filter.limit ?? 500)
    }

    const snapshot = await query.get()
    const rows = snapshot.docs.map((doc) => ({
      ...(doc.data() as Omit<Transaction, 'id'>),
      id: doc.id,
    }))

    return applyFilter(rows, filter)
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const doc = await this.transactions.doc(id).get()
    if (!doc.exists) return null
    return { ...(doc.data() as Omit<Transaction, 'id'>), id: doc.id }
  }

  /**
   * Allocate the next reference for a year.
   *
   * Must be called inside a Firestore transaction so the read-modify-write of the
   * counter cannot interleave with another officer's.
   */
  private async nextSequence(year: number, count = 1): Promise<number> {
    const counter = this.counters.doc(`counter_transactions_${year}`)

    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(counter)
      const current = (snapshot.data()?.value as number | undefined) ?? 0
      tx.set(counter, { value: current + count }, { merge: true })
      return current + 1
    })
  }

  async createTransaction(draft: Omit<Transaction, 'id' | 'reference'>): Promise<Transaction> {
    const year = Number(draft.date.slice(0, 4))
    const sequence = await this.nextSequence(year)

    const record: Omit<Transaction, 'id'> = {
      ...draft,
      reference: formatReference(year, sequence),
    }

    const reference = await this.transactions.add(record)
    return { ...record, id: reference.id }
  }

  async updateTransaction(
    id: string,
    next: Transaction,
    expectedStatus: Transaction['status']
  ): Promise<Transaction> {
    const doc = this.transactions.doc(id)

    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(doc)
      if (!snapshot.exists) throw new StoreConflictError('That entry no longer exists.')

      const current = snapshot.data() as Transaction
      if (current.status !== expectedStatus) {
        throw new StoreConflictError(
          `Another officer changed this entry while you were looking at it — it is now ${current.status}. Reload and try again.`
        )
      }

      const { id: _id, ...withoutId } = next
      tx.set(doc, withoutId)
    })

    return next
  }

  async createTransactionBatch(
    drafts: Array<Omit<Transaction, 'id' | 'reference'>>
  ): Promise<Transaction[]> {
    if (drafts.length === 0) return []

    // One reservation for the whole batch, so an import does not make hundreds of
    // round trips to the counter.
    const year = Number(drafts[0]?.date.slice(0, 4) ?? new Date().getUTCFullYear())
    const first = await this.nextSequence(year, drafts.length)

    const writer = this.db.bulkWriter()
    const created: Transaction[] = []

    drafts.forEach((draft, index) => {
      const doc = this.transactions.doc()
      const record: Omit<Transaction, 'id'> = {
        ...draft,
        reference: formatReference(year, first + index),
      }
      void writer.set(doc, record)
      created.push({ ...record, id: doc.id })
    })

    await writer.close()
    return created
  }

  /** Append-only audit trail. Never updated, never deleted. */
  async writeAuditLog(entry: {
    action: string
    actorUid: string
    actorName: string
    targetId: string
    details: Record<string, unknown>
    at: string
  }): Promise<void> {
    await this.db.collection(COLLECTIONS.auditLogs).add({
      ...entry,
      serverTime: FieldValue.serverTimestamp(),
    })
  }
}
