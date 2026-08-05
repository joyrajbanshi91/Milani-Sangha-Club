import { describe, expect, it } from 'vitest'

import {
  baselineFor,
  earliestOpenDate,
  isDateInClosedYear,
  isYearClosed,
  needsOpening,
  nextYear,
  previousYear,
  suggestCarryForward,
  yearEnd,
  yearRange,
  yearStart,
} from '../src/domain/financialYear.js'
import { fundBalances, totalFundsPaise } from '../src/domain/ledger.js'
import type { YearOpening } from '../src/domain/types.js'
import { BANK, CASH, FUNDS, makeTransaction } from './helpers/fixtures.js'

/**
 * The club's year, and the figure that joins one to the next.
 *
 * Two properties matter more than the arithmetic and are asserted directly:
 *
 *   • **Independence.** A year's figures are its declared opening plus its own
 *     entries. Nothing from three years ago leaks into them.
 *   • **Settlement.** Once a year is closed, nothing can be dated back into it —
 *     otherwise the carry-forward the committee adopted stops matching the year it
 *     came from, quietly, with nothing on screen showing the difference.
 */

function opening(financialYear: string, balances: Record<string, number>): YearOpening {
  return {
    id: `year-${financialYear}`,
    financialYear,
    balances,
    suggestedTotalPaise: Object.values(balances).reduce((sum, amount) => sum + amount, 0),
    createdAt: '2027-04-02T05:00:00.000Z',
    createdBy: 'u-treasurer',
    createdByName: 'Treasurer',
  }
}

describe('the shape of a year', () => {
  it('runs 1 April to 31 March', () => {
    expect(yearStart('2026-27')).toBe('2026-04-01')
    expect(yearEnd('2026-27')).toBe('2027-03-31')
    expect(yearRange('2026-27')).toEqual({ from: '2026-04-01', to: '2027-03-31' })
  })

  it('handles a leap year at the end of February without confusion', () => {
    // 31 March is 31 March whatever February did, but the arithmetic walks back from
    // 1 April, so this is worth pinning.
    expect(yearEnd('2027-28')).toBe('2028-03-31')
  })

  it('steps forward and back', () => {
    expect(nextYear('2026-27')).toBe('2027-28')
    expect(previousYear('2026-27')).toBe('2025-26')
    expect(nextYear('2099-00')).toBe('2100-01')
  })
})

describe('when a year is closed', () => {
  it('is closed by the existence of the next year’s opening, not a flag', () => {
    const openings = [opening('2027-28', { [CASH.id]: 100 })]

    expect(isYearClosed(openings, '2026-27')).toBe(true)
    // The year that was opened is itself still running.
    expect(isYearClosed(openings, '2027-28')).toBe(false)
  })

  it('leaves everything open when nothing has been opened', () => {
    expect(isYearClosed([], '2026-27')).toBe(false)
  })

  it('names the year a date falls in when that year is closed', () => {
    const openings = [opening('2027-28', {})]

    expect(isDateInClosedYear(openings, '2026-08-15')).toEqual({
      closed: true,
      financialYear: '2026-27',
    })
    // March belongs to the year that began the previous April — the half people get
    // wrong, and the half that decides whether a date is refused.
    expect(isDateInClosedYear(openings, '2027-03-31')).toEqual({
      closed: true,
      financialYear: '2026-27',
    })
    expect(isDateInClosedYear(openings, '2027-04-01')).toEqual({ closed: false })
  })

  it('reports the first day money may still be dated to', () => {
    expect(earliestOpenDate([])).toBeNull()
    expect(earliestOpenDate([opening('2027-28', {})])).toBe('2027-04-01')
    // The latest opening wins: two years closed means the books open in the later one.
    expect(earliestOpenDate([opening('2027-28', {}), opening('2028-29', {})])).toBe('2028-04-01')
  })
})

