import { AppwriteException, ID, Query, type Models, type TablesDB } from 'node-appwrite'

import { databaseId, getTables } from '../config/appwrite.js'
import { COLLECTIONS, type PaymentStatus } from '../config/constants.js'
import { hasAppwriteCredentials } from '../config/env.js'
import { formatPaymentReference, formatReceiptNumber } from '../domain/payments.js'
import type { Payment } from '../domain/types.js'
import { allocateSequence } from './appwriteCounter.js'
import { StoreConflictError } from './store.js'

/**
 * Where members' payment declarations live.
 *
 * A separate store from the ledger on purpose. These rows are the only thing in the
 * system a member can cause to be written, so keeping them in their own table means
 * no code path that a member can reach ever touches `finance_transactions` — the
 * boundary is a table name, not a careful `if`.
 *
 * Two implementations, chosen the same way the finance store is: Appwrite when
 * credentials exist, memory otherwise, so the portal can be clicked through before
 * a database is provisioned.
 */
export interface PaymentStore {
  readonly kind: 'memory' | 'appwrite'

  /** One member's own declarations, newest first. */
  listForMember(memberUid: string): Promise<Payment[]>

  /** Every member's, for the officer's queue. */
  list(filter?: { status?: PaymentStatus | 'all'; limit?: number }): Promise<Payment[]>

  get(id: string): Promise<Payment | null>

  /** Write a declaration, allocating its acknowledgement reference. */
  create(draft: Omit<Payment, 'id' | 'reference'>): Promise<Payment>

  /**
   * Take the next receipt number for a year.
   *
   * Separate from `create` because a receipt exists only once an officer has
   * confirmed the money arrived, and separate from the payment reference series
   * because the two count different things: how many members have told the club
   * something, and how many receipts the club has issued. A club that has to produce
   * its receipt book wants the second to be gapless on its own.
   */
  nextReceiptNumber(year: number): Promise<string>

  /**
   * The declaration carrying this security code, or null.
   *
   * Two jobs, and they are the same lookup: proving a freshly generated code has
   * never been used before it is written, and checking a receipt somebody has handed
   * across the table. See lib/securityCode.ts.
   */
  findBySecurityCode(code: string): Promise<Payment | null>

  /**
   * Replace a declaration, but only if it is still in the state the caller saw.
   *
   * The optimistic lock matters more here than it looks: without it, two officers
   * opening the same declaration could each record it, and the club's books would
   * show a member's single payment twice.
   */
  update(id: string, next: Payment, expectedStatus: PaymentStatus): Promise<Payment>
}

/** Newest first, so a member sees what they just sent at the top. */
function bySubmittedDesc(a: Payment, b: Payment): number {
  return b.submittedAt.localeCompare(a.submittedAt)
}

/**
 * Oldest first for the officer's queue.
 *
 * The opposite order from everywhere else in the application, deliberately: this is
 * a list of people waiting, and the member who has waited longest should be dealt
 * with first. Newest-first would bury them.
 */
function bySubmittedAsc(a: Payment, b: Payment): number {
  return a.submittedAt.localeCompare(b.submittedAt)
}

export class InMemoryPaymentStore implements PaymentStore {
  readonly kind = 'memory' as const

  private payments: Payment[] = []
  private sequence = 0
  private receipts = 0

  listForMember(memberUid: string): Promise<Payment[]> {
    return Promise.resolve(
      this.payments.filter((payment) => payment.memberUid === memberUid).sort(bySubmittedDesc)
    )
  }

  list(filter: { status?: PaymentStatus | 'all'; limit?: number } = {}): Promise<Payment[]> {
    const { status = 'all', limit } = filter
    const matching = this.payments
      .filter((payment) => status === 'all' || payment.status === status)
      .sort(bySubmittedAsc)

    return Promise.resolve(limit ? matching.slice(0, limit) : matching)
  }

  get(id: string): Promise<Payment | null> {
    return Promise.resolve(this.payments.find((payment) => payment.id === id) ?? null)
  }

  create(draft: Omit<Payment, 'id' | 'reference'>): Promise<Payment> {
    this.sequence += 1
    const created: Payment = {
      ...draft,
      id: `pay-${this.sequence}`,
      reference: formatPaymentReference(Number(draft.paidOn.slice(0, 4)), this.sequence),
    }
    this.payments.push(created)
    return Promise.resolve(created)
  }

  nextReceiptNumber(year: number): Promise<string> {
    this.receipts += 1
    return Promise.resolve(formatReceiptNumber(year, this.receipts))
  }

  findBySecurityCode(code: string): Promise<Payment | null> {
    return Promise.resolve(this.payments.find((payment) => payment.securityCode === code) ?? null)
  }

