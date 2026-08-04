/**
 * Export everything in the Appwrite project to a single JSON file.
 *
 *   npm run backup                         # writes backups/<timestamp>.json
 *   npm run backup -- --out /path/to/dir
 *   npm run backup -- --include-credentials
 *
 * Appwrite Cloud's own backups are a paid feature — the free plan has none — so
 * this is the club's backup. It uses only the ordinary Databases and Users APIs,
 * so it costs nothing and works on any plan.
 *
 * **Every row of every table, and every account.** Cursor pagination, not offset:
 * a high offset makes the database scan and discard rows, and — worse for a backup
 * — an offset walk over data that changes underneath it can skip records silently.
 * A backup that quietly omits things is worse than no backup, because it is
 * trusted.
 *
 * ## Passwords
 *
 * Appwrite *can* return password hashes, and they are **left out by default**. With
 * them the file becomes a credential store: anyone who obtains it can attack the
 * hashes offline at their leisure. Without them, a restore means members set a new
 * password once — a small inconvenience against a standing risk, for a club whose
 * repository is public and whose officers will keep these files in ordinary places.
 *
 * `--include-credentials` overrides that. If you use it, treat the file exactly as
 * you would the club's cash box.
 *
 * ## Where to keep it
 *
 * Off Appwrite, or it is not a backup — a copy inside the thing that failed is no
 * help. `backups/` is git-ignored: never commit one, the repository is public.
 * Google Drive is the club's own storage and is a reasonable home.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { AppwriteException, Query, type Models, type TablesDB, type Users } from 'node-appwrite'

import { getTables, getUsers } from '../src/config/appwrite.js'
import { TABLES } from '../src/config/appwriteSchema.js'
import { env, hasAppwriteCredentials } from '../src/config/env.js'

/** Appwrite's documented ceiling is 5000; 500 keeps each response small. */
const PAGE = 500

interface BackupFile {
  /** Bumped when the shape of this file changes, so a restore can refuse a stranger. */
  formatVersion: 1
  takenAt: string
  endpoint: string
  projectId: string
  databaseId: string
  includesCredentials: boolean
  counts: Record<string, number>
  tables: Record<string, Models.Row[]>
  users: Array<Record<string, unknown>>
}

function log(message: string): void {
  process.stdout.write(`${message}\n`)
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

/**
 * Read a whole table, following the cursor until it runs dry.
 *
 * The last row's id becomes the next request's cursor. Ordered by `$id` so the walk
 * is over a stable, unique key — ordering by a column with ties could revisit or
 * skip rows between pages.
 */
async function readTable(tables: TablesDB, tableId: string): Promise<Models.Row[]> {
  const all: Models.Row[] = []
  let cursor: string | undefined

  for (;;) {
    const queries = [Query.orderAsc('$id'), Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))

    const { rows } = await tables.listRows({
      databaseId: env.APPWRITE_DATABASE_ID,
      tableId,
      queries,
    })

    all.push(...rows)
    if (rows.length < PAGE) return all

    const last = rows[rows.length - 1]
    if (!last) return all
    cursor = last.$id
  }
}

/**
 * Accounts, with the role labels that decide what each may do.
 *
 * Worth backing up separately from the tables: a restored ledger whose officers no
 * longer have their roles would leave nobody able to approve anything.
 */
async function readUsers(
  users: Users,
  includeCredentials: boolean
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = []
  let cursor: string | undefined

  for (;;) {
    const queries = [Query.limit(PAGE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))

    const { users: page } = await users.list({ queries })

    for (const user of page) {
      const record: Record<string, unknown> = {
        $id: user.$id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        labels: user.labels,
        status: user.status,
        emailVerification: user.emailVerification,
        registration: user.registration,
        prefs: user.prefs,
      }

      if (includeCredentials) {
        record.password = user.password
        record.hash = user.hash
        record.hashOptions = user.hashOptions
      }

      all.push(record)
    }

    if (page.length < PAGE) return all

    const last = page[page.length - 1]
    if (!last) return all
    cursor = last.$id
  }
}

async function main(): Promise<number> {
  if (!hasAppwriteCredentials) {
    log('Appwrite is not configured, so there is nothing to back up.')
    log('Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env.')
    log('The key needs the Databases and Users scopes. See docs/10-appwrite.md.')
    return 1
  }

  const includeCredentials = flag('include-credentials')
  const outDir = resolve(option('out') ?? join(import.meta.dirname, '..', '..', 'backups'))

  const tables = getTables()
  const users = getUsers()

  log(`project  ${env.APPWRITE_PROJECT_ID as string}`)
  log(`database ${env.APPWRITE_DATABASE_ID}`)
  log('')

  const contents: Record<string, Models.Row[]> = {}
  const counts: Record<string, number> = {}

  for (const table of TABLES) {
    const rows = await readTable(tables, table.id)
    contents[table.id] = rows
    counts[table.id] = rows.length
    log(`  ${table.id.padEnd(24)} ${rows.length} row${rows.length === 1 ? '' : 's'}`)
  }

  const accounts = await readUsers(users, includeCredentials)
  counts.users = accounts.length
  log(`  ${'users'.padEnd(24)} ${accounts.length} account${accounts.length === 1 ? '' : 's'}`)

  // Colons are legal in a filename but awkward in shells and on Windows.
  const takenAt = new Date().toISOString()
  const stamp = takenAt.replace(/[:.]/g, '-')

  const file: BackupFile = {
    formatVersion: 1,
    takenAt,
    endpoint: env.APPWRITE_ENDPOINT,
    projectId: env.APPWRITE_PROJECT_ID as string,
    databaseId: env.APPWRITE_DATABASE_ID,
    includesCredentials: includeCredentials,
    counts,
    tables: contents,
    users: accounts,
  }

  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, `${stamp}.json`)
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  log('')
  log(`wrote ${path}`)
  log(`${total} record${total === 1 ? '' : 's'} in total`)

  if (includeCredentials) {
    log('')
    log('This file CONTAINS PASSWORD HASHES. Treat it as you would the cash box:')
    log('never commit it, never email it, and delete old copies you do not need.')
  }

  log('')
  log('Copy it somewhere off Appwrite — a backup inside the thing that failed is')
  log('no backup. Then check it: npm run restore -- --file <path>')

  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`\nBackup failed: ${message}\n`)
    if (error instanceof AppwriteException) {
      process.stderr.write(`Appwrite responded ${error.code} ${error.type}\n`)
      if (error.code === 401) {
        process.stderr.write('The API key needs the Databases and Users read scopes.\n')
      }
    }
    // Non-zero matters: a scheduled backup must be able to tell it failed.
    process.exit(1)
  })
