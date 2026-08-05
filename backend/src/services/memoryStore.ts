import { REQUIRED_APPROVALS } from '../config/constants.js'
import { parseCategoriesCsv, parseFundsCsv, parseTransactionsCsv } from '../domain/csv.js'
import type { Category, Fund, Transaction, YearOpening } from '../domain/types.js'
import { logger } from '../lib/logger.js'
import {
  applyFilter,
  formatReference,
  StoreConflictError,
  type FinanceStore,
  type TransactionFilter,
} from './store.js'

/**
 * In-memory finance store, seeded from the embedded demo ledger.
 *
 * Exists so the officer area can be run and shown before a real database is set
 * up. Data lives for the lifetime of the process and is lost when it restarts —
 * which is the point: it is a sandbox, not a ledger.
 *
 * ## It no longer refuses to run in production
 *
 * It used to throw when `NODE_ENV` was production, on the reasoning that a club's
 * accounts silently living in RAM would be a catastrophe. The instinct was right;
 * the mechanism was wrong. A hosted deployment sets `NODE_ENV=production` as a
 * matter of course, so the guard did not prevent a club from trusting demo data —
 * it prevented the site from starting *at all* until a database was provisioned,
 * which is why a first deploy showed nothing but 500s.
 *
 * The danger was never the store; it was the store being mistaken for a real one.
 * So the defence moved to where it works: `kind === 'memory'` is reported by
 * `/api/v1/health/ready`, returned in the auth config, and rendered as a standing
 * banner across every signed-in page. Loud and true beats absent and broken.
 */
export class InMemoryFinanceStore implements FinanceStore {
  readonly kind = 'memory' as const

  private funds: Fund[] = []
  private categories: Category[] = []
  private transactions: Transaction[] = []
  private years: YearOpening[] = []
  private sequence = 0

  /**
   * Load the demo spreadsheets from their CSV contents.
   *
   * Takes the text rather than a directory: the caller passes the constants in
   * services/demoSeed.ts, so there is no file to find and this behaves identically
   * on a laptop and inside a bundled function. See that file for why.
   *
   * Every seeded entry is 'posted' with a recorded approval, so the dashboard has
   * figures to show. Anything added afterwards goes through the normal two-person
   * flow.
   */
  seed(csv: { funds: string; categories: string; transactions: string }): void {
    const fundResult = parseFundsCsv(csv.funds)
    const categoryResult = parseCategoriesCsv(csv.categories)

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

    const transactionResult = parseTransactionsCsv(csv.transactions, {
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

    /**
     * One more entry, in whatever state the club's approval rule can actually reach.
     *
     * It used to be left 'pending' unconditionally, so the approval queue was not
     * empty on a first look. That became a trap the moment `REQUIRED_APPROVALS`
     * dropped to 0: nothing can approve an entry that needs no approvals — the rule
     * correctly refuses — so it sat outside every balance for ever with no screen
     * asking anyone to deal with it. Seeded demo data must not contain a state the
     * application cannot leave.
     */
    this.sequence += 1
    const cashFund = this.funds[0]
    const expenseCategory = this.categories.find((category) => category.kind === 'expense')
    if (cashFund && expenseCategory) {
      const awaitingApproval = REQUIRED_APPROVALS > 0

      this.transactions.push({
        id: `txn-${this.sequence}`,
        reference: formatReference(2026, this.sequence),
        kind: 'expense',
        status: awaitingApproval ? 'pending' : 'posted',
        date: '2026-06-02',
        amountPaise: 245_000,
        fundId: cashFund.id,
        categoryId: expenseCategory.id,
        source: 'Netaji Printers',
        description: awaitingApproval
          ? 'Banners for the annual programme — awaiting a second signature'
          : 'Banners for the annual programme',
        externalReference: 'INV-6001',
        createdBy: 'demo-treasurer',
        createdByName: 'Demo Treasurer',
        createdAt: '2026-06-02T09:15:00.000Z',
        approvals: [],
        ...(awaitingApproval ? {} : { postedAt: '2026-06-02T09:15:00.000Z' }),
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

  updateFund(id: string, fund: Omit<Fund, 'id'>): Promise<Fund> {
    const index = this.funds.findIndex((candidate) => candidate.id === id)
    if (index === -1) throw new StoreConflictError('That fund no longer exists.')

    const next: Fund = { ...fund, id }
    this.funds[index] = next
    return Promise.resolve(next)
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

  listYearOpenings(): Promise<YearOpening[]> {
    return Promise.resolve([...this.years])
  }

  createYearOpening(opening: Omit<YearOpening, 'id'>): Promise<YearOpening> {
    if (this.years.some((existing) => existing.financialYear === opening.financialYear)) {
      throw new StoreConflictError(`${opening.financialYear} has already been opened.`)
    }

    const created: YearOpening = { ...opening, id: `year-${opening.financialYear}` }
    this.years.push(created)
    return Promise.resolve(created)
  }

  deleteYearOpening(financialYear: string): Promise<void> {
    this.years = this.years.filter((opening) => opening.financialYear !== financialYear)
    return Promise.resolve()
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
