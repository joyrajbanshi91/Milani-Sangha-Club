/**
 * Read a backup file back into Appwrite.
 *
 *   npm run restore -- --file backups/2026-08-04T09-00-00-000Z.json        # checks only
 *   npm run restore -- --file backups/2026-08-04T09-00-00-000Z.json --write
 *
 * This exists because an untested backup is a guess. Run it in check mode against
 * every backup you take: it validates the file, reports what it would write, and
 * warns about anything that would not survive the round trip. That takes seconds
 * and is the difference between having a backup and hoping.
 *
 * **Rows are upserted by their original id**, so a restore is idempotent and can be
 * re-run after a partial failure. Nothing is deleted: this repairs and reinstates,
 * it does not mirror. A row created since the backup stays. If you need an exact
 * copy of that moment, restore into a fresh database (`--database`) rather than
 * asking this to delete a club's financial records.
 *
 * ## What cannot be restored
 *
 *   • **Passwords**, unless the backup was taken with `--include-credentials`.
 *     Without them accounts are recreated with an unusable random password and each
 *     member uses "Reset password" once.
 *   • **Reference-number counters** are restored with everything else, because they
 *     live in the settings table. Restoring the ledger without them would make the
 *     next entry reuse a reference — which is why they are backed up at all.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { AppwriteException, type Models } from 'node-appwrite'

import { getTables, getUsers } from '../src/config/appwrite.js'
import { TABLES } from '../src/config/appwriteSchema.js'
import { env, hasAppwriteCredentials } from '../src/config/env.js'

interface BackupFile {
  formatVersion: number
  takenAt: string
  projectId: string
  databaseId: string
  includesCredentials: boolean
  counts: Record<string, number>
  tables: Record<string, Models.Row[]>
  users: Array<Record<string, unknown>>
}

const write = process.argv.includes('--write')

function log(message: string): void {
  process.stdout.write(`${message}\n`)
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function fail(message: string): never {
  process.stderr.write(`\nerror: ${message}\n\n`)
  process.exit(1)
}

/**
 * Validate the file before touching anything.
 *
 * A restore is run on the worst day the club has had with this system. Discovering
 * halfway through that the file is truncated, or is from a different project, is
 * not the moment for it.
 */
function parseBackup(path: string): BackupFile {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    fail(`Cannot read ${path}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    fail(`${path} is not valid JSON — it may be truncated. ${(error as Error).message}`)
  }

  const file = parsed as BackupFile

  if (file.formatVersion !== 1) {
    fail(`Unsupported backup formatVersion ${String(file.formatVersion)}; this script writes 1.`)
  }
  if (!file.tables || typeof file.tables !== 'object') {
    fail('That file has no "tables" section, so it is not a backup of this application.')
  }

  // The recorded counts are a checksum: they were written from the same read that
  // produced the rows, so a mismatch means the file was altered or truncated.
  for (const [name, expected] of Object.entries(file.counts ?? {})) {
    const actual = name === 'users' ? (file.users?.length ?? 0) : (file.tables[name]?.length ?? 0)
    if (actual !== expected) {
      fail(`${name}: the file says ${expected} records but contains ${actual}. Do not trust it.`)
    }
  }

  return file
}

/** `$`-prefixed keys are Appwrite's own; only the columns are written back. */
function columnsOf(row: Models.Row): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key, value]) => !key.startsWith('$') && value !== null)
  )
}

async function main(): Promise<number> {
  const path = option('file')
  if (!path) fail('--file is required. Point it at a file written by `npm run backup`.')

  const file = parseBackup(path)

  log(`backup taken   ${file.takenAt}`)
  log(`from project   ${file.projectId}`)
  log(`from database  ${file.databaseId}`)
  log(`passwords      ${file.includesCredentials ? 'included' : 'NOT included'}`)
  log('')

  if (!hasAppwriteCredentials) {
    log('Appwrite is not configured, so this can only validate the file.')
    log('The file is valid and its record counts agree with its contents.')
    log('Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env to restore it.')
    return 0
  }

  const databaseId = option('database') ?? env.APPWRITE_DATABASE_ID
  const target = env.APPWRITE_PROJECT_ID as string

  if (file.projectId !== target) {
    log(`NOTE: this backup came from project ${file.projectId}, and you are restoring`)
    log(`      into ${target}. That is fine for a rebuild, but check it is intended.`)
    log('')
  }

  const known = new Set(TABLES.map((table) => table.id))
  for (const name of Object.keys(file.tables)) {
    if (!known.has(name)) {
      log(`NOTE: the file has a table "${name}" that the current schema does not.`)
      log('      It will be skipped. Provision it first if you need it back.')
    }
  }

  if (!write) {
    log('Check only — nothing will be written. Add --write to restore.\n')
    for (const table of TABLES) {
      const rows = file.tables[table.id] ?? []
      log(`  ${table.id.padEnd(24)} would upsert ${rows.length}`)
    }
    log(`  ${'users'.padEnd(24)} would create ${file.users?.length ?? 0}`)
    log('')
    log('Nothing is ever deleted by a restore. Rows created since the backup stay.')
    return 0
  }

  const tables = getTables()
  let written = 0

  for (const table of TABLES) {
    const rows = file.tables[table.id] ?? []
    if (rows.length === 0) {
      log(`  ${table.id.padEnd(24)} nothing to do`)
      continue
    }

    for (const row of rows) {
      // Upsert by the original id: idempotent, so a run interrupted halfway can
      // simply be repeated.
      await tables.upsertRow({
        databaseId,
        tableId: table.id,
        rowId: row.$id,
        data: columnsOf(row),
      })
      written += 1
    }

    log(`  ${table.id.padEnd(24)} ${rows.length} restored`)
  }

  const users = getUsers()
  let created = 0
  let skipped = 0

  for (const account of file.users ?? []) {
    const id = account.$id as string
    const email = (account.email as string) || undefined
    const labels = (account.labels as string[] | undefined) ?? []

    try {
      await users.create({
        userId: id,
        email,
        name: (account.name as string) || email,
        // Unusable by design when the backup carries no hash: the member resets it.
        // Not a weak placeholder — an attacker must not be able to guess it either.
        password: (account.password as string | undefined) ?? randomBytes(24).toString('base64url'),
      })
      created += 1
    } catch (error) {
      if (
        error instanceof AppwriteException &&
        (error.code === 409 || error.type === 'user_already_exists')
      ) {
        skipped += 1
      } else {
        throw error
      }
    }

    // Labels are set whether the account was created now or already existed: the
    // roles are the part a restore most needs to get right.
    if (labels.length > 0) {
      await users.updateLabels({ userId: id, labels })
    }
  }

  log('')
  log(`${written} rows restored`)
  log(`${created} accounts created, ${skipped} already existed (labels reapplied to both)`)

  if (!file.includesCredentials && created > 0) {
    log('')
    log('Those accounts have no usable password, because the backup carried none.')
    log('Tell members to use "Reset password" on the sign-in page.')
  }

  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`\nRestore failed: ${message}\n`)
    if (error instanceof AppwriteException) {
      process.stderr.write(`Appwrite responded ${error.code} ${error.type}\n`)
    }
    process.stderr.write('Re-running is safe: rows are upserted by id.\n')
    process.exit(1)
  })
