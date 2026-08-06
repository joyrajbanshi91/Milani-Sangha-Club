import { describe, expect, it } from 'vitest'

import {
  byCategory,
  bySource,
  fundBalances,
  inPeriod,
  monthlyTotals,
  openingTotalPaise,
  periodTotals,
  postedOnly,
  totalFundsPaise,
} from '../src/domain/ledger.js'
import {
  BANK,
  CASH,
  CATEGORIES,
  DONATIONS,
  FEES,
  FUNDS,
  GROUND,
  makeTransaction,
} from './helpers/fixtures.js'

describe('only approved entries count', () => {
  it('ignores pending, rejected and discarded entries', () => {
    const transactions = [
      makeTransaction({ status: 'posted', amountPaise: 100_000 }),
      makeTransaction({ status: 'pending', amountPaise: 999_999 }),
      makeTransaction({ status: 'rejected', amountPaise: 999_999 }),
      makeTransaction({ status: 'discarded', amountPaise: 999_999 }),
    ]

    expect(postedOnly(transactions)).toHaveLength(1)

    const balances = fundBalances(FUNDS, transactions)
    const cash = balances.find((b) => b.fundId === CASH.id)
    // Opening ₹5,000 + the single posted ₹1,000 — nothing else.
    expect(cash?.balancePaise).toBe(600_000)
  })

  it('still counts a reversed entry, because its reversal offsets it', () => {
    // Regression test for a bug found on the deployed site: cancelling a ₹1,250.75
    // expense left the balance ₹1,250.75 HIGHER than before it was recorded. The
    // original was dropped from the balance *and* its reversal was added, so the
    // correction was applied twice.
    const original = makeTransaction({
      kind: 'expense',
      categoryId: GROUND.id,
      fundId: CASH.id,
      amountPaise: 125_075,
      status: 'reversed',
      reversedBy: 'txn-reversal',
    })
    const reversal = makeTransaction({
      id: 'txn-reversal',
      kind: 'income',
      categoryId: GROUND.id,
      fundId: CASH.id,
      amountPaise: 125_075,
      status: 'posted',
      reverses: original.id,
    })

    const withPair = fundBalances(FUNDS, [original, reversal])
    const withNeither = fundBalances(FUNDS, [])

    // The pair must net to nothing.
    expect(withPair.find((b) => b.fundId === CASH.id)?.balancePaise).toBe(
      withNeither.find((b) => b.fundId === CASH.id)?.balancePaise
    )
    expect(totalFundsPaise(withPair)).toBe(totalFundsPaise(withNeither))
  })

  it('leaves a reversal in the period it was made, not the original period', () => {
    // A committee that has adopted March's statement should not find it changed
    // because something was cancelled in May.
    const original = makeTransaction({
      date: '2026-03-10',
      kind: 'expense',
      categoryId: GROUND.id,
      amountPaise: 50_000,
      status: 'reversed',
    })
    const reversal = makeTransaction({
      date: '2026-05-10',
      kind: 'income',
      categoryId: GROUND.id,
      amountPaise: 50_000,
      reverses: original.id,
    })

    const march = periodTotals([original, reversal], '2026-03-01', '2026-03-31')
    const may = periodTotals([original, reversal], '2026-05-01', '2026-05-31')

    expect(march.expensePaise).toBe(50_000)
    expect(may.incomePaise).toBe(50_000)
  })

  it('keeps an unapproved entry out of the totals entirely', () => {
    const totals = periodTotals(
      [makeTransaction({ status: 'pending', kind: 'income', amountPaise: 500_000 })],
      '2026-04-01',
      '2026-04-30'
    )

    expect(totals.incomePaise).toBe(0)
    expect(totals.transactionCount).toBe(0)
  })
})

