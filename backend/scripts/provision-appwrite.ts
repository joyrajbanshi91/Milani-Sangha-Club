/**
 * Create the club's Appwrite database, tables, columns and indexes.
 *
 *   npm run provision:appwrite            # check only — prints what it would do
 *   npm run provision:appwrite -- --write
 *
 * This replaces `firebase/firestore.rules` and `firestore.indexes.json` together,
 * because in Appwrite the schema *is* the contract: columns are declared, and
 * access is decided per table rather than by a rules language.
 *
 * **Every table is created with no permissions at all.** That is deliberate and is
 * the security posture, not an omission: the browser never gets a database handle,
 * so nothing signed in — member or treasurer — can read or write the ledger
 * directly. Every access goes through the API, which holds the server API key and
 * enforces the rules that a permission system cannot express: two-person approval,
 * gapless reference numbers, the audit trail. A single weaker path to the same data
 * would defeat all three.
 *
 * Safe to re-run. Anything that already exists is left alone, so adding a column
 * to the schema below and running it again adds just that column.
 */
import { AppwriteException, Client, OrderBy, TablesDB, TablesDBIndexType } from 'node-appwrite'

import { COLLECTIONS } from '../src/config/constants.js'
import { env, hasAppwriteCredentials } from '../src/config/env.js'
import { TEXT_SIZE } from '../src/services/appwriteStore.js'

type Column =
  | { kind: 'string'; key: string; size: number; required: boolean }
  | { kind: 'integer'; key: string; required: boolean; min?: number }
  | { kind: 'boolean'; key: string; required: boolean }

interface Index {
  key: string
  type: TablesDBIndexType
  columns: string[]
  orders?: OrderBy[]
}

interface Table {
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

/**
 * The schema, mirroring `domain/types.ts`.
 *
 * Optional domain fields are `required: false` here. Appwrite returns null for an
 * unset column and `appwriteStore.ts` maps null back to absent, so the domain
 * types stay as they are.
 */
const TABLES: Table[] = [
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
    indexes: [{ key: 'by_name', type: TablesDBIndexType.Key, columns: ['name'] }],
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
    indexes: [{ key: 'by_name', type: TablesDBIndexType.Key, columns: ['name'] }],
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
      { key: 'unique_reference', type: TablesDBIndexType.Unique, columns: ['reference'] },
      // The three compound indexes carried over from firestore.indexes.json.
      {
        key: 'by_status_date',
        type: TablesDBIndexType.Key,
        columns: ['status', 'date'],
        orders: [OrderBy.Asc, OrderBy.Desc],
      },
      {
        key: 'by_fund_date',
        type: TablesDBIndexType.Key,
        columns: ['fundId', 'date'],
        orders: [OrderBy.Asc, OrderBy.Desc],
      },
      {
        key: 'by_batch_status',
        type: TablesDBIndexType.Key,
        columns: ['importBatchId', 'status'],
      },
      // The officer area's default view is the whole ledger, newest first.
      { key: 'by_date', type: TablesDBIndexType.Key, columns: ['date'], orders: [OrderBy.Desc] },
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
    indexes: [
      { key: 'by_at', type: TablesDBIndexType.Key, columns: ['at'], orders: [OrderBy.Desc] },
    ],
  },
  {
    id: COLLECTIONS.settings,
    name: 'Settings and counters',
    columns: [str('key', TEXT_SIZE.short, true), int('value', false, 0)],
    indexes: [],
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
    indexes: [{ key: 'unique_uid', type: TablesDBIndexType.Unique, columns: ['uid'] }],
  },
]

const write = process.argv.includes('--write')

function log(message: string): void {
  process.stdout.write(`${message}\n`)
}

function alreadyExists(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 409
}

/**
 * Appwrite creates columns asynchronously: the call returns while the column is
 * still `processing`, and an index built on one that is not yet `available`
 * fails. Waiting here is the difference between a script that works and one that
 * works only when the network is slow enough.
 */
