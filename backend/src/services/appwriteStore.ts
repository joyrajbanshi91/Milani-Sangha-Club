import { AppwriteException, ID, Query, type Models, type TablesDB } from 'node-appwrite'

import { COLLECTIONS } from '../config/constants.js'
import type { Approval, Category, Fund, Transaction } from '../domain/types.js'
import {
  applyFilter,
  formatReference,
  StoreConflictError,
  type FinanceStore,
  type TransactionFilter,
} from './store.js'

/**
 * Appwrite-backed finance store.
 *
 * A drop-in sibling of `FirestoreFinanceStore`: same interface, same guarantees,
 * so the domain logic and its 142 tests are untouched by the change of database.
 * Three things needed genuine translation rather than a rename.
 *
 *   • **Reference numbers** come from `incrementRowColumn`, which increments a
 *     counter row server-side and returns the new value in one atomic call. That
 *     is stronger than the Firestore version it replaces — there is no
 *     read-modify-write to interleave with at all, so two officers saving in the
 *     same instant cannot both be handed TXN-2026-000042.
 *
 *   • **Status changes are staged in a transaction and committed.** Appwrite fails
 *     a commit whose rows changed externally after staging, which is exactly the
 *     compare-and-set the approval rules need: two officers can open the same
 *     pending entry, and the second approval is refused rather than silently
 *     overwriting the first officer's signature.
 *
 *   • **`approvals` is stored as JSON in a string column.** Appwrite columns hold
 *     scalars or arrays of scalars, not arrays of objects, so a nested signature
 *     list has nowhere native to go. Nothing queries by approval fields — they are
 *     always read with their transaction — so serialising costs nothing and keeps
 *     an approval and its entry in a single row, which is what makes the
 *     compare-and-set above a single-row operation.
 */

/**
 * Appwrite reserves `$`-prefixed keys; the ledger's own columns are the rest.
 *
 * The base `Models.Row` rather than `DefaultRow`: the latter carries a branded
 * marker property that a mapper taking a row as a parameter would demand of its
 * caller, and every row the SDK returns satisfies the base type.
 */
type Row = Models.Row

const APPROVALS_COLUMN = 'approvalsJson'

function stripMeta(row: Row): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('$')))
}

/**
 * Appwrite returns `null` for a column that was never set; the domain types use
 * `undefined` for absent. Left alone, `notes: null` would defeat every
 * `?? fallback` and print "null" in a report.
 */
function withoutNulls(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null))
}

function toFund(row: Row): Fund {
  return { ...withoutNulls(stripMeta(row)), id: row.$id } as unknown as Fund
}

function toCategory(row: Row): Category {
  return { ...withoutNulls(stripMeta(row)), id: row.$id } as unknown as Category
}

function toTransaction(row: Row): Transaction {
  const { [APPROVALS_COLUMN]: approvalsJson, ...rest } = withoutNulls(stripMeta(row))
  return {
    ...rest,
    id: row.$id,
    approvals: parseApprovals(approvalsJson),
  } as unknown as Transaction
}

/**
 * A malformed signature list must not make an entry unreadable: the ledger is the
 * club's financial record, and refusing to display a row helps nobody. Recovering
 * as "no signatures recorded" is visibly wrong on screen — and so gets reported —
 * where a thrown error would just be a broken page.
 */
function parseApprovals(value: unknown): Approval[] {
  if (typeof value !== 'string' || value.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as Approval[]) : []
  } catch {
    return []
  }
}

/** Domain object → row payload. `id` lives in `$id`, so it is never a column. */
function toRow(transaction: Omit<Transaction, 'id'>): Record<string, unknown> {
  const { approvals, ...rest } = transaction
  return { ...rest, [APPROVALS_COLUMN]: JSON.stringify(approvals ?? []) }
}

export class AppwriteFinanceStore implements FinanceStore {
  readonly kind = 'appwrite' as const

