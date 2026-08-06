import { ID, Query, type Models, type TablesDB } from 'node-appwrite'

import { databaseId, getTables } from '../config/appwrite.js'
import { COLLECTIONS } from '../config/constants.js'
import { hasAppwriteCredentials } from '../config/env.js'
import { formatEnquiryReference, type Enquiry, type EnquiryDraft } from '../domain/enquiry.js'
import { allocateSequence } from './appwriteCounter.js'
import { StoreConflictError } from './store.js'

/**
 * Where visitors' enquiries are kept.
 *
 * Same shape as the other stores: an interface, an in-memory implementation for the demo
 * and the tests, and an Appwrite one for the club. Nothing here decides anything — the
 * rules live in domain/enquiry.ts.
 */
export interface EnquiryStore {
  readonly kind: 'memory' | 'appwrite'

  list(filter?: { status?: Enquiry['status'] | 'all'; limit?: number }): Promise<Enquiry[]>
  get(id: string): Promise<Enquiry | null>
  create(draft: EnquiryDraft): Promise<Enquiry>

  /**
   * Replace an enquiry, but only if it is still in the state the caller saw.
   *
   * Two officers opening the same message and both pressing *Mark dealt with* is not a
   * hypothetical in an office of three: the second write would silently replace the
   * first one's note with their own.
   */
  update(id: string, next: Enquiry, expectedStatus: Enquiry['status']): Promise<Enquiry>

  /** Remove one for good. Spam, and enquiries the club has finished with. */
  remove(id: string): Promise<void>
}

/** Newest first: the office reads the most recent message at the top. */
function byReceivedDesc(a: Enquiry, b: Enquiry): number {
  return b.receivedAt.localeCompare(a.receivedAt)
}

export class InMemoryEnquiryStore implements EnquiryStore {
  readonly kind = 'memory' as const

  private readonly enquiries: Enquiry[] = []
  private sequence = 0

  list(filter: { status?: Enquiry['status'] | 'all'; limit?: number } = {}): Promise<Enquiry[]> {
    const status = filter.status ?? 'all'
    const rows = this.enquiries
      .filter((enquiry) => status === 'all' || enquiry.status === status)
      .sort(byReceivedDesc)

    return Promise.resolve(rows.slice(0, filter.limit ?? 200))
  }

  get(id: string): Promise<Enquiry | null> {
    return Promise.resolve(this.enquiries.find((enquiry) => enquiry.id === id) ?? null)
  }

  create(draft: EnquiryDraft): Promise<Enquiry> {
    this.sequence += 1
    const receivedAt = new Date().toISOString()

    const created: Enquiry = {
      ...draft,
      id: `enq-${this.sequence}`,
      reference: formatEnquiryReference(Number(receivedAt.slice(0, 4)), this.sequence),
      status: 'new',
      receivedAt,
    }

    this.enquiries.push(created)
    return Promise.resolve(created)
  }

  update(id: string, next: Enquiry, expectedStatus: Enquiry['status']): Promise<Enquiry> {
    const index = this.enquiries.findIndex((enquiry) => enquiry.id === id)
    const current = index === -1 ? undefined : this.enquiries[index]

    if (!current) throw new StoreConflictError('That enquiry no longer exists.')
    if (current.status !== expectedStatus) {
      throw new StoreConflictError(
        'Somebody else changed this enquiry while you were looking at it. Reload and try again.'
      )
    }

    this.enquiries[index] = next
    return Promise.resolve(next)
  }

  remove(id: string): Promise<void> {
    const index = this.enquiries.findIndex((enquiry) => enquiry.id === id)
    if (index !== -1) this.enquiries.splice(index, 1)
    return Promise.resolve()
  }
}

type Row = Models.Row

function toEnquiry(row: Row): Enquiry {
  const plain = Object.fromEntries(
    Object.entries(row).filter(([key, value]) => !key.startsWith('$') && value !== null)
  )
  return { ...plain, id: row.$id } as unknown as Enquiry
}

export class AppwriteEnquiryStore implements EnquiryStore {
  readonly kind = 'appwrite' as const

  private get tables(): TablesDB {
    return getTables()
  }

  private get db(): string {
    return databaseId()
  }

  async list(filter: { status?: Enquiry['status'] | 'all'; limit?: number } = {}): Promise<
    Enquiry[]
  > {
    const queries = [Query.limit(filter.limit ?? 200)]
    if (filter.status && filter.status !== 'all') queries.push(Query.equal('status', filter.status))

    const { rows } = await this.tables.listRows({
      databaseId: this.db,
      tableId: COLLECTIONS.enquiries,
      queries,
    })

    // Sorted here rather than in the query, so both stores order identically.
    return rows.map(toEnquiry).sort(byReceivedDesc)
  }

  async get(id: string): Promise<Enquiry | null> {
    try {
      const row = await this.tables.getRow({
        databaseId: this.db,
        tableId: COLLECTIONS.enquiries,
        rowId: id,
      })
      return toEnquiry(row)
    } catch {
      return null
    }
  }

  async create(draft: EnquiryDraft): Promise<Enquiry> {
    const receivedAt = new Date().toISOString()
    const year = Number(receivedAt.slice(0, 4))
    const sequence = await allocateSequence(this.tables, this.db, `counter_enquiries_${year}`)

    const record = {
      ...draft,
      reference: formatEnquiryReference(year, sequence),
      status: 'new' as const,
      receivedAt,
    }

    const row = await this.tables.createRow({
      databaseId: this.db,
      tableId: COLLECTIONS.enquiries,
      rowId: ID.unique(),
      data: record,
    })

    return toEnquiry(row)
  }

  async update(id: string, next: Enquiry, expectedStatus: Enquiry['status']): Promise<Enquiry> {
    const current = await this.get(id)
    if (!current) throw new StoreConflictError('That enquiry no longer exists.')

    if (current.status !== expectedStatus) {
      throw new StoreConflictError(
        'Somebody else changed this enquiry while you were looking at it. Reload and try again.'
      )
    }

    const { id: _id, ...data } = next
    const row = await this.tables.updateRow({
      databaseId: this.db,
      tableId: COLLECTIONS.enquiries,
      rowId: id,
      data,
    })

    return toEnquiry(row)
  }

  async remove(id: string): Promise<void> {
    await this.tables.deleteRow({
      databaseId: this.db,
      tableId: COLLECTIONS.enquiries,
      rowId: id,
    })
  }
}

export function buildEnquiryStore(): EnquiryStore {
  return hasAppwriteCredentials ? new AppwriteEnquiryStore() : new InMemoryEnquiryStore()
}
