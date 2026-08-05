import { COLLECTIONS } from './constants.js'

/**
 * The Appwrite schema, in one place.
 *
 * Shared by three scripts that must agree about it: `provision-appwrite.ts`
 * creates it, `backup-appwrite.ts` exports every table in it, and
 * `restore-appwrite.ts` puts them back. Kept here rather than inside the
 * provisioning script because importing that would *run* it, and because a table
 * added to provisioning but missing from the backup would silently go unprotected
 * — the sort of gap only noticed when a restore is already needed.
 *
 * Mirrors `domain/types.ts`. Optional domain fields are `required: false`: Appwrite
 * returns null for an unset column and `appwriteStore.ts` maps null back to absent,
 * so the domain types stay as they are.
 */

/** Widest string column the ledger uses. Appwrite requires an explicit size. */
export const TEXT_SIZE = {
  id: 64,
  short: 128,
  medium: 512,
  json: 16384,
} as const

export type Column =
  | { kind: 'string'; key: string; size: number; required: boolean }
  | { kind: 'integer'; key: string; required: boolean; min?: number }
  | { kind: 'boolean'; key: string; required: boolean }

export interface Index {
  key: string
  /** Matches TablesDBIndexType; kept as a string so this module imports nothing. */
  type: 'key' | 'unique' | 'fulltext' | 'spatial'
  columns: string[]
  orders?: Array<'asc' | 'desc'>
}

export interface Table {
  id: string
  name: string
  columns: Column[]
  indexes: Index[]
}

const str = (key: string, size: number, required = false): Column => ({
  kind: 'string',
  key,
  size,
  required,
})
const int = (key: string, required = false, min?: number): Column => ({
  kind: 'integer',
  key,
  required,
  min,
})
const bool = (key: string, required = false): Column => ({ kind: 'boolean', key, required })

export const TABLES: Table[] = [
  {
    id: COLLECTIONS.funds,
    name: 'Funds',
    columns: [
      str('name', TEXT_SIZE.short, true),
      str('kind', 32, true),
      int('openingBalancePaise', true),
      str('openingDate', 10, true),
      bool('active', true),
      str('notes', TEXT_SIZE.medium),
    ],
    indexes: [{ key: 'by_name', type: 'key', columns: ['name'] }],
  },
  {
    id: COLLECTIONS.financeCategories,
    name: 'Finance categories',
    columns: [
      str('name', TEXT_SIZE.short, true),
      str('kind', 32, true),
      bool('active', true),
      str('notes', TEXT_SIZE.medium),
    ],
    indexes: [{ key: 'by_name', type: 'key', columns: ['name'] }],
  },
  {
    id: COLLECTIONS.financeTransactions,
    name: 'Finance transactions',
    columns: [
      str('reference', 32, true),
      str('kind', 32, true),
      str('status', 32, true),
      str('date', 10, true),
      int('amountPaise', true),
      str('fundId', TEXT_SIZE.id, true),
      str('toFundId', TEXT_SIZE.id),
      str('categoryId', TEXT_SIZE.id),
      str('source', TEXT_SIZE.medium, true),
      str('description', TEXT_SIZE.medium, true),
      str('externalReference', TEXT_SIZE.short),
      str('createdBy', TEXT_SIZE.id, true),
      str('createdByName', TEXT_SIZE.short, true),
      str('createdAt', 32, true),
      // Signature list, serialised. See the note in appwriteStore.ts.
      str('approvalsJson', TEXT_SIZE.json),
      str('postedAt', 32),
      str('rejectedAt', 32),
      str('rejectedBy', TEXT_SIZE.id),
      str('rejectionReason', TEXT_SIZE.medium),
      str('reverses', TEXT_SIZE.id),
      str('reversedBy', TEXT_SIZE.id),
      str('importBatchId', TEXT_SIZE.id),
    ],
    indexes: [
      // A reference number must be unique even if the counter is ever restored
      // from a backup: the database, not the allocator, is the last line here.
      { key: 'unique_reference', type: 'unique', columns: ['reference'] },
      // The three compound indexes carried over from firestore.indexes.json.
      { key: 'by_status_date', type: 'key', columns: ['status', 'date'], orders: ['asc', 'desc'] },
      { key: 'by_fund_date', type: 'key', columns: ['fundId', 'date'], orders: ['asc', 'desc'] },
      { key: 'by_batch_status', type: 'key', columns: ['importBatchId', 'status'] },
      // The officer area's default view is the whole ledger, newest first.
      { key: 'by_date', type: 'key', columns: ['date'], orders: ['desc'] },
    ],
  },
  {
    id: COLLECTIONS.auditLogs,
    name: 'Audit log',
    columns: [
      str('action', TEXT_SIZE.short, true),
      str('actorUid', TEXT_SIZE.id, true),
      str('actorName', TEXT_SIZE.short, true),
      str('actorRole', 32),
      str('targetId', TEXT_SIZE.id),
      str('details', TEXT_SIZE.json),
      str('at', 32, true),
    ],
    indexes: [{ key: 'by_at', type: 'key', columns: ['at'], orders: ['desc'] }],
  },
  {
    id: COLLECTIONS.settings,
    name: 'Settings and counters',
    columns: [str('key', TEXT_SIZE.short, true), int('value', false, 0)],
    indexes: [],
  },
  {
    id: COLLECTIONS.payments,
    name: 'Member payment declarations',
    columns: [
      str('reference', 32, true),
      str('status', 32, true),
      str('memberUid', TEXT_SIZE.id, true),
      str('memberName', TEXT_SIZE.short, true),
      str('purpose', 32, true),
      str('method', 32, true),
      int('amountPaise', true),
      str('paidOn', 10, true),
      // 'YYYY-MM'. Membership only; a donation buys no months.
      str('periodStart', 7),
      str('periodEnd', 7),
      str('receiptNumber', 32),
      str('externalReference', TEXT_SIZE.short),
      str('handedTo', TEXT_SIZE.short),
      str('note', TEXT_SIZE.medium),
      str('submittedAt', 32, true),
      str('reviewedAt', 32),
      str('reviewedBy', TEXT_SIZE.id),
      str('reviewedByName', TEXT_SIZE.short),
      str('declineReason', TEXT_SIZE.medium),
      str('transactionId', TEXT_SIZE.id),
      str('transactionReference', 32),
      str('withdrawnAt', 32),
    ],
    indexes: [
      { key: 'unique_reference', type: 'unique', columns: ['reference'] },
      // A member reads only their own declarations, so this is the index that
      // every request from the portal uses.
      { key: 'by_member', type: 'key', columns: ['memberUid', 'paidOn'], orders: ['asc', 'desc'] },
      // The treasurer's queue: what is still awaiting verification, oldest first,
      // because the member who has waited longest should be dealt with first.
      {
        key: 'by_status_submitted',
        type: 'key',
        columns: ['status', 'submittedAt'],
        orders: ['asc', 'asc'],
      },
    ],
  },
  {
    id: COLLECTIONS.members,
    name: 'Member profiles',
    columns: [
      str('uid', TEXT_SIZE.id, true),
      str('name', TEXT_SIZE.short, true),
      // A 512px avatar as a data URL. See profileStore.ts for why not Storage.
      str('photo', 1_000_000),
      str('photoUpdatedAt', 32),
    ],
    indexes: [{ key: 'unique_uid', type: 'unique', columns: ['uid'] }],
  },
]