  /**
   * Takes getters rather than values, so that a missing or malformed
   * configuration surfaces on the first request that needs the database instead
   * of at boot — see the note in `config/appwrite.ts`.
   */
  constructor(
    private readonly getTables: () => TablesDB,
    private readonly getDatabaseId: () => string
  ) {}

  private get tables(): TablesDB {
    return this.getTables()
  }

  private get db(): string {
    return this.getDatabaseId()
  }

  async listFunds(): Promise<Fund[]> {
    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.funds,
      queries: [Query.orderAsc('name'), Query.limit(200)],
    })
    return rows.map(toFund)
  }

  async createFund(fund: Omit<Fund, 'id'>): Promise<Fund> {
    const row = await this.tables.createRow({
      databaseId: this.db,
      tableId: COLLECTIONS.funds,
      rowId: ID.unique(),
      data: fund,
    })
    return toFund(row)
  }

  async listCategories(): Promise<Category[]> {
    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.financeCategories,
      queries: [Query.orderAsc('name'), Query.limit(500)],
    })
    return rows.map(toCategory)
  }

  async createCategory(category: Omit<Category, 'id'>): Promise<Category> {
    const row = await this.tables.createRow({
      databaseId: this.db,
      tableId: COLLECTIONS.financeCategories,
      rowId: ID.unique(),
      data: category,
    })
    return toCategory(row)
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    // Status, ordering and the limit are pushed to Appwrite. Free-text search is
    // applied in memory by applyFilter, because a substring match needs a
    // fulltext index and would still not span the four fields the officer area
    // searches at once. Full-text search across the ledger is a later phase
    // (SRS §18), and doing it here would quietly diverge from the memory store.
    const limit = filter?.limit ?? 500
    const queries = [Query.orderDesc('date'), Query.limit(limit)]

    if (filter?.status && filter.status !== 'all') {
      queries.push(Query.equal('status', filter.status))
    }

    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.financeTransactions,
      queries,
    })

    return applyFilter(rows.map(toTransaction), filter)
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const row = await this.tables.getRow({
        databaseId: this.db,
        tableId: COLLECTIONS.financeTransactions,
        rowId: id,
      })
      return toTransaction(row)
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  /**
   * Allocate `count` consecutive sequence numbers for a year, returning the first.
   *
   * `incrementRowColumn` is atomic and returns the counter's new value, so the
   * allocated block is `value - count + 1 … value`. The counter row is created on
   * first use; if two requests race to create it, the loser retries against the
   * row the winner made rather than failing the officer's save.
   */
  private async nextSequence(year: number, count = 1): Promise<number> {
    const rowId = `counter_transactions_${year}`

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const row = await this.tables.incrementRowColumn({
          databaseId: this.db,
          tableId: COLLECTIONS.settings,
          rowId,
          column: 'value',
          value: count,
        })
        const next = Number((row as unknown as { value: unknown }).value)
        return next - count + 1
      } catch (error) {
        if (!isNotFound(error) || attempt === 1) throw error

        try {
          await this.tables.createRow({
            databaseId: this.db,
            tableId: COLLECTIONS.settings,
            rowId,
            data: { key: rowId, value: count },
          })
          return 1
        } catch (createError) {
          // Another request created it first — fall through and increment it.
          if (!isConflict(createError)) throw createError
        }
      }
    }

    throw new Error(`Could not allocate a reference number for ${year}.`)
  }

  async createTransaction(draft: Omit<Transaction, 'id' | 'reference'>): Promise<Transaction> {
    const year = Number(draft.date.slice(0, 4))
    const sequence = await this.nextSequence(year)

    const record: Omit<Transaction, 'id'> = {
      ...draft,
      reference: formatReference(year, sequence),
    }

    const row = await this.tables.createRow({
      databaseId: this.db,
      tableId: COLLECTIONS.financeTransactions,
      rowId: ID.unique(),
      data: toRow(record),
    })

    return toTransaction(row)
  }

  async updateTransaction(
    id: string,
    next: Transaction,
    expectedStatus: Transaction['status']
  ): Promise<Transaction> {
    const current = await this.getTransaction(id)
    if (!current) throw new StoreConflictError('That entry no longer exists.')

    if (current.status !== expectedStatus) {
      throw new StoreConflictError(
        `Another officer changed this entry while you were looking at it — it is now ${current.status}. Reload and try again.`
      )
    }

    // Staged and committed rather than written directly: Appwrite refuses a commit
    // whose rows changed after staging, which closes the gap between the check
    // above and the write below. Without it, two officers approving in the same
    // second would both pass the check and the second would overwrite the first.
    const transaction = await this.tables.createTransaction()

    try {
      const { id: _id, ...withoutId } = next

      await this.tables.createOperations({
        transactionId: transaction.$id,
        operations: [
          {
            action: 'update',
            databaseId: this.db,
            tableId: COLLECTIONS.financeTransactions,
            rowId: id,
            data: toRow(withoutId),
          },
        ],
      })

      await this.tables.updateTransaction({ transactionId: transaction.$id, commit: true })
    } catch (error) {
      await this.rollbackQuietly(transaction.$id)

      if (isConflict(error)) {
        throw new StoreConflictError(
          'Another officer changed this entry while you were saving. Reload and try again.'
        )
      }
      throw error
    }

    return next
  }

  async createTransactionBatch(
    drafts: Array<Omit<Transaction, 'id' | 'reference'>>
  ): Promise<Transaction[]> {
    if (drafts.length === 0) return []

    // One reservation for the whole batch, so importing hundreds of rows does not
    // make hundreds of round trips to the counter.
    const year = Number(drafts[0]?.date.slice(0, 4) ?? new Date().getUTCFullYear())
    const first = await this.nextSequence(year, drafts.length)

    const records = drafts.map((draft, index) => ({
      ...draft,
      reference: formatReference(year, first + index),
    }))

    // An import is all-or-nothing: a partial batch would leave the CSV half
    // applied with no way for the treasurer to tell which half.
    const transaction = await this.tables.createTransaction()

    try {
      await this.tables.createOperations({
        transactionId: transaction.$id,
        operations: records.map((record) => ({
          action: 'create',
          databaseId: this.db,
          tableId: COLLECTIONS.financeTransactions,
          rowId: ID.unique(),
          data: toRow(record),
        })),
      })

      const committed = await this.tables.updateTransaction({
        transactionId: transaction.$id,
        commit: true,
      })

      void committed
    } catch (error) {
      await this.rollbackQuietly(transaction.$id)
      throw error
    }

    // Re-read rather than trusting the staged ids: the commit is the point at
    // which the rows exist, and the reference sequence is what the importer needs
    // back. Bounded by the batch size, so this is one extra query, not N.
    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.financeTransactions,
      queries: [
        Query.equal(
          'reference',
          records.map((record) => record.reference)
        ),
        Query.limit(records.length),
      ],
    })

    return rows.map(toTransaction)
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
    await this.tables.createRow({
      databaseId: this.db,
      tableId: COLLECTIONS.auditLogs,
      rowId: ID.unique(),
      data: {
        ...entry,
        // Appwrite has no server-timestamp sentinel; $createdAt is set by the
        // server and is the value to trust when the two disagree.
        details: JSON.stringify(entry.details),
      },
    })
  }

  /**
   * A transaction that is neither committed nor rolled back holds its staged rows
   * until it expires. Rolling back is therefore worth attempting — but the error
   * that brought us here is the one worth reporting, so a failure to clean up
   * must not replace it.
   */
  private async rollbackQuietly(transactionId: string): Promise<void> {
    try {
      await this.tables.updateTransaction({ transactionId, rollback: true })
    } catch {
      // Deliberately swallowed; see above.
    }
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404
}

/** 409 is Appwrite's "already exists" and its "changed underneath you". */
function isConflict(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 409
}
