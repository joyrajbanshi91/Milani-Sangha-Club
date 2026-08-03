import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseCategoriesCsv, parseFundsCsv, parseTransactionsCsv } from '../domain/csv.js'
import type { Category, Fund, Transaction } from '../domain/types.js'
import { isProduction } from '../config/env.js'
import { logger } from '../lib/logger.js'
import {
  applyFilter,
  formatReference,
  StoreConflictError,
  type FinanceStore,
  type TransactionFilter,
} from './store.js'

/**
 * In-memory finance store, seeded from data/demo/*.csv.
 *
 * Exists so the officer area can be run and demonstrated before a Firebase
 * project is set up. Data lives for the lifetime of the process and is lost on
 * restart — which is the point: it is a sandbox, not a ledger.
 *
 * It refuses to construct when NODE_ENV is production, because a club's accounts
 * silently living in RAM would be a catastrophe rather than a convenience.
 */
export class InMemoryFinanceStore implements FinanceStore {
  readonly kind = 'memory' as const

  private funds: Fund[] = []
  private categories: Category[] = []
  private transactions: Transaction[] = []
  private sequence = 0

  constructor() {
    if (isProduction) {
      throw new Error(
        'InMemoryFinanceStore must never run in production. Configure Firebase Admin credentials.'
      )
    }
  }

  /**
   * Load the demo spreadsheets.
   *
   * Every seeded entry is 'posted' with a recorded approval, so the dashboard has
   * figures to show. Anything the club adds afterwards goes through the normal
   * two-person flow.
   */
  seedFromDemoCsv(demoDir: string): void {
    const read = (name: string) => readFileSync(join(demoDir, name), 'utf8')

    const fundResult = parseFundsCsv(read('funds.csv'))
    const categoryResult = parseCategoriesCsv(read('categories.csv'))

    if (fundResult.errors.length > 0 || categoryResult.errors.length > 0) {
      throw new Error(
        `Demo data is invalid: ${JSON.stringify([...fundResult.errors, ...categoryResult.errors])}`
      )
    }

    this.funds = fundResult.rows.map((fund, index) => ({ ...fund, id: `fund-${index + 1}` }))
    this.categories = categoryResult.rows.map((category, index) => ({
      ...category,
      id: `cat-${index + 1}`,
    }))

    const transactionResult = parseTransactionsCsv(read('transactions.csv'), {
      fundsByName: new Map(this.funds.map((fund) => [fund.name.toLowerCase(), fund.id])),
      categoriesByName: new Map(
        this.categories.map((category) => [
          `${category.kind}:${category.name.toLowerCase()}`,
          category.id,
        ])
      ),
      actor: { uid: 'demo-treasurer', name: 'Demo Treasurer' },
    })

    if (transactionResult.errors.length > 0) {
      throw new Error(`Demo transactions are invalid: ${JSON.stringify(transactionResult.errors)}`)
    }

    this.transactions = transactionResult.rows.map((draft) => {
      this.sequence += 1
      const createdAt = `${draft.date}T10:00:00.000Z`
      return {
        ...draft,
        id: `txn-${this.sequence}`,
        reference: formatReference(Number(draft.date.slice(0, 4)), this.sequence),
        status: 'posted',
        createdAt,
        postedAt: `${draft.date}T11:00:00.000Z`,
        approvals: [
          {
            uid: 'demo-secretary',
            name: 'Demo Secretary',
            role: 'secretary',
            at: `${draft.date}T11:00:00.000Z`,
          },
        ],
      }
    })

    // One entry left pending on purpose, so the approval queue is not empty on a
    // first look and the two-person flow can be tried immediately.
    this.sequence += 1
    const cashFund = this.funds[0]
    const expenseCategory = this.categories.find((category) => category.kind === 'expense')
    if (cashFund && expenseCategory) {
      this.transactions.push({
        id: `txn-${this.sequence}`,
        reference: formatReference(2026, this.sequence),
        kind: 'expense',
        status: 'pending',
        date: '2026-06-02',
        amountPaise: 245_000,
        fundId: cashFund.id,
        categoryId: expenseCategory.id,
        source: 'Netaji Printers',
        description: 'Banners for the annual programme — awaiting a second signature',
        externalReference: 'INV-6001',
        createdBy: 'demo-treasurer',
        createdByName: 'Demo Treasurer',
        createdAt: '2026-06-02T09:15:00.000Z',
        approvals: [],
      })
    }

    logger.warn(
      {
        funds: this.funds.length,
        categories: this.categories.length,
        transactions: this.transactions.length,
      },
      'finance running on the IN-MEMORY demo store — data is lost on restart'
    )
  }

  listFunds(): Promise<Fund[]> {
    return Promise.resolve([...this.funds])
  }

  createFund(fund: Omit<Fund, 'id'>): Promise<Fund> {
    const created: Fund = { ...fund, id: `fund-${this.funds.length + 1}` }
    this.funds.push(created)
    return Promise.resolve(created)
  }

  listCategories(): Promise<Category[]> {
    return Promise.resolve([...this.categories])
  }

  createCategory(category: Omit<Category, 'id'>): Promise<Category> {
    const created: Category = { ...category, id: `cat-${this.categories.length + 1}` }
    this.categories.push(created)
    return Promise.resolve(created)
  }

  listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    return Promise.resolve(applyFilter(this.transactions, filter))
  }

  getTransaction(id: string): Promise<Transaction | null> {
    return Promise.resolve(this.transactions.find((t) => t.id === id) ?? null)
  }

  createTransaction(draft: Omit<Transaction, 'id' | 'reference'>): Promise<Transaction> {
    this.sequence += 1
    const created: Transaction = {
      ...draft,
      id: `txn-${this.sequence}`,
      reference: formatReference(Number(draft.date.slice(0, 4)), this.sequence),
    }
    this.transactions.push(created)
    return Promise.resolve(created)
  }

  updateTransaction(
    id: string,
    next: Transaction,
    expectedStatus: Transaction['status']
  ): Promise<Transaction> {
    const index = this.transactions.findIndex((t) => t.id === id)
    if (index === -1) throw new StoreConflictError('That entry no longer exists.')

    const current = this.transactions[index]
    if (!current) throw new StoreConflictError('That entry no longer exists.')

    if (current.status !== expectedStatus) {
      throw new StoreConflictError(
        `Another officer changed this entry while you were looking at it — it is now ${current.status}. Reload and try again.`
      )
    }

    this.transactions[index] = next
    return Promise.resolve(next)
  }

  createTransactionBatch(
    drafts: Array<Omit<Transaction, 'id' | 'reference'>>
  ): Promise<Transaction[]> {
    const created = drafts.map((draft) => {
      this.sequence += 1
      return {
        ...draft,
        id: `txn-${this.sequence}`,
        reference: formatReference(Number(draft.date.slice(0, 4)), this.sequence),
      }
    })
    this.transactions.push(...created)
    return Promise.resolve(created)
  }
}
