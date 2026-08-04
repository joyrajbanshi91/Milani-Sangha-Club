import type { Category, Fund, Transaction } from '../domain/types.js'

/**
 * Data access for the finance area.
 *
 * An interface with two implementations, chosen at boot:
 *
 *   • `InMemoryFinanceStore` — seeded from data/demo/*.csv. Lets the club run and
 *     click through the whole officer area before a Firebase project exists.
 *     Refuses to be used in production.
 *   • `FirestoreFinanceStore` — the real thing, used as soon as Admin credentials
 *     are configured.
 *
 * The domain logic above this layer never knows which is in use, so the approval
 * rules and the arithmetic are identical either way and are tested without a
 * database at all.
 */
export interface FinanceStore {
  /** Human-readable name of the backing store, for the health endpoint. */
  readonly kind: 'memory' | 'firestore' | 'appwrite'

  listFunds(): Promise<Fund[]>
  createFund(fund: Omit<Fund, 'id'>): Promise<Fund>

  listCategories(): Promise<Category[]>
  createCategory(category: Omit<Category, 'id'>): Promise<Category>

  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>
  getTransaction(id: string): Promise<Transaction | null>

  /**
   * Write a new entry, allocating its reference number.
   *
   * The reference sequence must be gapless and unique even when two officers
   * save at the same moment, which is why allocation belongs to the store rather
   * than to the caller.
   */
  createTransaction(draft: Omit<Transaction, 'id' | 'reference'>): Promise<Transaction>

  /**
   * Replace an entry, but only if it is still in the state the caller last saw.
   *
   * `expectedStatus` is an optimistic lock. Without it, two officers opening the
   * same pending entry could each approve against a stale copy and post it twice.
   */
  updateTransaction(
    id: string,
    next: Transaction,
    expectedStatus: Transaction['status']
  ): Promise<Transaction>

  /** Write several entries as one unit — a CSV import batch. */
  createTransactionBatch(
    drafts: Array<Omit<Transaction, 'id' | 'reference'>>
  ): Promise<Transaction[]>
}

export interface TransactionFilter {
  status?: Transaction['status'] | 'all'
  from?: string
  to?: string
  fundId?: string
  categoryId?: string
  /** Free-text match against description, source and reference. */
  search?: string
  limit?: number
}

export class StoreConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoreConflictError'
  }
}

/** Shared filtering, so both implementations behave identically. */
export function applyFilter(
  transactions: readonly Transaction[],
  filter: TransactionFilter = {}
): Transaction[] {
  const { status = 'all', from, to, fundId, categoryId, search, limit } = filter
  const needle = search?.trim().toLowerCase()

  const result = transactions.filter((transaction) => {
    if (status !== 'all' && transaction.status !== status) return false
    if (from && transaction.date < from) return false
    if (to && transaction.date > to) return false
    if (fundId && transaction.fundId !== fundId && transaction.toFundId !== fundId) return false
    if (categoryId && transaction.categoryId !== categoryId) return false

    if (needle) {
      const haystack = [
        transaction.description,
        transaction.source,
        transaction.reference,
        transaction.externalReference ?? '',
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    return true
  })

  // Newest first: an officer opening the ledger wants what just happened.
  result.sort((a, b) => b.date.localeCompare(a.date) || b.reference.localeCompare(a.reference))

  return limit ? result.slice(0, limit) : result
}

/** 'TXN-2026-000042' — year plus a zero-padded sequence, as SRS §7 and §9 do. */
export function formatReference(year: number, sequence: number): string {
  return `TXN-${year}-${String(sequence).padStart(6, '0')}`
}
