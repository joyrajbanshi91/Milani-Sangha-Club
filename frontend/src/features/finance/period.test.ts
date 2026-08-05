import { describe, expect, it } from 'vitest'

import { FIRST_FINANCIAL_YEAR } from '@/config/constants'
import {
  defaultPeriod,
  financialYearRange,
  monthRange,
  periodCoversToday,
  periodLabel,
  periodParams,
  periodYear,
  readPeriod,
  writePeriod,
  type FinancePeriod,
} from '@/features/finance/period'

/**
 * The period a finance screen shows.
 *
 * The dashboard used to be a month at a time, which meant a committee asking "how did the
 * year go" opened twelve screens and added up on paper. These cover the two halves that
 * can go wrong quietly: the arithmetic of a club year that is not a calendar year, and a
 * URL that asks for a period the club has no books for.
 */

const on = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('the span of a club year', () => {
  it('runs 1 April to 31 March', () => {
    expect(financialYearRange('2026-27')).toEqual({ from: '2026-04-01', to: '2027-03-31' })
  })

  it('ends on 31 March in a leap year too', () => {
    // February's length is the usual trap; 31 March is not affected by it.
    expect(financialYearRange('2027-28')).toEqual({ from: '2027-04-01', to: '2028-03-31' })
  })
})

describe('the span of a month', () => {
  it('ends on the last day, whatever that is', () => {
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('what goes to the API', () => {
  it('sends a month as ?month=, leaving the arithmetic to the server', () => {
    expect(periodParams({ kind: 'month', month: '2026-08' })).toEqual({ month: '2026-08' })
  })

  it('sends a year as a range, which is all a year is', () => {
    expect(periodParams({ kind: 'year', financialYear: '2026-27' })).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    })
  })
})

describe('which year a period sits in', () => {
  it('is the year itself for a year', () => {
    expect(periodYear({ kind: 'year', financialYear: '2026-27' })).toBe('2026-27')
  })

  it('puts a January month in the year before, as the club does', () => {
    expect(periodYear({ kind: 'month', month: '2027-01' })).toBe('2026-27')
    expect(periodYear({ kind: 'month', month: '2027-04' })).toBe('2027-28')
  })
})

describe('whether a closing balance may be called "now"', () => {
  const year: FinancePeriod = { kind: 'year', financialYear: '2026-27' }

  it('is true while the club is living in the period', () => {
    expect(periodCoversToday(year, on('2026-08-05'))).toBe(true)
    expect(periodCoversToday(year, on('2027-03-31'))).toBe(true)
  })

  it('is false once it has ended, so last year is not labelled "held now"', () => {
    expect(periodCoversToday(year, on('2027-04-01'))).toBe(false)
    expect(periodCoversToday({ kind: 'month', month: '2026-08' }, on('2026-09-01'))).toBe(false)
  })
})

describe('what a screen opens on', () => {
  it('is the whole of the club year, not a month of it', () => {
    expect(defaultPeriod(on('2026-08-05'))).toEqual({ kind: 'year', financialYear: '2026-27' })
  })

  it('never offers a year the club has no books for', () => {
    expect(defaultPeriod(on('2020-01-01'))).toEqual({
      kind: 'year',
      financialYear: FIRST_FINANCIAL_YEAR,
    })
  })
})

describe('reading a period out of the address bar', () => {
  const read = (query: string, today = on('2026-08-05')) =>
    readPeriod(new URLSearchParams(query), today)

  it('takes a year, so a link to a year’s figures can be sent to another bearer', () => {
    expect(read('year=2026-27')).toEqual({ kind: 'year', financialYear: '2026-27' })
  })

  it('takes a month', () => {
    expect(read('month=2026-08')).toEqual({ kind: 'month', month: '2026-08' })
  })

  it('falls back rather than showing an empty screen for a year with no books', () => {
    // A reader would take a blank dashboard for "the club has no money", which is a
    // worse answer than the current year's figures.
    expect(read('year=2019-20')).toEqual(defaultPeriod(on('2026-08-05')))
    expect(read('year=2030-31')).toEqual(defaultPeriod(on('2026-08-05')))
    expect(read('month=2019-08')).toEqual(defaultPeriod(on('2026-08-05')))
    expect(read('month=nonsense')).toEqual(defaultPeriod(on('2026-08-05')))
    expect(read('')).toEqual(defaultPeriod(on('2026-08-05')))
  })

  it('round-trips what it writes', () => {
    for (const period of [
      { kind: 'year', financialYear: '2026-27' },
      { kind: 'month', month: '2026-12' },
    ] as FinancePeriod[]) {
      expect(read(new URLSearchParams(writePeriod(period)).toString())).toEqual(period)
    }
  })
})

describe('how a period reads on screen', () => {
  it('names the twelve months a club year covers, since it is not the calendar’s', () => {
    expect(periodLabel({ kind: 'year', financialYear: '2026-27' })).toBe('April 2026 – March 2027')
  })

  it('names a month plainly', () => {
    expect(periodLabel({ kind: 'month', month: '2026-08' })).toBe('August 2026')
  })
})
