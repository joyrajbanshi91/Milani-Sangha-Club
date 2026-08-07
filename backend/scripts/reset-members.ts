/**
 * Clear the club's people: every account, and every member profile.
 *
 *   npm run reset:members                          # lists what it would delete
 *   npm run reset:members -- --write               # deletes it
 *   npm run reset:members -- --except me@club.in --write
 *
 * The companion to `reset:ledger`, which clears the money. This clears the people:
 * the sign-in accounts and the `members` table that holds their profile photographs.
 *
 * ## Why this is a script and not a button
 *
 * Deleting an account is the most destructive single act in this system. It removes
 * somebody's way in, and if they had recorded a ledger entry it leaves that entry
 * pointing at a person who no longer exists. It belongs to whoever holds the server
 * key, it happens once at the start, and it should take a deliberate command with the
 * word `--write` in it.
 *
 * ## --except, because locking yourself out is the obvious way this goes wrong
 *
 * Delete every account and nobody can sign in — not to the office area, not to fix it.
 * The new accounts an import creates have passwords nobody knows, so the way back in
 * is a password-reset email for each of them. Keeping one administrator is the
 * difference between a fresh start and an afternoon lost, so this refuses to delete
 * everything unless told twice: name the accounts to spare with `--except`, or pass
 * `--all` and mean it.
 *
 * ## What it does not touch
 *
 *   • The ledger, the payment declarations and the audit log — `reset:ledger`.
 *   • Funds and categories — the chart of accounts, not people.
 *   • Enquiries from the website — those are visitors, not members, and the office
 *     screen has a Delete button for them.
 *
 * It does warn when declarations or entries reference an account being deleted,
 * because that is the combination that leaves the books naming somebody who is gone.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { Query } from 'node-appwrite'

import { databaseId, getTables, getUsers } from '../src/config/appwrite.js'
import { COLLECTIONS } from '../src/config/constants.js'
import { appwriteProjectId, hasAppwriteCredentials } from '../src/config/env.js'

const write = process.argv.includes('--write')
const all = process.argv.includes('--all')

/** Addresses to keep, lower-cased. `--except a@b.in --except c@d.in`. */
const spared = new Set(
  process.argv
    .map((argument, index) => (argument === '--except' ? process.argv[index + 1] : undefined))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase())
)

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

/** Every account, paginated the same way. */
async function allAccounts(): Promise<
  Array<{ $id: string; email: string; name: string; labels: string[] }>
> {
  const users = getUsers()
  const found: Array<{ $id: string; email: string; name: string; labels: string[] }> = []
  let cursor: string | undefined

  for (;;) {
    const queries = [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])]
    const page = await users.list({ queries })

    found.push(
      ...page.users.map((user) => ({
        $id: user.$id,
        email: user.email,
        name: user.name,
        labels: (user.labels ?? []) as string[],
      }))
    )

    if (page.users.length < 100) return found
    cursor = page.users[page.users.length - 1]?.$id
    if (!cursor) return found
  }
}