describe('fund balances', () => {
  it('adds income and subtracts expenditure from the right fund', () => {
    const transactions = [
      makeTransaction({ kind: 'income', fundId: CASH.id, amountPaise: 300_000 }),
      makeTransaction({ kind: 'expense', fundId: CASH.id, categoryId: GROUND.id, amountPaise: 100_000 }),
      makeTransaction({ kind: 'income', fundId: BANK.id, amountPaise: 1_000_000 }),
    ]

    const balances = fundBalances(FUNDS, transactions)
    expect(balances.find((b) => b.fundId === CASH.id)?.balancePaise).toBe(500_000 + 300_000 - 100_000)
    expect(balances.find((b) => b.fundId === BANK.id)?.balancePaise).toBe(2_000_000 + 1_000_000)
  })

  it('moves a transfer out of one fund and into the other, leaving the total unchanged', () => {
    const transfer = makeTransaction({
      kind: 'transfer',
      fundId: CASH.id,
      toFundId: BANK.id,
      categoryId: undefined,
      amountPaise: 200_000,
    })

    const before = totalFundsPaise(fundBalances(FUNDS, []))
    const balances = fundBalances(FUNDS, [transfer])

    expect(balances.find((b) => b.fundId === CASH.id)?.balancePaise).toBe(300_000)
    expect(balances.find((b) => b.fundId === BANK.id)?.balancePaise).toBe(2_200_000)
    expect(totalFundsPaise(balances)).toBe(before)
  })

  it('can be taken as of a date, excluding later entries', () => {
    const transactions = [
      makeTransaction({ date: '2026-04-10', amountPaise: 100_000 }),
      makeTransaction({ date: '2026-05-10', amountPaise: 100_000 }),
    ]

    const asOfApril = fundBalances(FUNDS, transactions, '2026-04-30')
    expect(asOfApril.find((b) => b.fundId === CASH.id)?.balancePaise).toBe(600_000)
  })

  it('reports gross in and out separately, not just the net', () => {
    const balances = fundBalances(FUNDS, [
      makeTransaction({ kind: 'income', fundId: CASH.id, amountPaise: 300_000 }),
      makeTransaction({ kind: 'expense', fundId: CASH.id, categoryId: GROUND.id, amountPaise: 50_000 }),
    ])

    const cash = balances.find((b) => b.fundId === CASH.id)
    expect(cash?.inPaise).toBe(300_000)
    expect(cash?.outPaise).toBe(50_000)
  })
})

describe('period selection', () => {
  const transactions = [
    makeTransaction({ date: '2026-03-31' }),
    makeTransaction({ date: '2026-04-01' }),
    makeTransaction({ date: '2026-04-30' }),
    makeTransaction({ date: '2026-05-01' }),
  ]

  it('includes both endpoints', () => {
    const window = inPeriod(transactions, '2026-04-01', '2026-04-30')
    expect(window.map((t) => t.date)).toEqual(['2026-04-01', '2026-04-30'])
  })
})

describe('rollups', () => {
  const transactions = [
    makeTransaction({ kind: 'income', categoryId: FEES.id, amountPaise: 600_000, source: 'Member dues' }),
    makeTransaction({ kind: 'income', categoryId: FEES.id, amountPaise: 200_000, source: 'member dues' }),
    makeTransaction({ kind: 'income', categoryId: DONATIONS.id, amountPaise: 200_000, source: 'Local shop' }),
    makeTransaction({ kind: 'expense', categoryId: GROUND.id, amountPaise: 150_000, source: 'Contractor' }),
  ]

  it('groups income by category, largest first, with shares that add to 100', () => {
    const rows = byCategory(transactions, CATEGORIES, 'income')

    expect(rows.map((r) => r.label)).toEqual(['Membership fees', 'Donations'])
    expect(rows[0]?.amountPaise).toBe(800_000)
    expect(rows[0]?.count).toBe(2)
    expect(rows.reduce((sum, r) => sum + r.sharePercent, 0)).toBeCloseTo(100, 1)
  })

  it('keeps expenditure out of the income rollup', () => {
    const rows = byCategory(transactions, CATEGORIES, 'income')
    expect(rows.some((r) => r.label === 'Ground maintenance')).toBe(false)
  })

  it('groups sources case-insensitively but shows the first spelling used', () => {
    const rows = bySource(transactions, 'income')

    const dues = rows.find((r) => r.label.toLowerCase() === 'member dues')
    expect(dues?.amountPaise).toBe(800_000)
    expect(dues?.label).toBe('Member dues')
    expect(rows).toHaveLength(2)
  })

  it('labels a blank source rather than dropping the money', () => {
    const rows = bySource([makeTransaction({ source: '   ', amountPaise: 100 })], 'income')
    expect(rows[0]?.label).toBe('Unspecified')
  })

  it('returns no rows, rather than dividing by zero, when there is nothing', () => {
    expect(byCategory([], CATEGORIES, 'income')).toEqual([])
    expect(bySource([], 'expense')).toEqual([])
  })
})

