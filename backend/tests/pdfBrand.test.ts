import { describe, expect, it } from 'vitest'

import { amountInWords, letterheadLines, slugForFilename } from '../src/lib/pdf/brand.js'
import { receiptFilename, statementFilename } from '../src/lib/pdf/filenames.js'

/**
 * How the club's documents are worded and named.
 *
 * Two things that are pure text and easy to get quietly wrong: the amount in words on a
 * receipt, and the name a document lands under in somebody's downloads folder. Neither
 * can be checked by looking at a PDF's page count, and both are what a treasurer
 * notices first.
 */

describe('the amount in words', () => {
  /**
   * The Indian system, because that is what the receipt is in.
   *
   * "One lakh twenty thousand", not "one hundred and twenty thousand" — the second
   * reads as a translation of the document rather than the document.
   */
  it('writes ordinary subscription amounts plainly', () => {
    expect(amountInWords(5_000)).toBe('Rupees fifty only')
    expect(amountInWords(60_000)).toBe('Rupees six hundred only')
    expect(amountInWords(15_000)).toBe('Rupees one hundred and fifty only')
  })

  it('groups by lakh and crore', () => {
    expect(amountInWords(1_00_000_00)).toBe('Rupees one lakh only')
    expect(amountInWords(1_20_000_00)).toBe('Rupees one lakh twenty thousand only')
    expect(amountInWords(2_50_000_00)).toBe('Rupees two lakh fifty thousand only')
    expect(amountInWords(1_00_00_000_00)).toBe('Rupees one crore only')
    expect(amountInWords(1_23_45_678_00)).toBe(
      'Rupees one crore twenty-three lakh forty-five thousand six hundred and seventy-eight only'
    )
  })

  it('states paise only when there are any', () => {
    // A receipt for an odd amount must be exact; one for a round amount must not be
    // cluttered with "and zero paise".
    expect(amountInWords(18_450)).toBe('Rupees one hundred and eighty-four and fifty paise only')
    expect(amountInWords(60_001)).toBe('Rupees six hundred and one paise only')
    expect(amountInWords(60_000)).not.toMatch(/paise/)
  })

  it('handles the amounts nobody expects', () => {
    expect(amountInWords(0)).toBe('Rupees zero only')
    expect(amountInWords(100)).toBe('Rupees one only')
    // Nineteen and twenty are the two the naive implementation gets wrong.
    expect(amountInWords(19_00)).toBe('Rupees nineteen only')
    expect(amountInWords(20_00)).toBe('Rupees twenty only')
    expect(amountInWords(-60_000)).toBe('Minus rupees six hundred only')
  })

  it('starts with a capital, because it is a sentence on a document', () => {
    expect(amountInWords(60_000).charAt(0)).toBe('R')
  })
})

describe('the letterhead', () => {
  it('prints only what the club has actually stated', () => {
    expect(letterheadLines({ address: undefined, registrationNumber: undefined })).toEqual([])
    expect(letterheadLines({ address: '  ', registrationNumber: '' })).toEqual([])
  })

  it('labels the registration number, which a bare figure would not explain', () => {
    expect(
      letterheadLines({ address: 'Barrackpore, Kolkata 700122', registrationNumber: '50219' })
    ).toEqual(['Barrackpore, Kolkata 700122', 'Registration no. 50219'])
  })
})

describe('what a document is called', () => {
  /**
   * A name somebody can find again in six months.
   *
   * `statement.pdf`, `statement(1).pdf`, `receipt.pdf` is the state this replaces: a
   * member cannot find last April's receipt, and a committee cannot tell two
   * statements of the same period apart. Every name therefore leads with what the
   * document is and then the period it covers, which is also how a downloads folder
   * sorts them.
   */
  it('names a statement for the month it covers', () => {
    expect(
      statementFilename({ detail: 'summary', from: '2026-04-01', to: '2026-04-30' })
    ).toBe('Statement_2026-04_summary.pdf')
  })

  it('names any other period by its two dates', () => {
    expect(
      statementFilename({ detail: 'detailed', from: '2026-04-01', to: '2027-03-31' })
    ).toBe('Statement_2026-04-01_to_2027-03-31_detailed.pdf')
  })

  it('distinguishes the two statements for the same period', () => {
    // The whole reason the detail is in the name: these two documents show different
    // totals and used to arrive as statement.pdf and statement(1).pdf.
    const period = { from: '2026-04-01', to: '2026-04-30' } as const
    expect(statementFilename({ ...period, detail: 'summary' })).not.toBe(
      statementFilename({ ...period, detail: 'detailed' })
    )
  })

  it('names a receipt for the day the money was paid', () => {
    expect(receiptFilename({ receiptNumber: 'RCT-2026-000004', paidOn: '2026-06-11' })).toBe(
      'Receipt_2026-06-11_RCT-2026-000004.pdf'
    )
  })

  it('produces a name a filesystem and a browser will both accept', () => {
    expect(slugForFilename("Bristi's Club — Kolkata")).toBe('Bristis-Club-Kolkata')

    const name = receiptFilename({ receiptNumber: 'RCT/2026 000004', paidOn: '2026-06-11' })
    expect(name).not.toMatch(/[\s"*/:<>?\\|]/)
  })
})
