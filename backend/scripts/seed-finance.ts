/**
 * Load the club's funds and categories into Firestore.
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
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parseCategoriesCsv, parseFundsCsv, parseTransactionsCsv } from '../src/domain/csv.js'
import { formatPaise } from '../src/domain/money.js'
import { hasFirebaseCredentials } from '../src/config/env.js'
import { FirestoreFinanceStore } from '../src/services/firestoreStore.js'
import { getDb } from '../src/config/firebase.js'
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
  const dirIndex = argv.indexOf('--dir')
  const dir = resolve(dirIndex === -1 ? '../data/demo' : (argv[dirIndex + 1] ?? '../data/demo'))

  if (!hasFirebaseCredentials) {
    exit(
      'Firebase Admin credentials are not configured, so there is no database to seed.\n' +
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

  const store = new FirestoreFinanceStore(getDb)
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

  console.log(`\nAlready in Firestore: ${existingFunds.length} funds, ${existingCategories.length} categories`)
  console.log(`Would add: ${newFunds.length} funds, ${newCategories.length} categories`)

  for (const fund of newFunds) {
    console.log(
      `  + fund      ${fund.name} (${fund.kind}) opening ${formatPaise(fund.openingBalancePaise)} on ${fund.openingDate}`
    )
  }
  for (const category of newCategories) {
    console.log(`  + category  ${category.name} (${category.kind})`)
  }

  if (!write) {
    console.log('\nThis was a check only. Add --write to apply it.\n')
    return
  }

  const createdFunds = []
  for (const fund of newFunds) createdFunds.push(await store.createFund(fund))
  for (const category of newCategories) await store.createCategory(category)

  console.log(`\nWrote ${createdFunds.length} funds and ${newCategories.length} categories.`)

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
      allCategories.map((category) => [`${category.kind}:${category.name.toLowerCase()}`, category.id])
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
