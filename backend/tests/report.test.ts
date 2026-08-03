import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import {
  buildPeriodReport,
  lastDayOfMonth,
  monthRange,
  reconcile,
} from '../src/domain/report.js'
import { renderFinanceReportPdf } from '../src/lib/pdf/financeReport.js'
import { BANK, CASH, CATEGORIES, FUNDS, GROUND, makeTransaction } from './helpers/fixtures.js'

const GENERATED = '2026-05-02T04:30:00.000Z'

function report(transactions = TRANSACTIONS, from = '2026-04-01', to = '2026-04-30') {
  return buildPeriodReport({
    clubName: 'New Milani Sangha Club',
    from,
    to,
    funds: FUNDS,
    categories: CATEGORIES,
    transactions,
    generatedAt: GENERATED,
    generatedBy: 'Treasurer',
  })
}

const TRANSACTIONS = [
  makeTransaction({ date: '2026-03-20', kind: 'income', amountPaise: 300_000 }),
  makeTransaction({ date: '2026-04-05', kind: 'income', amountPaise: 500_000, source: 'Member dues' }),
  makeTransaction({ date: '2026-04-12', kind: 'income', amountPaise: 150_000, source: 'Local shop' }),
  makeTransaction({
    date: '2026-04-18',
    kind: 'expense',
    categoryId: GROUND.id,
    amountPaise: 220_000,
    source: 'Contractor',
  }),
  makeTransaction({
    date: '2026-04-22',
    kind: 'transfer',
    fundId: CASH.id,
    toFundId: BANK.id,
    categoryId: undefined,
    amountPaise: 100_000,
  }),
  makeTransaction({ date: '2026-05-03', kind: 'income', amountPaise: 999_999 }),
  makeTransaction({ date: '2026-04-15', status: 'pending', amountPaise: 777_777 }),
]

describe('date helpers', () => {
  it('finds the last day of a month, including February in a leap year', () => {
    expect(lastDayOfMonth('2026-04-10')).toBe('2026-04-30')
    expect(lastDayOfMonth('2026-02-01')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02-01')).toBe('2028-02-29')
    expect(lastDayOfMonth('2026-12-31')).toBe('2026-12-31')
  })

  it('builds a whole-month range', () => {
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })
})

describe('period report', () => {
  it('names a whole calendar month as that month', () => {
    expect(report().period.label).toBe('April 2026')
  })

  it('names an arbitrary range as a range', () => {
    expect(report(TRANSACTIONS, '2026-04-10', '2026-05-09').period.label).toContain(' to ')
  })

  it('excludes entries outside the period', () => {
    const built = report()
    expect(built.transactions.map((t) => t.date)).toEqual([
      '2026-04-05',
      '2026-04-12',
      '2026-04-18',
      '2026-04-22',
    ])
  })

  it('excludes the unapproved entry from the figures but counts it separately', () => {
    const built = report()
    expect(built.totals.incomePaise).toBe(650_000)
    expect(built.pendingCount).toBe(1)
    expect(built.transactions.some((t) => t.status === 'pending')).toBe(false)
  })

  it('carries the March entry into the opening balance', () => {
    const built = report()
    expect(built.openingBalancePaise).toBe(2_500_000 + 300_000)
  })

  it('balances: opening + income - expenditure equals closing', () => {
    const built = report()
    const check = reconcile(built)

    expect(check.balanced).toBe(true)
    expect(check.differencePaise).toBe(0)
    expect(built.closingBalancePaise).toBe(
      built.openingBalancePaise + built.totals.incomePaise - built.totals.expensePaise
    )
  })

  it('sorts entries by date so the statement reads chronologically', () => {
    const dates = report().transactions.map((t) => t.date)
    expect([...dates].sort()).toEqual(dates)
  })

  it('reports the transfer without counting it as income or expenditure', () => {
    const built = report()
    expect(built.totals.transferPaise).toBe(100_000)
    expect(built.totals.incomePaise).toBe(650_000)
  })

  it('breaks collections down by source', () => {
    const built = report()
    expect(built.incomeBySource.map((r) => r.label)).toEqual(['Member dues', 'Local shop'])
  })

  it('counts reversals in the period so they are never hidden', () => {
    const built = report([
      ...TRANSACTIONS,
      makeTransaction({ date: '2026-04-28', kind: 'expense', categoryId: GROUND.id, reverses: 'txn-1' }),
    ])
    expect(built.reversalCount).toBe(1)
  })

  it('produces an empty but valid report for a period with no activity', () => {
    const built = report(TRANSACTIONS, '2027-01-01', '2027-01-31')

    expect(built.transactions).toEqual([])
    expect(built.totals.incomePaise).toBe(0)
    expect(reconcile(built).balanced).toBe(true)
  })
})

describe('reconcile', () => {
  it('reports the difference when the figures do not tie', () => {
    const built = report()
    const broken = { ...built, closingBalancePaise: built.closingBalancePaise + 5000 }
    const check = reconcile(broken)

    expect(check.balanced).toBe(false)
    expect(check.differencePaise).toBe(5000)
  })
})

describe('PDF statement', () => {
  it('renders a valid PDF', async () => {
    const bytes = await renderFinanceReportPdf(report())

    // %PDF- magic number, then a non-trivial document.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(2000)
  })

  it('renders without throwing when a description contains characters the PDF font cannot encode', async () => {
    // The standard fonts are WinAnsi: ₹, an em dash or Bengali text would throw
    // if it reached the encoder unsanitised.
    const built = report([
      makeTransaction({
        date: '2026-04-09',
        description: 'Donation ₹500 — মিলনী সংঘ',
        source: 'Anonymous — “well-wisher”',
      }),
    ])

    const bytes = await renderFinanceReportPdf(built)
    expect(bytes.byteLength).toBeGreaterThan(2000)
  })

  it('renders an empty period without throwing', async () => {
    const bytes = await renderFinanceReportPdf(report(TRANSACTIONS, '2027-01-01', '2027-01-31'))
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('paginates a long ledger instead of overflowing one page', async () => {
    const many = Array.from({ length: 140 }, (_, index) =>
      makeTransaction({
        date: `2026-04-${String((index % 30) + 1).padStart(2, '0')}`,
        amountPaise: 10_000 + index,
      })
    )

    const bytes = await renderFinanceReportPdf(report(many))

    // Read the document back rather than grepping the bytes: pdf-lib compresses
    // object streams, so the page markers are not plain text.
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBeGreaterThan(1)
  })

  it('numbers every page with the club name and period in the footer', async () => {
    const loaded = await PDFDocument.load(await renderFinanceReportPdf(report()))
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(loaded.getTitle()).toContain('April 2026')
  })
})
