/**
 * Load the club's funds and categories into Appwrite.
 *
 *   npm run seed:finance -- --dir ../data/demo            # check only
 *   npm run seed:finance -- --dir ../data/demo --write
 *   npm run seed:finance -- --dir ../data/club --write --with-transactions
 *
 * This exists because the import screen was removed: the chart of accounts still
 * has to get in somehow, and typing twenty categories into a form is worse than
 * filling in a spreadsheet once.
 *
 * Two safeguards, because this writes to the real ledger:
 *
 *   • **Nothing is written without `--write`.** The default run validates the files
 *     and prints what it would do.
 *   • **Funds and categories already present are skipped by name**, so re-running
 *     after adding a row does not create duplicates.
 *
 * `--with-transactions` is off by default and should stay off for real data: those
 * rows are written as PENDING and still need a second officer's approval, exactly
 * like a hand-typed entry. It is there for populating a test project.
 *
 * ## `--update-funds`
 *
 * Skipping by name is right for adding a fund and wrong for the commonest job of
 * all: the club provisions three funds with zero opening balances, then finds out
 * what was actually in the cash box on 1 April and puts it in the spreadsheet. Every
 * subsequent run said "0 funds to add" and changed nothing.
 *
 *   npm run seed:finance -- --dir ../data/club --update-funds            # shows the diff
 *   npm run seed:finance -- --dir ../data/club --update-funds --write
 *
 * It is a separate flag rather than the default because an opening balance is the
 * one figure that moves every balance in the accounts without leaving an entry
 * anywhere. The change is printed line by line, before and after, and needs
 * `--write` like everything else here.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parseCategoriesCsv, parseFundsCsv, parseTransactionsCsv } from '../src/domain/csv.js'
import { formatPaise } from '../src/domain/money.js'
import { databaseId, getTables } from '../src/config/appwrite.js'
import { hasAppwriteCredentials } from '../src/config/env.js'
import { AppwriteFinanceStore } from '../src/services/appwriteStore.js'
import type { RowError } from '../src/domain/csv.js'

function exit(message: string): never {
  console.error(`\nerror: ${message}\n`)
  process.exit(1)
}

function reportErrors(file: string, errors: RowError[]): never {
  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} in ${file}:\n`)
  for (const error of errors) {
    console.error(`  line ${error.line}  ${error.column}="${error.value}"  ${error.message}`)
  }
  console.error('\nNothing was written. Fix the spreadsheet and run again.\n')
  process.exit(1)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const write = argv.includes('--write')
  const withTransactions = argv.includes('--with-transactions')
  const updateFunds = argv.includes('--update-funds')
  const dirIndex = argv.indexOf('--dir')
  const dir = resolve(dirIndex === -1 ? '../data/demo' : (argv[dirIndex + 1] ?? '../data/demo'))

  if (!hasAppwriteCredentials) {
    exit(
      'Appwrite credentials are not configured, so there is no database to seed.\n' +
        '       Without them the API already loads data/demo automatically.\n' +
        '       See docs/08-going-live.md.'
    )
  }

  const read = (name: string) => {
    try {
      return readFileSync(join(dir, name), 'utf8')
    } catch {
      return exit(`Could not read ${join(dir, name)}`)
    }
  }

  // Validate everything before touching the database.
  const funds = parseFundsCsv(read('funds.csv'))
  if (funds.errors.length > 0) reportErrors('funds.csv', funds.errors)

  const categories = parseCategoriesCsv(read('categories.csv'))
  if (categories.errors.length > 0) reportErrors('categories.csv', categories.errors)

  console.log(`\nReading from ${dir}`)
  console.log(`  ${funds.rows.length} funds, ${categories.rows.length} categories`)

  const store = new AppwriteFinanceStore(getTables, databaseId)
  const existingFunds = await store.listFunds()
  const existingCategories = await store.listCategories()

  const fundNames = new Set(existingFunds.map((fund) => fund.name.toLowerCase()))
  const categoryKeys = new Set(
    existingCategories.map((category) => `${category.kind}:${category.name.toLowerCase()}`)
  )

  const newFunds = funds.rows.filter((fund) => !fundNames.has(fund.name.toLowerCase()))
  const newCategories = categories.rows.filter(
    (category) => !categoryKeys.has(`${category.kind}:${category.name.toLowerCase()}`)
  )

  console.log(
    `\nAlready in Appwrite: ${existingFunds.length} funds, ${existingCategories.length} categories`
  )
  console.log(`Would add: ${newFunds.length} funds, ${newCategories.length} categories`)

  for (const fund of newFunds) {
    console.log(
      `  + fund      ${fund.name} (${fund.kind}) opening ${formatPaise(fund.openingBalancePaise)} on ${fund.openingDate}`
    )
  }
  for (const category of newCategories) {
    console.log(`  + category  ${category.name} (${category.kind})`)
  }

  /**
   * Funds that exist and whose spreadsheet row now says something different.
   *
   * Matched by name, the same way `newFunds` decides what is new, so the two are
   * complementary and a row is never both. The opening date is shown for every
   * change because the CSV accepts `01/04/26` — printing what that was read as is
   * how a day/month mix-up gets noticed before it moves the accounts.
   */
  const changedFunds = existingFunds.flatMap((existing) => {
    const desired = funds.rows.find(
      (row) => row.name.toLowerCase() === existing.name.toLowerCase()
    )
    if (!desired) return []

    const differences: string[] = []
    if (desired.openingBalancePaise !== existing.openingBalancePaise) {
      differences.push(
        `opening balance ${formatPaise(existing.openingBalancePaise)} -> ${formatPaise(desired.openingBalancePaise)}`
      )
    }
    if (desired.openingDate !== existing.openingDate) {
      differences.push(`opening date ${existing.openingDate} -> ${desired.openingDate}`)
    }
    if (desired.kind !== existing.kind) {
      differences.push(`kind ${existing.kind} -> ${desired.kind}`)
    }
    if (desired.active !== existing.active) {
      differences.push(`${existing.active ? 'active -> inactive' : 'inactive -> active'}`)
    }
    if ((desired.notes ?? '') !== (existing.notes ?? '')) differences.push('notes')

    return differences.length > 0 ? [{ existing, desired, differences }] : []
  })

  if (changedFunds.length > 0) {
    console.log(
      updateFunds
        ? `\nWould change ${changedFunds.length} existing fund(s):`
        : `\n${changedFunds.length} existing fund(s) differ from the spreadsheet:`
    )
    for (const change of changedFunds) {
      console.log(`  ~ fund      ${change.existing.name}`)
      for (const difference of change.differences) console.log(`                ${difference}`)
    }

    if (!updateFunds) {
      console.log('\n  Not applied. Existing funds are left alone unless you pass --update-funds.')
      console.log('  An opening balance changes every balance in the accounts without')
      console.log('  leaving an entry in the ledger, so it is never changed by accident.')
    } else {
      console.log('\n  These change the club’s balances. Read the figures above before applying.')
    }
  } else if (updateFunds) {
    console.log('\nNo existing fund differs from the spreadsheet — nothing to update.')
  }

  if (!write) {
    console.log('\nThis was a check only. Add --write to apply it.\n')
    return
  }

  const createdFunds = []
  for (const fund of newFunds) createdFunds.push(await store.createFund(fund))
  for (const category of newCategories) await store.createCategory(category)

  let updated = 0
  if (updateFunds) {
    for (const change of changedFunds) {
      await store.updateFund(change.existing.id, change.desired)
      updated += 1
    }
  }

  console.log(
    `\nWrote ${createdFunds.length} funds and ${newCategories.length} categories` +
      (updateFunds ? `, and updated ${updated} existing fund(s).` : '.')
  )

  if (!withTransactions) {
    console.log('\nDone. Record entries in Office → Entries; each needs a second officer.\n')
    return
  }

  // Transactions are optional and land as pending, needing approval like any other.
  const allFunds = await store.listFunds()
  const allCategories = await store.listCategories()

  const transactions = parseTransactionsCsv(read('transactions.csv'), {
    fundsByName: new Map(allFunds.map((fund) => [fund.name.toLowerCase(), fund.id])),
    categoriesByName: new Map(
      allCategories.map((category) => [
        `${category.kind}:${category.name.toLowerCase()}`,
        category.id,
      ])
    ),
    actor: { uid: 'seed-script', name: 'Seed script' },
  })
  if (transactions.errors.length > 0) reportErrors('transactions.csv', transactions.errors)

  const created = await store.createTransactionBatch(
    transactions.rows.map((draft) => ({
      ...draft,
      status: 'pending' as const,
      approvals: [],
      createdAt: new Date().toISOString(),
    }))
  )

  console.log(`Wrote ${created.length} transactions as PENDING.`)
  console.log('They affect no balance until an officer approves each one in Office → Entries.\n')
}

main().catch((error: unknown) => exit(error instanceof Error ? error.message : String(error)))