  update(id: string, next: Payment, expectedStatus: PaymentStatus): Promise<Payment> {
    const index = this.payments.findIndex((payment) => payment.id === id)
    if (index === -1) throw new StoreConflictError('That payment no longer exists.')

    const current = this.payments[index]
    if (!current) throw new StoreConflictError('That payment no longer exists.')

    if (current.status !== expectedStatus) {
      throw new StoreConflictError(
        `Somebody else changed this payment while you were looking at it — it is now ${current.status.replace('_', ' ')}. Reload and try again.`
      )
    }

    this.payments[index] = next
    return Promise.resolve(next)
  }
}

type Row = Models.Row

function toPayment(row: Row): Payment {
  const plain = Object.fromEntries(
    Object.entries(row).filter(([key, value]) => !key.startsWith('$') && value !== null)
  )
  return { ...plain, id: row.$id } as unknown as Payment
}

/** Domain object → row payload. `id` lives in `$id`, so it is never a column. */
function toRow(payment: Omit<Payment, 'id'>): Record<string, unknown> {
  return { ...payment }
}

export class AppwritePaymentStore implements PaymentStore {
  readonly kind = 'appwrite' as const

  private get tables(): TablesDB {
    return getTables()
  }

  private get db(): string {
    return databaseId()
  }

  async listForMember(memberUid: string): Promise<Payment[]> {
    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.payments,
      queries: [Query.equal('memberUid', memberUid), Query.limit(200)],
    })
    return rows.map(toPayment).sort(bySubmittedDesc)
  }

  async list(filter: { status?: PaymentStatus | 'all'; limit?: number } = {}): Promise<Payment[]> {
    const queries = [Query.limit(filter.limit ?? 200)]
    if (filter.status && filter.status !== 'all') {
      queries.push(Query.equal('status', filter.status))
    }

    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.payments,
      queries,
    })

    // Sorted here rather than in the query, so both stores order identically and
    // the officer's queue cannot depend on which one is configured.
    return rows.map(toPayment).sort(bySubmittedAsc)
  }

  async get(id: string): Promise<Payment | null> {
    try {
      const row = await this.tables.getRow({
        databaseId: this.db,
        tableId: COLLECTIONS.payments,
        rowId: id,
      })
      return toPayment(row)
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async create(draft: Omit<Payment, 'id' | 'reference'>): Promise<Payment> {
    const year = Number(draft.paidOn.slice(0, 4))
    const sequence = await allocateSequence(this.tables, this.db, `counter_payments_${year}`)

    const record: Omit<Payment, 'id'> = {
      ...draft,
      reference: formatPaymentReference(year, sequence),
    }

    const row = await this.tables.createRow({
      databaseId: this.db,
      tableId: COLLECTIONS.payments,
      rowId: ID.unique(),
      data: toRow(record),
    })

    return toPayment(row)
  }

  async nextReceiptNumber(year: number): Promise<string> {
    const sequence = await allocateSequence(this.tables, this.db, `counter_receipts_${year}`)
    return formatReceiptNumber(year, sequence)
  }

  async findBySecurityCode(code: string): Promise<Payment | null> {
    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.payments,
      queries: [Query.equal('securityCode', code), Query.limit(1)],
    })

    const row = rows[0]
    return row ? toPayment(row) : null
  }

  async update(id: string, next: Payment, expectedStatus: PaymentStatus): Promise<Payment> {
    const current = await this.get(id)
    if (!current) throw new StoreConflictError('That payment no longer exists.')

    if (current.status !== expectedStatus) {
      throw new StoreConflictError(
        `Somebody else changed this payment while you were looking at it — it is now ${current.status.replace('_', ' ')}. Reload and try again.`
      )
    }

    // Staged and committed rather than written directly: Appwrite refuses a commit
    // whose rows changed after staging, which closes the gap between the check
    // above and the write below. See the same pattern in appwriteStore.ts.
    const transaction = await this.tables.createTransaction()

    try {
      const { id: _id, ...withoutId } = next

      await this.tables.createOperations({
        transactionId: transaction.$id,
        operations: [
          {
            action: 'update',
            databaseId: this.db,
            tableId: COLLECTIONS.payments,
            rowId: id,
            data: toRow(withoutId),
          },
        ],
      })

      await this.tables.updateTransaction({ transactionId: transaction.$id, commit: true })
    } catch (error) {
      try {
        await this.tables.updateTransaction({ transactionId: transaction.$id, rollback: true })
      } catch {
        // The error below is the one worth reporting; a failed cleanup must not
        // replace it.
      }

      if (isConflict(error)) {
        throw new StoreConflictError(
          'Somebody else changed this payment while you were saving. Reload and try again.'
        )
      }
      throw error
    }

    return next
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404
}

/** 409 is Appwrite's "already exists" and its "changed underneath you". */
function isConflict(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 409
}

/** Appwrite when it is configured, the demo store otherwise. */
export function buildPaymentStore(): PaymentStore {
  return hasAppwriteCredentials ? new AppwritePaymentStore() : new InMemoryPaymentStore()
}