describe('measuring from what the club declared it held', () => {
  it('uses the latest opening at or before the period', () => {
    const openings = [opening('2027-28', { [CASH.id]: 1000 }), opening('2028-29', { [CASH.id]: 2000 })]

    expect(baselineFor(openings, '2027-06-01')?.asOf).toBe('2027-04-01')
    expect(baselineFor(openings, '2028-06-01')?.asOf).toBe('2028-04-01')
    // Before anything was declared, there is no baseline and the funds' own opening
    // balances serve — which is exactly a club's first year.
    expect(baselineFor(openings, '2026-06-01')).toBeNull()
  })

  /**
   * The point of the whole feature.
   *
   * Without a baseline a fund's balance is its original opening figure plus every
   * entry the club has ever made. With one, the year starts where the committee said
   * it did.
   */
  it('makes a year independent of everything before it', () => {
    const history = [
      makeTransaction({ date: '2026-05-01', kind: 'income', fundId: CASH.id, amountPaise: 900_000 }),
      makeTransaction({ date: '2027-06-01', kind: 'income', fundId: CASH.id, amountPaise: 50_000 }),
    ]

    const withoutBaseline = fundBalances(FUNDS, history, '2028-03-31')
    const cashWithout = withoutBaseline.find((fund) => fund.fundId === CASH.id)
    // Cash box opens at ₹5,000 in the fixtures, plus both entries.
    expect(cashWithout?.balancePaise).toBe(500_000 + 900_000 + 50_000)

    const withBaseline = fundBalances(FUNDS, history, '2028-03-31', {
      asOf: '2027-04-01',
      balances: { [CASH.id]: 1_400_000, [BANK.id]: 2_000_000 },
    })
    const cashWith = withBaseline.find((fund) => fund.fundId === CASH.id)

    // The declared figure plus only what happened after it. The 2026 entry is inside
    // the carried balance already and must not be counted twice.
    expect(cashWith?.openingBalancePaise).toBe(1_400_000)
    expect(cashWith?.balancePaise).toBe(1_400_000 + 50_000)
  })

  it('starts a fund the opening does not mention at zero', () => {
    // A fund created after the year was opened. Zero is right: the club declared what
    // it held, and this was not part of it.
    const balances = fundBalances(FUNDS, [], '2028-03-31', {
      asOf: '2027-04-01',
      balances: { [CASH.id]: 100_000 },
    })

    expect(balances.find((fund) => fund.fundId === BANK.id)?.balancePaise).toBe(0)
  })
})

describe('suggesting the carry-forward', () => {
  const history = [
    makeTransaction({ date: '2026-05-01', kind: 'income', fundId: CASH.id, amountPaise: 300_000 }),
    makeTransaction({ date: '2027-01-10', kind: 'expense', fundId: CASH.id, amountPaise: 100_000 }),
    // After the year being closed — must not be included.
    makeTransaction({ date: '2027-05-01', kind: 'income', fundId: CASH.id, amountPaise: 700_000 }),
  ]

  it('is what the ledger says on 31 March of the year being closed', () => {
    const suggestion = suggestCarryForward({
      financialYear: '2027-28',
      funds: FUNDS,
      transactions: history,
      openings: [],
    })

    expect(suggestion.fromYear).toBe('2026-27')

    const cash = suggestion.balances.find((fund) => fund.fundId === CASH.id)
    expect(cash?.balancePaise).toBe(500_000 + 300_000 - 100_000)
    // The May 2027 entry belongs to the new year and is excluded.
    expect(suggestion.totalPaise).toBe(totalFundsPaise(suggestion.balances))
  })

  it('counts on from the previous year’s declared opening, not from the beginning', () => {
    const suggestion = suggestCarryForward({
      financialYear: '2027-28',
      funds: FUNDS,
      transactions: history,
      openings: [opening('2026-27', { [CASH.id]: 10_000, [BANK.id]: 0 })],
    })

    const cash = suggestion.balances.find((fund) => fund.fundId === CASH.id)
    expect(cash?.balancePaise).toBe(10_000 + 300_000 - 100_000)
  })

  it('warns how many entries in the year are still unapproved', () => {
    // They are not in the figure, so a committee adopting it should know they exist.
    const suggestion = suggestCarryForward({
      financialYear: '2027-28',
      funds: FUNDS,
      transactions: [
        ...history,
        makeTransaction({ date: '2027-02-01', status: 'pending', amountPaise: 50_000 }),
      ],
      openings: [],
    })

    expect(suggestion.pendingCount).toBe(1)
  })
})

describe('asking the club to open a year', () => {
  const history = [makeTransaction({ date: '2026-05-01', amountPaise: 100_000 })]

  it('asks once the year has turned and nothing has been declared', () => {
    expect(needsOpening({ today: '2027-04-02', transactions: history, openings: [] })).toBe(
      '2027-28'
    )
  })

  it('says nothing while the year is still running', () => {
    // Quiet for eleven months of every twelve, which is the whole design of the panel.
    expect(needsOpening({ today: '2027-03-31', transactions: history, openings: [] })).toBeNull()
  })

  it('says nothing once the year has been opened', () => {
    expect(
      needsOpening({
        today: '2027-04-02',
        transactions: history,
        openings: [opening('2027-28', {})],
      })
    ).toBeNull()
  })

  it('does not nag a club in its first year, with nothing to carry', () => {
    expect(
      needsOpening({
        today: '2026-08-01',
        transactions: [makeTransaction({ date: '2026-05-01' })],
        openings: [],
      })
    ).toBeNull()
  })

  it('ignores unapproved entries when deciding there is something to carry', () => {
    expect(
      needsOpening({
        today: '2027-04-02',
        transactions: [makeTransaction({ date: '2026-05-01', status: 'pending' })],
        openings: [],
      })
    ).toBeNull()
  })
})
