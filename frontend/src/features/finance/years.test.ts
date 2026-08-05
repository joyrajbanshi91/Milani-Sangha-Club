import { describe, expect, it } from 'vitest'

import { FIRST_FINANCIAL_YEAR } from '@/config/constants'
import {
  financialYearOf,
  financialYears,
  monthLabel,
  monthsOfFinancialYear,
  nextFinancialYear,
  openableYears,
  previousFinancialYear,
} from '@/features/finance/years'

/**
 * The club's years in the browser.
 *
 * These exist because a year picker got them wrong in two ways at once: it offered two
 * years before the club had any books, and it offered next year — which, being
 * openable, would have closed the year the club was living in. Both produced screens
 * that could only ever be empty or wrong.
 */

const on = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('which year a date is in', () => {
  it('puts April to December in the year that starts them', () => {
    expect(financialYearOf(on('2026-04-01'))).toBe('2026-27')
    expect(financialYearOf(on('2026-12-31'))).toBe('2026-27')
  })

  it('puts January to March in the year before', () => {
    expect(financialYearOf(on('2027-01-01'))).toBe('2026-27')
    expect(financialYearOf(on('2027-03-31'))).toBe('2026-27')
  })

  it('rolls over on 1 April', () => {
    expect(financialYearOf(on('2027-04-01'))).toBe('2027-28')
  })

  it('agrees with the backend for every month of a year', () => {
    // Both sides compute this; the shared constant is the only thing keeping them
    // honest, so the round trip is worth pinning.
    for (const month of monthsOfFinancialYear('2026-27')) {
      expect(financialYearOf(on(`${month}-15`)), month).toBe('2026-27')
    }
  })
})

describe('the years a picker offers', () => {
  it('starts at the year the club started, never earlier', () => {
    const years = financialYears(on('2026-08-05'))

    expect(years[0]).toBe(FIRST_FINANCIAL_YEAR)
    expect(years).toEqual(['2026-27'])
  })

  it('never offers a year that has not begun', () => {
    // The old picker offered next year. Choosing it on the register showed an empty
    // year, and offering it as closable would have settled the current one.
    expect(financialYears(on('2026-08-05'))).not.toContain('2027-28')
  })

  it('grows by one each April', () => {
    expect(financialYears(on('2027-03-31'))).toEqual(['2026-27'])
    expect(financialYears(on('2027-04-01'))).toEqual(['2026-27', '2027-28'])
    expect(financialYears(on('2029-06-01'))).toEqual([
      '2026-27',
      '2027-28',
      '2028-29',
      '2029-30',
    ])
  })

  it('still offers the first year if the clock is somehow before it', () => {
    // A wrong system clock should not produce an empty dropdown.
    expect(financialYears(on('2020-01-01'))).toEqual([FIRST_FINANCIAL_YEAR])
  })
})

describe('the twelve months of a year', () => {
  it('runs April to March', () => {
    const months = monthsOfFinancialYear('2026-27')

    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-04')
    expect(months[8]).toBe('2026-12')
    expect(months[9]).toBe('2027-01')
    expect(months[11]).toBe('2027-03')
  })

  it('labels a month the way a committee says it', () => {
    expect(monthLabel('2026-08')).toBe('August 2026')
    expect(monthLabel('2027-03')).toBe('March 2027')
  })
})

describe('which years can be closed', () => {
  it('excludes the club’s first year, which has nothing before it', () => {
    expect(openableYears([], on('2026-08-05'))).toEqual([])
  })

  it('offers a year once it has begun', () => {
    expect(openableYears([], on('2027-04-01'))).toEqual(['2027-28'])
  })

  it('drops a year that has already been opened', () => {
    expect(openableYears(['2027-28'], on('2028-06-01'))).toEqual(['2028-29'])
  })

  it('offers nothing when every year that has begun is open', () => {
    expect(openableYears(['2027-28', '2028-29'], on('2028-06-01'))).toEqual([])
  })
})

describe('stepping between years', () => {
  it('goes forward and back', () => {
    expect(nextFinancialYear('2026-27')).toBe('2027-28')
    expect(previousFinancialYear('2027-28')).toBe('2026-27')
  })

  it('crosses a century without losing the label', () => {
    expect(nextFinancialYear('2099-00')).toBe('2100-01')
  })
})