describe('period totals', () => {
  it('computes income, expenditure and the net', () => {
    const totals = periodTotals(
      [
        makeTransaction({ kind: 'income', amountPaise: 500_000 }),
        makeTransaction({ kind: 'expense', categoryId: GROUND.id, amountPaise: 200_000 }),
        makeTransaction({ kind: 'transfer', toFundId: BANK.id, categoryId: undefined, amountPaise: 100_000 }),
      ],
      '2026-04-01',
      '2026-04-30'
    )

    expect(totals.incomePaise).toBe(500_000)
    expect(totals.expensePaise).toBe(200_000)
    expect(totals.netPaise).toBe(300_000)
    // A transfer is neither income nor expenditure; it is reported separately.
    expect(totals.transferPaise).toBe(100_000)
    expect(totals.transactionCount).toBe(3)
  })

  it('reports a deficit as a negative net', () => {
    const totals = periodTotals(
      [makeTransaction({ kind: 'expense', categoryId: GROUND.id, amountPaise: 700_000 })],
      '2026-04-01',
      '2026-04-30'
    )
    expect(totals.netPaise).toBe(-700_000)
  })
})

describe('monthly trend', () => {
  it('includes months with no activity as zeros, so the chart has no gaps', () => {
    const rows = monthlyTotals(
      [makeTransaction({ date: '2026-04-10', amountPaise: 100_000 })],
      '2026-04-01',
      '2026-06-30'
    )

    expect(rows.map((r) => r.month)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(rows[0]?.incomePaise).toBe(100_000)
    expect(rows[1]?.incomePaise).toBe(0)
  })

  it('nets income against expenditure per month', () => {
    const rows = monthlyTotals(
      [
        makeTransaction({ date: '2026-04-10', kind: 'income', amountPaise: 500_000 }),
        makeTransaction({ date: '2026-04-20', kind: 'expense', categoryId: GROUND.id, amountPaise: 200_000 }),
      ],
      '2026-04-01',
      '2026-04-30'
    )

    expect(rows[0]?.netPaise).toBe(300_000)
  })
})

describe('opening balance', () => {
  it('counts everything posted strictly before the period starts', () => {
    const transactions = [
      makeTransaction({ date: '2026-03-15', kind: 'income', amountPaise: 100_000 }),
      makeTransaction({ date: '2026-04-15', kind: 'income', amountPaise: 900_000 }),
    ]

    // Both funds' opening balances plus only the March entry.
    expect(openingTotalPaise(FUNDS, transactions, '2026-04-01')).toBe(2_500_000 + 100_000)
  })

  it('opening + income - expenditure equals the closing balance', () => {
    const transactions = [
      makeTransaction({ date: '2026-03-20', kind: 'income', amountPaise: 300_000 }),
      makeTransaction({ date: '2026-04-05', kind: 'income', amountPaise: 500_000 }),
      makeTransaction({ date: '2026-04-25', kind: 'expense', categoryId: GROUND.id, amountPaise: 120_000 }),
    ]

    const opening = openingTotalPaise(FUNDS, transactions, '2026-04-01')
    const totals = periodTotals(transactions, '2026-04-01', '2026-04-30')
    const closing = totalFundsPaise(fundBalances(FUNDS, transactions, '2026-04-30'))

    expect(closing).toBe(opening + totals.incomePaise - totals.expensePaise)
  })
})
