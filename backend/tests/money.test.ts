import { describe, expect, it } from 'vitest'

import { MoneyError, formatPaise, rupeesToPaise, sumPaise } from '../src/domain/money.js'

describe('rupeesToPaise', () => {
  it('converts whole rupees and paise', () => {
    expect(rupeesToPaise('1500')).toBe(150_000)
    expect(rupeesToPaise('1500.50')).toBe(150_050)
    expect(rupeesToPaise('0.05')).toBe(5)
    expect(rupeesToPaise('1500.5')).toBe(150_050)
  })

  it('accepts the formatting a treasurer would actually type', () => {
    expect(rupeesToPaise(' ₹1,23,456.78 ')).toBe(12_345_678)
    expect(rupeesToPaise('1,500')).toBe(150_000)
  })

  it('accepts numbers', () => {
    expect(rupeesToPaise(1500)).toBe(150_000)
    expect(rupeesToPaise(1500.5)).toBe(150_050)
  })

  it('rejects more precision than paise instead of rounding it away', () => {
    // Silently turning 10.999 into 11.00 is how a ledger stops matching a bank.
    expect(() => rupeesToPaise('10.999')).toThrow(MoneyError)
    expect(() => rupeesToPaise(10.999)).toThrow(MoneyError)
  })

  it('rejects negatives, blanks and nonsense', () => {
    expect(() => rupeesToPaise('-100')).toThrow(MoneyError)
    expect(() => rupeesToPaise('')).toThrow(MoneyError)
    expect(() => rupeesToPaise('   ')).toThrow(MoneyError)
    expect(() => rupeesToPaise('abc')).toThrow(MoneyError)
    expect(() => rupeesToPaise('1e5')).toThrow(MoneyError)
    expect(() => rupeesToPaise(Number.NaN)).toThrow(MoneyError)
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
  })

  it('rejects an amount beyond the sanity limit', () => {
    expect(() => rupeesToPaise('100000001')).toThrow(MoneyError)
  })
})

describe('formatPaise', () => {
  it('groups in the Indian convention', () => {
    expect(formatPaise(12_345_678)).toBe('₹1,23,456.78')
    expect(formatPaise(150_000)).toBe('₹1,500.00')
    expect(formatPaise(5)).toBe('₹0.05')
  })

  it('handles zero and negatives', () => {
    expect(formatPaise(0)).toBe('₹0.00')
    expect(formatPaise(-150_050)).toBe('-₹1,500.50')
  })

  it('can omit the symbol, for the PDF where the glyph is unavailable', () => {
    expect(formatPaise(150_000, { withSymbol: false })).toBe('1,500.00')
  })

  it('round-trips through rupeesToPaise without drift', () => {
    for (const paise of [1, 99, 100, 12_345_678, 5_00_00_000]) {
      expect(rupeesToPaise(formatPaise(paise, { withSymbol: false }))).toBe(paise)
    }
  })
})

describe('sumPaise', () => {
  it('adds exactly where floating-point rupees would not', () => {
    // 0.1 + 0.2 !== 0.3 in float; in paise it is simply 10 + 20 === 30.
    expect(sumPaise([10, 20])).toBe(30)
    expect(sumPaise([rupeesToPaise('0.10'), rupeesToPaise('0.20')])).toBe(rupeesToPaise('0.30'))
  })

  it('is zero for an empty list', () => {
    expect(sumPaise([])).toBe(0)
  })

  it('refuses non-integer input rather than producing a fraction of a paisa', () => {
    expect(() => sumPaise([10.5, 20])).toThrow(MoneyError)
  })
})
