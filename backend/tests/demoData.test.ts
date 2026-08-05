import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEMO_CSV } from '../src/services/demoSeed.js'
import {
  parseCategoriesCsv,
  parseFundsCsv,
  parseTransactionsCsv,
} from '../src/domain/csv.js'
import { buildPeriodReport, monthRange, reconcile } from '../src/domain/report.js'
import { fundBalances, totalFundsPaise } from '../src/domain/ledger.js'
import type { Category, Fund, Transaction } from '../src/domain/types.js'

/**
 * The demo templates in data/demo/ must parse with the importer that ships
 * alongside them. Without this test, a change to either drifts from the other and
 * the club's first import fails on the documentation we gave them.
 */

const DEMO_DIR = join(import.meta.dirname, '..', '..', 'data', 'demo')
const read = (name: string) => readFileSync(join(DEMO_DIR, name), 'utf8')

/**
 * The demo ledger exists twice on purpose — as editable CSV in data/demo/, and
 * embedded in src/services/demoSeed.ts so a bundled function needs no filesystem.
 * Duplication invites drift, so this is the test that makes drift impossible to
 * commit: change one copy and it fails, naming the file to update.
 *
 * Trailing whitespace is normalised because an editor adding or removing a final
 * newline is not the drift anyone cares about. Content differences are exact.
 */
describe('embedded demo ledger matches data/demo', () => {
  const cases = [
    { file: 'funds.csv', embedded: DEMO_CSV.funds },
    { file: 'categories.csv', embedded: DEMO_CSV.categories },
    { file: 'transactions.csv', embedded: DEMO_CSV.transactions },
  ] as const

  for (const { file, embedded } of cases) {
    it(`${file} is identical in both copies`, () => {
      expect(
        embedded.trimEnd(),
        `data/demo/${file} and the copy in src/services/demoSeed.ts disagree. ` +
          'Paste the file contents into demoSeed.ts (see the comment at the top of it).'
      ).toBe(read(file).trimEnd())
    })
  }
})

describe('data/demo templates', () => {
  it('funds.csv parses with no errors', () => {
    const result = parseFundsCsv(read('funds.csv'))
    expect(result.errors).toEqual([])
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it('categories.csv parses with no errors and covers both kinds', () => {
    const result = parseCategoriesCsv(read('categories.csv'))
    expect(result.errors).toEqual([])
    expect(result.rows.some((row) => row.kind === 'income')).toBe(true)
    expect(result.rows.some((row) => row.kind === 'expense')).toBe(true)
  })

  it('transactions.csv parses against those funds and categories', () => {
    const funds = parseFundsCsv(read('funds.csv')).rows
    const categories = parseCategoriesCsv(read('categories.csv')).rows

    const result = parseTransactionsCsv(read('transactions.csv'), {
      fundsByName: new Map(funds.map((fund, index) => [fund.name.toLowerCase(), `fund-${index}`])),
      categoriesByName: new Map(
        categories.map((category, index) => [
          `${category.kind}:${category.name.toLowerCase()}`,
          `cat-${index}`,
        ])
      ),
      actor: { uid: 'u-treasurer', name: 'Treasurer' },
    })

    // Any error here means the template we ship disagrees with the parser.
    expect(result.errors).toEqual([])
    expect(result.rows.length).toBeGreaterThan(10)
    expect(result.rows.some((row) => row.kind === 'income')).toBe(true)
    expect(result.rows.some((row) => row.kind === 'expense')).toBe(true)
    expect(result.rows.some((row) => row.kind === 'transfer')).toBe(true)
  })

  it('produces a balanced April statement once posted', () => {
    const fundRows = parseFundsCsv(read('funds.csv')).rows
    const categoryRows = parseCategoriesCsv(read('categories.csv')).rows

    const funds: Fund[] = fundRows.map((fund, index) => ({ ...fund, id: `fund-${index}` }))
    const categories: Category[] = categoryRows.map((category, index) => ({
      ...category,
      id: `cat-${index}`,
    }))

    const drafts = parseTransactionsCsv(read('transactions.csv'), {
      fundsByName: new Map(funds.map((fund) => [fund.name.toLowerCase(), fund.id])),
      categoriesByName: new Map(
        categories.map((category) => [`${category.kind}:${category.name.toLowerCase()}`, category.id])
      ),
      actor: { uid: 'u-treasurer', name: 'Treasurer' },
    }).rows

    // Treat every imported row as approved, which is what a batch approval does.
    const transactions: Transaction[] = drafts.map((draft, index) => ({
      ...draft,
      id: `txn-${index}`,
      reference: `TXN-2026-${String(index + 1).padStart(6, '0')}`,
      status: 'posted',
      createdAt: '2026-06-01T00:00:00.000Z',
      postedAt: '2026-06-01T01:00:00.000Z',
      approvals: [
        { uid: 'u-secretary', name: 'Secretary', role: 'secretary', at: '2026-06-01T01:00:00.000Z' },
      ],
    }))

    const { from, to } = monthRange('2026-04')
    const report = buildPeriodReport({
      club: { name: 'New Milani Sangha Club' },
      from,
      to,
      funds,
      categories,
      transactions,
      generatedAt: '2026-06-01T02:00:00.000Z',
      generatedBy: 'Treasurer',
    })

    expect(reconcile(report).balanced).toBe(true)
    expect(report.totals.incomePaise).toBeGreaterThan(0)
    expect(report.totals.expensePaise).toBeGreaterThan(0)
    expect(report.incomeBySource.length).toBeGreaterThan(1)
  })

  it('leaves no fund overdrawn, which would mean the sample data is unrealistic', () => {
    const fundRows = parseFundsCsv(read('funds.csv')).rows
    const categoryRows = parseCategoriesCsv(read('categories.csv')).rows
    const funds: Fund[] = fundRows.map((fund, index) => ({ ...fund, id: `fund-${index}` }))
    const categories: Category[] = categoryRows.map((c, i) => ({ ...c, id: `cat-${i}` }))

    const drafts = parseTransactionsCsv(read('transactions.csv'), {
      fundsByName: new Map(funds.map((fund) => [fund.name.toLowerCase(), fund.id])),
      categoriesByName: new Map(
        categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id])
      ),
      actor: { uid: 'u', name: 'T' },
    }).rows

    const transactions: Transaction[] = drafts.map((draft, index) => ({
      ...draft,
      id: `txn-${index}`,
      reference: `TXN-${index}`,
      status: 'posted',
      createdAt: '2026-06-01T00:00:00.000Z',
      approvals: [],
    }))

    const balances = fundBalances(funds, transactions)
    for (const balance of balances) {
      expect(balance.balancePaise, `${balance.fundName} is overdrawn`).toBeGreaterThanOrEqual(0)
    }
    expect(totalFundsPaise(balances)).toBeGreaterThan(0)
  })
})
