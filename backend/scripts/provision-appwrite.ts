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

import { TABLES, type Index } from '../src/config/appwriteSchema.js'
import { env, hasAppwriteCredentials } from '../src/config/env.js'

/**
 * The schema itself lives in src/config/appwriteSchema.ts, shared with the backup
 * and restore scripts so a table added here cannot go unbacked-up. Its index types
 * and orders are plain strings, so that module imports nothing; they are mapped to
 * the SDK's enums here, where the SDK is already a dependency.
 */
const INDEX_TYPE = {
  key: TablesDBIndexType.Key,
  unique: TablesDBIndexType.Unique,
  fulltext: TablesDBIndexType.Fulltext,
  spatial: TablesDBIndexType.Spatial,
} as const

const ORDER = { asc: OrderBy.Asc, desc: OrderBy.Desc } as const

const indexOrders = (index: Index): OrderBy[] | undefined =>
  index.orders?.map((order) => ORDER[order])

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
            type: INDEX_TYPE[index.type],
            columns: index.columns,
            orders: indexOrders(index),
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