/** The newest backup and how old it is, so nobody deletes people without one. */
function newestBackup(): { name: string; minutes: number } | null {
  try {
    const directory = join(process.cwd(), '..', 'backups')
    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()

    const newest = files[files.length - 1]
    if (!newest) return null

    const age = (Date.now() - statSync(join(directory, newest)).mtimeMs) / 60_000
    return { name: newest, minutes: Math.round(age) }
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  if (!hasAppwriteCredentials) {
    log('error: no Appwrite credentials, so there is no database to clear.')
    log('       Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env.')
    process.exitCode = 2
    return
  }

  log(`project   ${appwriteProjectId ?? '(unknown)'}`)
  log(`database  ${databaseId()}`)
  log()

  const [accounts, profiles, payments, transactions] = await Promise.all([
    allAccounts(),
    allRows(COLLECTIONS.members),
    allRows(COLLECTIONS.payments),
    allRows(COLLECTIONS.financeTransactions),
  ])

  const doomed = accounts.filter((account) => !spared.has(account.email.toLowerCase()))
  const kept = accounts.filter((account) => spared.has(account.email.toLowerCase()))

  if (!write) log('Check only — nothing will be deleted. Add --write to apply.')
  log()

  log(`  ${doomed.length} account(s)`)
  for (const account of doomed) {
    const role = account.labels.find((label) => label !== '') ?? '(no role)'
    log(`    ${account.email.padEnd(34)} ${role.padEnd(14)} ${account.name}`)
  }

  for (const account of kept) {
    log(`    keeping  ${account.email}`)
  }

  log(`  ${profiles.length} member profile(s) — the photographs members uploaded`)

  /**
   * The combination that leaves the books naming somebody who no longer exists.
   *
   * Not refused, because a club clearing out test data wants exactly this. Named,
   * because doing it by accident to a real ledger is not recoverable by re-importing
   * a spreadsheet.
   */
  const deletedIds = new Set(doomed.map((account) => account.$id))

  const orphanedPayments = payments.filter((payment) =>
    deletedIds.has(String(payment.memberUid ?? ''))
  )
  const orphanedEntries = transactions.filter((entry) =>
    deletedIds.has(String(entry.createdBy ?? ''))
  )

  /**
   * Records that already name somebody who is gone.
   *
   * Counted as well as the ones this run would orphan, because that is the state a
   * club is usually in by the time they ask for a fresh start: accounts deleted by
   * hand in the console, and their payments and entries still in the books. Saying so
   * is the difference between "members cleared" and actually starting clean.
   */
  const liveIds = new Set(accounts.map((account) => account.$id))
  const alreadyOrphaned =
    payments.filter((payment) => !liveIds.has(String(payment.memberUid ?? ''))).length +
    transactions.filter((entry) => !liveIds.has(String(entry.createdBy ?? ''))).length

  if (orphanedPayments.length > 0 || orphanedEntries.length > 0 || alreadyOrphaned > 0) {
    log()
    log('  Records in the books that name an account which is gone, or would be:')
    if (orphanedPayments.length > 0) {
      log(`    ${orphanedPayments.length} payment declaration(s) belonging to accounts deleted here`)
    }
    if (orphanedEntries.length > 0) {
      log(`    ${orphanedEntries.length} ledger entr(y/ies) recorded by an account deleted here`)
    }
    if (alreadyOrphaned > 0) {
      log(`    ${alreadyOrphaned} already pointing at accounts deleted earlier`)
    }
    log()
    log('    Clearing people does not clear the money. For a genuinely fresh start:')
    log('      npm run reset:ledger -- --write')
  }

  const backup = newestBackup()
  log()
  log(
    backup
      ? `Newest backup  ${backup.name}  (${backup.minutes} minute(s) old)`
      : 'NO BACKUP FOUND in backups/. Run `npm run backup` first — accounts cannot be\n' +
          'recovered from anywhere else, and a member list is not reconstructible.'
  )

  if (!write) {
    log()
    log(`Check only — nothing was deleted. ${doomed.length} account(s) would go.`)
    log('Funds, categories, the ledger and website enquiries are not touched.')
    log()
    log('Then: npm run reset:members -- --write')
    return
  }

  /**
   * Refusing to delete every account unless told twice.
   *
   * With none left, nobody can sign in — including the person running this, and
   * including whoever would have to fix it. The way back is re-creating accounts from
   * the spreadsheet and a password-reset email each, which is recoverable but is not
   * what somebody expects from a command they ran to tidy up test data.
   */
  if (doomed.length === accounts.length && accounts.length > 0 && !all) {
    log()
    log('Refusing: that is every account, so nobody would be able to sign in — not even')
    log('to put it right. Keep one administrator:')
    log()
    log('  npm run reset:members -- --except you@example.org --write')
    log()
    log('Or, if a completely empty project is genuinely what you want, say so:')
    log()
    log('  npm run reset:members -- --all --write')
    log()
    log('After that, the way back in is:')
    log('  npm run members:import -- --reset-only --write')
    log('  then "Reset password" on the sign-in page for each person.')
    process.exitCode = 1
    return
  }

  const users = getUsers()

  for (const account of doomed) {
    await users.delete({ userId: account.$id })
    log(`  deleted  ${account.email}`)
  }

  for (const profile of profiles) {
    await getTables().deleteRow({
      databaseId: databaseId(),
      tableId: COLLECTIONS.members,
      rowId: profile.$id,
    })
    log(`  deleted  profile ${String(profile.uid ?? profile.$id)}`)
  }

  log()
  log(`Done. ${doomed.length} account(s) and ${profiles.length} profile(s) deleted.`)
  log()
  log('Next: put the club back with')
  log('  npm run members:import -- --reset-only --write')
  log('and have each person use "Reset password" on the sign-in page.')
}

await main()
