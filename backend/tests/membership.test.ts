import { describe, expect, it } from 'vitest'

import {
  duesForMonths,
  financialYearOf,
  membershipStatus,
  monthName,
  monthsBetween,
  monthsCoveredBy,
  monthsOfFinancialYear,
  validateMembershipPeriod,
} from '../src/domain/membership.js'
import type { Payment } from '../src/domain/types.js'

/**
 * The membership register.
 *
 * The club's year runs April to March, membership is ₹50 a month or ₹600 a year, and
 * every screen that says "you have paid seven months" is this file being right. The
 * arithmetic is trivial; the calendar is where the mistakes live, so most of these
 * are about January to March belonging to the year before.
 */

let counter = 0

function payment(overrides: Partial<Payment> = {}): Payment {
  counter += 1
  return {
    id: `pay-${counter}`,
    reference: `REF-2026-${String(counter).padStart(6, '0')}`,
    status: 'approved',
    memberUid: 'u-member',
    memberName: 'Ordinary Member',
    purpose: 'membership',
    method: 'upi',
    amountPaise: 5_000,
    paidOn: '2026-04-05',
    submittedAt: '2026-04-05T09:00:00.000Z',
    ...overrides,
  }
}

function covering(start: string, end: string, overrides: Partial<Payment> = {}): Payment {
  return payment({
    periodStart: start,
    periodEnd: end,
    amountPaise: duesForMonths(monthsBetween(start, end).length),
    ...overrides,
  })
}

describe('which financial year a month belongs to', () => {
  it('puts April to December in the year that starts them', () => {
    expect(financialYearOf('2026-04-01')).toBe('2026-27')
    expect(financialYearOf('2026-08')).toBe('2026-27')
    expect(financialYearOf('2026-12-31')).toBe('2026-27')
  })

  it('puts January to March in the year before — the half people get wrong', () => {
    expect(financialYearOf('2027-01-01')).toBe('2026-27')
    expect(financialYearOf('2027-03-31')).toBe('2026-27')
  })

  it('rolls over on 1 April, not 1 January', () => {
    expect(financialYearOf('2027-03-31')).toBe('2026-27')
    expect(financialYearOf('2027-04-01')).toBe('2027-28')
  })

  it('names the century correctly at a turn', () => {
    expect(financialYearOf('2099-05-01')).toBe('2099-00')
  })
})

describe('the twelve months of a year', () => {
  it('runs April to March, in order', () => {
    const months = monthsOfFinancialYear('2026-27')

    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-04')
    expect(months[8]).toBe('2026-12')
    expect(months[9]).toBe('2027-01')
    expect(months[11]).toBe('2027-03')
  })

  it('agrees with financialYearOf for every one of them', () => {
    for (const month of monthsOfFinancialYear('2026-27')) {
      expect(financialYearOf(month), month).toBe('2026-27')
    }
  })
})

describe('listing the months between two', () => {
  it('is inclusive at both ends', () => {
    expect(monthsBetween('2026-04', '2026-06')).toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('handles a single month', () => {
    expect(monthsBetween('2026-04', '2026-04')).toEqual(['2026-04'])
  })

  it('crosses a December', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
  })

  it('is empty when the order is wrong or the input is not a month', () => {
    expect(monthsBetween('2026-06', '2026-04')).toEqual([])
    expect(monthsBetween('2026-13', '2027-01')).toEqual([])
    expect(monthsBetween('April', '2026-04')).toEqual([])
  })
})

describe('what membership costs', () => {
  it('is ₹50 a month', () => {
    expect(duesForMonths(1)).toBe(5_000)
    expect(duesForMonths(7)).toBe(35_000)
  })

  it('is ₹600 for a full year', () => {
    expect(duesForMonths(12)).toBe(60_000)
  })

  it('charges nothing for no months', () => {
    expect(duesForMonths(0)).toBe(0)
    expect(duesForMonths(-3)).toBe(0)
  })

  it('bills a year plus a remainder at the two rates', () => {
    // Nobody can pay more than a year in one declaration, but the register adds up
    // months across several — a member paying 2026-27 and part of 2027-28.
    expect(duesForMonths(14)).toBe(60_000 + 2 * 5_000)
  })
})

describe('which months a payment buys', () => {
  it('is the period, for membership', () => {
    expect(monthsCoveredBy(covering('2026-04', '2026-06'))).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ])
  })

  it('is nothing for a donation, whatever period is attached', () => {
    // The API refuses a period on a donation, but the register must not depend on
    // that having held for every row already in the database.
    expect(
      monthsCoveredBy(payment({ purpose: 'donation', periodStart: '2026-04', periodEnd: '2026-04' }))
    ).toEqual([])
  })

  it('is nothing when the period is missing', () => {
    expect(monthsCoveredBy(payment({ purpose: 'membership' }))).toEqual([])
  })
})

