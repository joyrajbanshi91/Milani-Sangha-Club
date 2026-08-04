/**
 * Clear the club's financial entries, leaving the chart of accounts in place.
 *
 *   npm run reset:ledger              # lists what it would delete, changes nothing
 *   npm run reset:ledger -- --write   # deletes it
 *
 * For the one job every club has before it starts for real: throwing away the
 * entries made while learning the system, so the first genuine entry is
 * TXN-2026-000001 and the balances start from the opening figures rather than from
 * somebody's test of ₹1.
 *
 * ## Why this exists at all, when the ledger is append-only
 *
 * It is append-only *through the API*, and that is not a limitation to be worked
 * around — it is the property that makes the accounts trustworthy. A posted entry
 * cannot be deleted by an officer; it is cancelled by a reversal, and both halves
 * stay on the record. Nothing here changes that.
 *
 * Wiping the ledger clean is a different act from correcting an entry. It is not
 * bookkeeping, it belongs to whoever holds the server key, it happens once, and it
 * leaves no accounting record because there is no longer anything to keep a record
 * about. So it lives here, in a script that has to be run deliberately from a
 * machine with the credentials — and not behind any button in the officer area.
 *
 * ## What it removes, and what it does not
 *
 *   removed   every finance transaction, whatever its status
 *             every member payment declaration
 *             the audit log
 *             the reference counters, so numbering restarts at 1
 *
 *   kept      funds and categories — the chart of accounts, not entries
 *             member profiles and every account
 *
 * Payment declarations go with the entries deliberately. A declaration that survived
 * would tell its member "verified, entered as TXN-2026-000002" and point at an entry
 * that no longer exists.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { Query } from 'node-appwrite'

import { databaseId, getTables } from '../src/config/appwrite.js'
import { COLLECTIONS } from '../src/config/constants.js'
import { appwriteProjectId, hasAppwriteCredentials } from '../src/config/env.js'

const write = process.argv.includes('--write')

function log(message = ''): void {
  process.stdout.write(`${message}\n`)
}

/** Every row of a table, paginated by cursor so nothing is silently skipped. */
async function allRows(tableId: string): Promise<Array<Record<string, unknown> & { $id: string }>> {
  const rows: Array<Record<string, unknown> & { $id: string }> = []
  let cursor: string | undefined

  for (;;) {
    const queries = [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])]
    const page = await getTables().listRows({ databaseId: databaseId(), tableId, queries })

    rows.push(...(page.rows as Array<Record<string, unknown> & { $id: string }>))

    if (page.rows.length < 100) return rows
    cursor = page.rows[page.rows.length - 1]?.$id
    if (!cursor) return rows
  }
}

/**
 * When the club last took a backup.
 *
 * Not a hard gate — a club that has never backed up should still be able to clear
 * their practice entries, and refusing would only teach them to bypass this. But the
 * age of the newest backup is the single most useful thing to know before deleting
 * anything, so it is printed where it cannot be missed.
 */
function newestBackup(): { name: string; ageMinutes: number } | null {
  try {
    const directory = join(process.cwd(), '..', 'backups')
    const files = readdirSync(directory).filter((name) => name.endsWith('.json'))
    if (files.length === 0) return null

    const newest = files
      .map((name) => ({ name, at: statSync(join(directory, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at)[0]

    if (!newest) return null
    return { name: newest.name, ageMinutes: Math.round((Date.now() - newest.at) / 60_000) }
  } catch {
    return null
  }
}

async function main(): Promise<number> {
  if (!hasAppwriteCredentials) {
    log('Appwrite is not configured, so there is no ledger to clear.')
    log('Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env.')
    return 1
  }

  log(`project   ${appwriteProjectId ?? '(not set)'}`)
  log(`database  ${databaseId()}`)

  const [transactions, payments, audits, settings] = await Promise.all([
    allRows(COLLECTIONS.financeTransactions),
    allRows(COLLECTIONS.payments),
    allRows(COLLECTIONS.auditLogs),
    allRows(COLLECTIONS.settings),
  ])

  const counters = settings.filter((row) => row.$id.startsWith('counter_'))

  log()
  log(`  ${String(transactions.length).padStart(4)} finance entries`)
  for (const row of transactions) {
    const amount = (Number(row.amountPaise) / 100).toFixed(2)
    log(
      `       ${String(row.reference)}  ${String(row.status).padEnd(9)} ${String(row.date)}  ${amount.padStart(11)}  ${String(row.description).slice(0, 42)}`
    )
  }

  log(`  ${String(payments.length).padStart(4)} member payment declarations`)
  for (const row of payments) {
    const amount = (Number(row.amountPaise) / 100).toFixed(2)
    log(
      `       ${String(row.reference)}  ${String(row.status).padEnd(20)} ${amount.padStart(11)}  ${String(row.memberName)}`
    )
  }

  log(`  ${String(audits.length).padStart(4)} audit log rows`)
  log(`  ${String(counters.length).padStart(4)} reference counters (${counters.map((row) => `${row.$id}=${String(row.value)}`).join(', ') || 'none'})`)

  const total = transactions.length + payments.length + audits.length + counters.length

  if (total === 0) {
    log('\nNothing to clear — the ledger is already empty.\n')
    return 0
  }

  const backup = newestBackup()
  log()
  log(
    backup
      ? `Newest backup  ${backup.name}  (${backup.ageMinutes} minute(s) old)`
      : 'Newest backup  NONE FOUND in backups/'
  )

  if (!write) {
    log()
    log(`Check only — nothing was deleted. ${total} row(s) would go.`)
    log('Funds and categories are kept; they are the chart of accounts, not entries.')
    log()
    if (!backup) {
      log('There is no backup. Take one first, and keep it off Appwrite:')
      log('  npm run backup')
      log()
    }
    log('Then: npm run reset:ledger -- --write')
    log()
    return 0
  }

  log('\nDeleting:')

  let removed = 0
  const failed: string[] = []

  const drop = async (tableId: string, rowId: string, label: string): Promise<void> => {
    try {
      await getTables().deleteRow({ databaseId: databaseId(), tableId, rowId })
      removed += 1
      log(`  ${label}`)
    } catch (error) {
      failed.push(`${tableId}/${rowId} — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const row of transactions) {
    await drop(COLLECTIONS.financeTransactions, row.$id, `entry ${String(row.reference)}`)
  }
  for (const row of payments) {
    await drop(COLLECTIONS.payments, row.$id, `declaration ${String(row.reference)}`)
  }
  for (const row of audits) {
    await drop(COLLECTIONS.auditLogs, row.$id, `audit ${String(row.action)}`)
  }
  for (const row of counters) {
    await drop(COLLECTIONS.settings, row.$id, `counter ${row.$id} (numbering restarts at 1)`)
  }

  log(`\nRemoved ${removed} row(s).`)

  if (failed.length > 0) {
    log('\nNOT removed — delete these by hand in the Appwrite console:')
    for (const item of failed) log(`  ${item}`)
    return 1
  }

  log('Funds and categories were left in place.')
  log('\nNext: check the opening balances are the real ones.')
  log('  npm run seed:finance -- --dir ../data/club --update-funds\n')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`\nReset failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
