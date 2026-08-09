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
import { AppwriteException, Client, OrderBy, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'

import { TABLES, type Column, type Index } from '../src/config/appwriteSchema.js'
import { appwriteProjectId, env, hasAppwriteCredentials } from '../src/config/env.js'

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

/** "You have reached the limit for this plan" rather than "you did it wrong". */
function isPlanLimit(error: unknown): boolean {
  return (
    error instanceof AppwriteException &&
    (error.type === 'additional_resource_not_allowed' || error.code === 403)
  )
}

/** How long to wait for a table's columns to finish being created. */
const COLUMN_WAIT_SECONDS = 180

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Every column on a table, not the first page of them.
 *
 * `listColumns` returns **25** unless told otherwise, and this schema has a table with
 * 27. Without the paging below, the script reads a table it has just finished building
 * and concludes two of its columns are missing — then tries to create them, is told
 * `column_already_exists`, treats that as a busy table, retries, and finally fails
 * naming two columns that were there all along. Every symptom pointed at Appwrite
 * being slow; the cause was a default page size.
 *
 * Paged rather than raised to a large limit, because a schema outgrowing whatever
 * number were written here would fail in exactly this way again, and the next person
 * would have the same afternoon.
 */
async function listAllColumns(
  tables: TablesDB,
  databaseId: string,
  tableId: string
): Promise<Array<{ key: string; status?: string }>> {
  const all: Array<{ key: string; status?: string }> = []

  for (;;) {
    const page = await tables.listColumns({
      databaseId,
      tableId,
      queries: [Query.limit(100), Query.offset(all.length)],
    })

    all.push(...(page.columns as unknown as Array<{ key: string; status?: string }>))

    if (page.columns.length === 0 || all.length >= page.total) return all
  }
}

async function createColumn(
  tables: TablesDB,
  databaseId: string,
  tableId: string,
  column: Column
): Promise<void> {
  if (column.kind === 'string') {
    await tables.createStringColumn({
      databaseId,
      tableId,
      key: column.key,
      size: column.size,
      required: column.required,
    })
  } else if (column.kind === 'integer') {
    await tables.createIntegerColumn({
      databaseId,
      tableId,
      key: column.key,
      required: column.required,
      min: column.min,
    })
  } else {
    await tables.createBooleanColumn({
      databaseId,
      tableId,
      key: column.key,
      required: column.required,
    })
  }
}

/**
 * Every column this schema declares, actually on the table.
 *
 * **The list is the check, not the response to the create call.** A 409 from Appwrite
 * says a column with that key exists; it does not say the column this schema wants
 * exists, and the script that only ever read the error was one that could report
 * `= (exists)` for something it had never seen. Reading the table settles it.
 *
 * Each pass asks the table what it has, creates only what is missing, and looks again —
 * so a table momentarily too busy to take a column recovers by itself, and a run cannot
 * end believing something exists when it does not. That is the failure worth engineering
 * against: a missing column does not announce itself later, it quietly stops storing a
 * field, and the first sign is a receipt with nobody's name on it.
 *
 * `listAllColumns` rather than `listColumns`, and see the note there — reading only the
 * first page of a table's columns is precisely how a healthy run was made to fail.
 */
async function ensureColumns(
  tables: TablesDB,
  databaseId: string,
  table: { id: string; columns: readonly Column[] }
): Promise<void> {
  for (let pass = 0; pass < 6; pass += 1) {
    const columns = await listAllColumns(tables, databaseId, table.id)
    const live = new Set(columns.map((column) => column.key))

    const missing = table.columns.filter((column) => !live.has(column.key))

    if (pass === 0) {
      for (const column of table.columns) {
        if (live.has(column.key)) log(`  = ${column.key} (exists)`)
      }
    }

    if (missing.length === 0) return
    if (pass > 0) log(`  … retrying ${missing.length} column(s) the table was too busy to take`)

    for (const column of missing) {
      try {
        await createColumn(tables, databaseId, table.id, column)
        log(`  + ${column.key}`)
      } catch (error) {
        if (isPlanLimit(error)) throw error
        // Either it appeared between the listing and now, or the table is busy. The
        // next pass reads the table again and settles which — no guessing from here.
        if (!alreadyExists(error)) throw error
      }
    }

    await sleep(2_000)
  }

  const columns = await listAllColumns(tables, databaseId, table.id)
  const live = new Set(columns.map((column) => column.key))
  const missing = table.columns.filter((column) => !live.has(column.key)).map((c) => c.key)

  if (missing.length > 0) {
    throw new Error(
      `Could not create ${missing.join(', ')} on ${table.id} — Appwrite refused each attempt ` +
        'as a conflict. The table may still be settling from an earlier change: wait a minute ' +
        'and re-run. Nothing is half-written.'
    )
  }
}

/**
 * Appwrite creates columns asynchronously: the call returns while the column is
 * still `processing`, and an index built on one that is not yet `available`
 * fails. Waiting here is the difference between a script that works and one that
 * works only when the network is slow enough.
 *
 * **Waits on the columns this schema names, by key**, rather than on a count of
 * available columns. Counting was wrong in a way that only shows up on a table which
 * has more columns than the schema lists — a leftover from an earlier version, say:
 * the total could reach the expected number while the column an index needs was still
 * processing, and the index creation that follows would fail for no visible reason.
 *
 * Three minutes, not thirty seconds. Adding columns to a table that already holds rows
 * is slower than creating an empty one, and thirty seconds was tuned on a fresh
 * database — so the first person to extend a live club's schema hit a timeout on a
 * perfectly healthy run.
 */
async function waitForColumns(
  tables: TablesDB,
  tableId: string,
  keys: readonly string[]
): Promise<void> {
  const wanted = new Set(keys)

  for (let attempt = 0; attempt < COLUMN_WAIT_SECONDS; attempt += 1) {
    const columns = await listAllColumns(tables, env.APPWRITE_DATABASE_ID, tableId)
    const status = new Map(columns.map((column) => [column.key, column.status ?? 'unknown']))

    const pending = [...wanted].filter((key) => status.get(key) !== 'available')
    if (pending.length === 0) return

    /**
     * A failed column never becomes available, so waiting out the full three minutes
     * and then advising a re-run would send somebody round the same loop. Appwrite
     * puts the reason on the column itself; the console is where it is readable.
     */
    const failed = pending.filter((key) => status.get(key) === 'failed')
    if (failed.length > 0) {
      throw new Error(
        `Appwrite could not create ${failed.join(', ')} on ${tableId}. Re-running will not fix ` +
          'this. Open the table in the Appwrite console — the failed column carries the reason — ' +
          'then delete it there and re-run.'
      )
    }

    // Said once, after a few seconds, so a slow run does not look like a hung one.
    if (attempt === 5) {
      log(`  … waiting for ${pending.length} column(s) on ${tableId} to finish`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(
    `Columns on ${tableId} were still processing after ${COLUMN_WAIT_SECONDS}s. ` +
      'Nothing is broken and nothing was half-written — re-run to continue where this left off.'
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
  log(`Project   ${appwriteProjectId as string}`)
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
    .setProject(appwriteProjectId as string)
    .setKey(env.APPWRITE_API_KEY as string)

  const tables = new TablesDB(client)

  // Ask what exists before trying to create anything.
  //
  // Relying on the error was wrong: when the database already exists, Appwrite
  // checks the plan quota *before* checking existence, so it answers 403 "upgrade
  // to increase the limit" rather than 409 "already exists". Reading that as a
  // quota problem sent the reader to change a setting that was already correct.
  // The order of those checks is Appwrite's to change; this is not.
  const { databases: existingDatabases } = await tables.list({})
  const databaseExists = existingDatabases.some((database) => database.$id === databaseId)

  if (databaseExists) {
    log(`using existing database ${databaseId}`)
  } else {
    try {
      await tables.create({ databaseId, name: 'Milani Sangha Club' })
      log(`created database ${databaseId}`)
    } catch (error) {
      if (alreadyExists(error)) {
        log(`database ${databaseId} already exists`)
      } else if (isPlanLimit(error)) {
        // The free plan allows one database per project, and a new project is
        // created with one already. Appwrite's own message ("upgrade to increase
        // the limit") points at a payment rather than at the fix, which is to use
        // the database that exists. Its *name* is irrelevant here; the tables
        // inside it are what this script cares about.
        const existing = existingDatabases.map((database) => database.$id)

        process.stderr.write(
          `\nCannot create the database "${databaseId}": this plan allows no more.\n\n` +
            (existing.length > 0
              ? `The project already has ${existing.length === 1 ? 'one' : String(existing.length)}:\n` +
                existingDatabases.map((d) => `  ${d.$id}   (named "${d.name}")\n`).join('') +
                '\nUse it instead of creating another — set the **ID**, not the name,\n' +
                'in backend/.env:\n\n' +
                `  APPWRITE_DATABASE_ID=${existing[0] as string}\n\n` +
                'then run this again. Nothing in it is touched except the tables this\n' +
                'application needs, and only ones that are missing are created.\n\n'
              : 'The project has none, which means the limit is being reported for\n' +
                'another reason. Check the plan and quotas in the Appwrite console.\n\n')
        )
        process.exit(1)
      } else {
        throw error
      }
    }
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

    await ensureColumns(tables, databaseId, table)

    if (table.indexes.length > 0) {
      await waitForColumns(
        tables,
        table.id,
        // Only the columns the indexes below are built on need to be available, but
        // waiting on all of them is simpler and costs nothing: they were created in
        // the same pass and finish at much the same time.
        table.columns.map((column) => column.key)
      )

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

  /**
   * Deliberately does not suggest `seed:finance --dir ../data/demo`.
   *
   * It used to, and against a club's real project that is the wrong instruction: the
   * demo ledger carries invented opening balances and invented transactions, and once
   * they are posted every balance the treasurer sees is wrong in a way no screen
   * explains. The club's own figures come from `data/club/*.csv`, which is why the
   * next step is to check what is already there.
   */
  log('\nDone. Next: npm run appwrite:check')
  log('Then load the club’s own funds and categories from data/club/*.csv —')
  log('see docs/11-running-the-club-office.md §3. Do NOT seed data/demo into a')
  log('real project: its opening balances are invented.')
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