describe('a member’s register for the year', () => {
  const year = '2026-27'

  it('shows twelve unpaid months when nothing has been paid', () => {
    const status = membershipStatus({ financialYear: year, payments: [], today: '2026-08-15' })

    expect(status.monthsPaid).toBe(0)
    expect(status.monthsUnpaid).toBe(12)
    expect(status.nothingPaid).toBe(true)
    expect(status.paidInFull).toBe(false)
    expect(status.outstandingPaise).toBe(60_000)
  })

  it('counts the months an approved payment covers', () => {
    const status = membershipStatus({
      financialYear: year,
      payments: [covering('2026-04', '2026-06')],
      today: '2026-08-15',
    })

    expect(status.monthsPaid).toBe(3)
    expect(status.monthsUnpaid).toBe(9)
    expect(status.paidPaise).toBe(15_000)
    expect(status.outstandingPaise).toBe(45_000)
  })

  it('counts a declaration nobody has verified as unpaid', () => {
    // Otherwise a member settles their year by filling in a form.
    const status = membershipStatus({
      financialYear: year,
      payments: [covering('2026-04', '2027-03', { status: 'pending_verification' })],
      today: '2026-08-15',
    })

    expect(status.monthsPaid).toBe(0)
  })

  it('ignores a declined or withdrawn declaration', () => {
    for (const status of ['rejected', 'withdrawn'] as const) {
      const register = membershipStatus({
        financialYear: year,
        payments: [covering('2026-04', '2027-03', { status })],
        today: '2026-08-15',
      })

      expect(register.monthsPaid, status).toBe(0)
    }
  })

  it('calls an unpaid month overdue only once it has begun', () => {
    const status = membershipStatus({ financialYear: year, payments: [], today: '2026-08-15' })

    // April to August have started; September to March have not.
    expect(status.monthsOverdue).toBe(5)
    expect(status.overduePaise).toBe(25_000)

    const april = status.months.find((month) => month.month === '2026-04')
    const december = status.months.find((month) => month.month === '2026-12')
    expect(april?.overdue).toBe(true)
    expect(december?.overdue).toBe(false)
  })

  it('has nothing overdue when the paid months are the ones that have begun', () => {
    const status = membershipStatus({
      financialYear: year,
      payments: [covering('2026-04', '2026-08')],
      today: '2026-08-15',
    })

    expect(status.monthsOverdue).toBe(0)
    expect(status.monthsPaid).toBe(5)
  })

  it('is paid in full for a whole year', () => {
    const status = membershipStatus({
      financialYear: year,
      payments: [covering('2026-04', '2027-03')],
      today: '2026-08-15',
    })

    expect(status.paidInFull).toBe(true)
    expect(status.monthsUnpaid).toBe(0)
    expect(status.outstandingPaise).toBe(0)
    expect(status.paidPaise).toBe(60_000)
  })

  it('adds up months paid across several declarations', () => {
    const status = membershipStatus({
      financialYear: year,
      payments: [covering('2026-04', '2026-06'), covering('2026-07', '2026-09')],
      today: '2026-10-15',
    })

    expect(status.monthsPaid).toBe(6)
  })

  it('ignores months belonging to another year', () => {
    const status = membershipStatus({
      financialYear: year,
      payments: [covering('2027-04', '2027-06')],
      today: '2026-08-15',
    })

    expect(status.monthsPaid).toBe(0)
  })

  it('points each paid month at the receipt that covers it', () => {
    const paid = covering('2026-04', '2026-06', { receiptNumber: 'RCT-2026-000001' })

    const status = membershipStatus({
      financialYear: year,
      payments: [paid],
      today: '2026-08-15',
    })

    const may = status.months.find((month) => month.month === '2026-05')
    expect(may?.paid).toBe(true)
    expect(may?.receiptNumber).toBe('RCT-2026-000001')
    expect(may?.paymentReference).toBe(paid.reference)
  })

  it('labels the year and its months the way a member would say them', () => {
    const status = membershipStatus({ financialYear: year, payments: [], today: '2026-08-15' })

    expect(status.label).toBe('April 2026 to March 2027')
    expect(status.months[0]?.label).toBe('April 2026')
    expect(status.months[11]?.label).toBe('March 2027')
  })

  it('treats March as part of the year that began the previous April', () => {
    // The register for 2026-27 must still show March 2027 as overdue on 20 March.
    const status = membershipStatus({ financialYear: year, payments: [], today: '2027-03-20' })

    expect(status.monthsOverdue).toBe(12)
    expect(monthName(status.months[11]?.month as string)).toBe('March 2027')
  })
})

describe('checking a period before a member declares it', () => {
  it('accepts a year within one financial year', () => {
    const result = validateMembershipPeriod({
      periodStart: '2026-04',
      periodEnd: '2027-03',
      existing: [],
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.months).toHaveLength(12)
  })

  it('refuses more than twelve months in one payment', () => {
    const result = validateMembershipPeriod({
      periodStart: '2026-04',
      periodEnd: '2027-05',
      existing: [],
    })

    expect(result.ok).toBe(false)
  })

  it('refuses an end before the start', () => {
    const result = validateMembershipPeriod({
      periodStart: '2026-06',
      periodEnd: '2026-04',
      existing: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/cannot be before/)
  })
})