async function waitForColumns(tables: TablesDB, tableId: string, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { columns } = await tables.listColumns({ databaseId: env.APPWRITE_DATABASE_ID, tableId })

    const ready = columns.filter(
      (column) => (column as unknown as { status?: string }).status === 'available'
    ).length

    if (ready >= expected) return

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(
    `Columns on ${tableId} were still processing after 30s. Re-run to continue where this left off.`
  )
}

async function main(): Promise<number> {
  if (!hasAppwriteCredentials) {
    log('Appwrite is not configured.')
    log('Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env, then re-run.')
    log('See docs/10-appwrite.md.')
    return 1
  }

  const databaseId = env.APPWRITE_DATABASE_ID

  log(`Endpoint  ${env.APPWRITE_ENDPOINT}`)
  log(`Project   ${env.APPWRITE_PROJECT_ID as string}`)
  log(`Database  ${databaseId}`)
  log('')

  if (!write) {
    log('Check only — nothing will be created. Add --write to apply.\n')
    for (const table of TABLES) {
      const columns = `${table.columns.length} column${table.columns.length === 1 ? '' : 's'}`
      const indexes = `${table.indexes.length} index${table.indexes.length === 1 ? '' : 'es'}`
      log(`  ${table.id.padEnd(24)} ${columns}, ${indexes}`)
    }
    log('')
    log('Every table is created with no permissions: the ledger is reachable only')
    log('through the API, which holds the server key. See the header of this script.')
    return 0
  }

  const client = new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID as string)
    .setKey(env.APPWRITE_API_KEY as string)

  const tables = new TablesDB(client)

  try {
    await tables.create({ databaseId, name: 'Milani Sangha Club' })
    log(`created database ${databaseId}`)
  } catch (error) {
    if (!alreadyExists(error)) throw error
    log(`database ${databaseId} already exists`)
  }

  for (const table of TABLES) {
    try {
      await tables.createTable({
        databaseId,
        tableId: table.id,
        name: table.name,
        // No permissions, and no row-level security to override them. This is the
        // control that keeps the browser out of the ledger.
        permissions: [],
        rowSecurity: false,
      })
      log(`\ncreated table ${table.id}`)
    } catch (error) {
      if (!alreadyExists(error)) throw error
      log(`\ntable ${table.id} already exists`)
    }

    for (const column of table.columns) {
      try {
        if (column.kind === 'string') {
          await tables.createStringColumn({
            databaseId,
            tableId: table.id,
            key: column.key,
            size: column.size,
            required: column.required,
          })
        } else if (column.kind === 'integer') {
          await tables.createIntegerColumn({
            databaseId,
            tableId: table.id,
            key: column.key,
            required: column.required,
            min: column.min,
          })
        } else {
          await tables.createBooleanColumn({
            databaseId,
            tableId: table.id,
            key: column.key,
            required: column.required,
          })
        }
        log(`  + ${column.key}`)
      } catch (error) {
        if (!alreadyExists(error)) throw error
        log(`  = ${column.key} (exists)`)
      }
    }

    if (table.indexes.length > 0) {
      await waitForColumns(tables, table.id, table.columns.length)

      for (const index of table.indexes) {
        try {
          await tables.createIndex({
            databaseId,
            tableId: table.id,
            key: index.key,
            type: index.type,
            columns: index.columns,
            orders: index.orders,
          })
          log(`  + index ${index.key}`)
        } catch (error) {
          if (!alreadyExists(error)) throw error
          log(`  = index ${index.key} (exists)`)
        }
      }
    }
  }

  log('\nDone. Next: npm run seed:finance -- --dir ../data/demo --write')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`\nProvisioning failed: ${message}\n`)
    if (error instanceof AppwriteException) {
      process.stderr.write(`Appwrite responded ${error.code} ${error.type}\n`)
    }
    process.exit(1)
  })

export type { Table as ProvisionTable }
