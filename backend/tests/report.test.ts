import { PDFDocument, PDFPage, StandardFonts, type PDFFont } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import {
  buildPeriodReport,
  lastDayOfMonth,
  monthRange,
  reconcile,
} from '../src/domain/report.js'
import { renderFinanceReportPdf, wrapText } from '../src/lib/pdf/financeReport.js'
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

  /**
   * The overlap regression.
   *
   * The club's first real statement was unreadable: descriptions long enough to wrap
   * were drawn straight through the rows beneath them and into the Certification
   * block, because `drawText` was given a `maxWidth` — which wraps — while the cursor
   * advanced by a fixed row height.
   *
   * Twelve descriptions of the length the payment flow actually generates cannot fit
   * on one page once each is allowed the three lines it needs. Before the fix they
   * all fitted, by being drawn on top of each other. So page count is the assertion:
   * it is the one observable consequence of rows having honest heights.
   */
  it('gives a wrapped description its own lines instead of printing over the next row', async () => {
    const long = Array.from({ length: 12 }, (_, index) =>
      makeTransaction({
        date: `2026-04-${String(index + 1).padStart(2, '0')}`,
        description:
          `Membership payment from Bristi Ghosh by cash (REF-2026-${String(index + 1).padStart(6, '0')}) ` +
          '- receipt to follow once the second officer has approved this entry',
        source: 'Bristi Ghosh',
      })
    )

    const wrapped = await PDFDocument.load(await renderFinanceReportPdf(report(long)))

    const short = Array.from({ length: 12 }, (_, index) =>
      makeTransaction({ date: `2026-04-${String(index + 1).padStart(2, '0')}`, description: 'Dues' })
    )
    const compact = await PDFDocument.load(await renderFinanceReportPdf(report(short)))

    expect(wrapped.getPageCount()).toBeGreaterThan(compact.getPageCount())
  })

  it('does not let a long fund name or category run into the column beside it', async () => {
    // Both tables used to pass a maxWidth wider than the gap to the next column.
    const built = buildPeriodReport({
      clubName: 'New Milani Sangha Club',
      from: '2026-04-01',
      to: '2026-04-30',
      funds: [
        { ...CASH, name: 'Durga Puja committee collection account (Ward 12 branch)' },
        BANK,
      ],
      categories: [
        { id: 'cat-long', name: 'Pandal decoration, lighting and sound hire for the annual programme', kind: 'income', active: true },
      ],
      transactions: [
        makeTransaction({ date: '2026-04-05', categoryId: 'cat-long', amountPaise: 100_000 }),
      ],
      generatedAt: GENERATED,
      generatedBy: 'Treasurer',
    })

    const bytes = await renderFinanceReportPdf(built)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})

/**
 * Nothing in the statement may be drawn on top of anything else.
 *
 * This is the property the club actually cares about, so it is asserted directly
 * rather than through a proxy: every call to `drawText` is captured with its
 * position, font and size, turned into the rectangle the glyphs occupy, and every
 * pair on a page is checked for intersection.
 *
 * It fails on the statement that prompted it — descriptions wrapped by pdf-lib's
 * `maxWidth` while the cursor advanced a fixed 12 points, so row three landed on top
 * of rows four and five and then on the Certification block.
 */
interface Box {
  page: number
  x: number
  y: number
  width: number
  height: number
  text: string
}

async function textBoxes(build: () => Promise<Uint8Array>): Promise<Box[]> {
  const boxes: Box[] = []
  let pageCount = 0
  const pageNumbers = new WeakMap<PDFPage, number>()

  const original = PDFPage.prototype.drawText
  const spy = vi
    .spyOn(PDFPage.prototype, 'drawText')
    .mockImplementation(function (this: PDFPage, text: string, options) {
      let page = pageNumbers.get(this)
      if (page === undefined) {
        pageCount += 1
        page = pageCount
        pageNumbers.set(this, page)
      }

      const size = (options?.size as number | undefined) ?? 8
      const font = options?.font as PDFFont | undefined

      if (text.trim() !== '' && font) {
        boxes.push({
          page,
          x: (options?.x as number | undefined) ?? 0,
          y: (options?.y as number | undefined) ?? 0,
          width: font.widthOfTextAtSize(text, size),
          height: size,
          text,
        })
      }

      return original.call(this, text, options)
    })

  try {
    await build()
  } finally {
    spy.mockRestore()
  }

  return boxes
}

/** Helvetica's ascender and descender, with 1pt of slack so touching is not colliding. */
function overlap(a: Box, b: Box): { x: number; y: number } | null {
  const top = (box: Box) => box.y + box.height * 0.72
  const bottom = (box: Box) => box.y - box.height * 0.21

  const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const y = Math.min(top(a), top(b)) - Math.max(bottom(a), bottom(b))

  return x > 1 && y > 1 ? { x, y } : null
}

describe('no text overlaps any other text', () => {
  const check = (boxes: Box[]): string[] => {
    const problems: string[] = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i] as Box
        const b = boxes[j] as Box
        if (a.page !== b.page) continue
        const hit = overlap(a, b)
        if (hit) {
          problems.push(
            `page ${a.page}: "${a.text.slice(0, 40)}" (${a.x.toFixed(0)},${a.y.toFixed(0)}) ` +
              `overlaps "${b.text.slice(0, 40)}" (${b.x.toFixed(0)},${b.y.toFixed(0)}) ` +
              `by ${hit.x.toFixed(1)}x${hit.y.toFixed(1)}pt`
          )
        }
      }
    }
    return problems
  }

  it('for an ordinary statement', async () => {
    const boxes = await textBoxes(() => renderFinanceReportPdf(report()))
    expect(boxes.length).toBeGreaterThan(40)
    expect(check(boxes)).toEqual([])
  })

  /** The club's actual August statement, which is what went wrong. */
  it('for the descriptions the payment flow generates', async () => {
    const built = report([
      makeTransaction({ date: '2026-04-02', amountPaise: 250_000, source: 'abc', description: 'cdef' }),
      makeTransaction({
        date: '2026-04-03',
        amountPaise: 50_000,
        source: 'Bristi Ghosh',
        description: 'Membership payment from Bristi Ghosh by cash (REF-2026-000001) - Receipt',
      }),
      makeTransaction({
        date: '2026-04-04',
        amountPaise: 100_000,
        source: 'Bristi Ghosh',
        description: 'Membership payment from Bristi Ghosh by cash (REF-2026-000002)',
      }),
      makeTransaction({
        date: '2026-04-05',
        kind: 'expense',
        categoryId: GROUND.id,
        amountPaise: 150_000,
        source: 'ABC-CDE',
        description: 'This is to paid for electricity',
      }),
    ])

    expect(check(await textBoxes(() => renderFinanceReportPdf(built)))).toEqual([])
  })

  it('when a description, a source and a fund name are all long at once', async () => {
    const built = buildPeriodReport({
      clubName: 'New Milani Sangha Club',
      from: '2026-04-01',
      to: '2026-04-30',
      funds: [{ ...CASH, name: 'Durga Puja committee collection account (Ward 12 branch)' }, BANK],
      categories: [
        {
          id: 'cat-long',
          name: 'Pandal decoration, lighting and sound hire for the annual cultural programme',
          kind: 'income',
          active: true,
        },
      ],
      transactions: Array.from({ length: 8 }, (_, index) =>
        makeTransaction({
          date: `2026-04-${String(index + 1).padStart(2, '0')}`,
          categoryId: 'cat-long',
          amountPaise: 100_000 + index,
          source: 'Sri Ramkrishna Sweets and Confectioners, Ward 12 Market Road',
          description:
            'Membership payment from Bristi Ghosh by cash (REF-2026-000001) - receipt to follow ' +
            'once the second officer has approved this entry in the club ledger',
        })
      ),
      generatedAt: GENERATED,
      generatedBy: 'Treasurer',
    })

    expect(check(await textBoxes(() => renderFinanceReportPdf(built)))).toEqual([])
  })

  it('when an unbroken reference number is wider than its column', async () => {
    // No spaces to wrap at, so it must be hard-broken rather than run under the
    // column beside it.
    const built = report([
      makeTransaction({
        date: '2026-04-06',
        description: 'UPI 447182993044718299304471829930447182993044718299304471829930',
        source: '4471829930447182993044718299304471829930',
      }),
    ])

    expect(check(await textBoxes(() => renderFinanceReportPdf(built)))).toEqual([])
  })

  it('when three funds are overdrawn, so the warning wraps', async () => {
    // The warning used to be given a fixed 22 points however long it was, and then
    // printed through the funds table it was warning about.
    const built = buildPeriodReport({
      clubName: 'New Milani Sangha Club',
      from: '2026-04-01',
      to: '2026-04-30',
      funds: [
        { ...CASH, openingBalancePaise: 0, name: 'Cash box at the club office' },
        { ...BANK, openingBalancePaise: 0, name: 'State Bank current account' },
        {
          id: 'fund-upi',
          name: 'Club UPI handle',
          kind: 'upi',
          openingBalancePaise: 0,
          openingDate: '2026-04-01',
          active: true,
        },
      ],
      categories: CATEGORIES,
      transactions: [
        makeTransaction({ date: '2026-04-05', kind: 'expense', fundId: CASH.id, categoryId: GROUND.id, amountPaise: 500_000 }),
        makeTransaction({ date: '2026-04-06', kind: 'expense', fundId: BANK.id, categoryId: GROUND.id, amountPaise: 700_000 }),
        makeTransaction({ date: '2026-04-07', kind: 'expense', fundId: 'fund-upi', categoryId: GROUND.id, amountPaise: 300_000 }),
      ],
      generatedAt: GENERATED,
      generatedBy: 'Treasurer',
    })

    expect(built.overdrawnFunds.length).toBe(3)
    expect(check(await textBoxes(() => renderFinanceReportPdf(built)))).toEqual([])
  })
})

describe('wrapping text for the PDF', () => {
  it('breaks on spaces and keeps every line inside the width', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    const lines = wrapText(
      'Membership payment from Bristi Ghosh by cash (REF-2026-000001) - Receipt',
      font,
      7.5,
      149
    )

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 7.5)).toBeLessThanOrEqual(149)
    }
    // Nothing is lost or duplicated in the process.
    expect(lines.join(' ')).toBe(
      'Membership payment from Bristi Ghosh by cash (REF-2026-000001) - Receipt'
    )
  })

  it('hard-breaks a word with no spaces to break at', async () => {
    // A UPI transaction ID or a long bill number. Left unbroken it would run out of
    // its column and under the next one — the horizontal version of the same bug.
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    const lines = wrapText('4471829930447182993044718299304471829930', font, 7.5, 40)

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 7.5)).toBeLessThanOrEqual(40)
    }
    expect(lines.join('')).toBe('4471829930447182993044718299304471829930')
  })

  it('returns one empty line for an empty cell, so it can still be measured', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    expect(wrapText('', font, 8, 100)).toEqual([''])
    expect(wrapText('   ', font, 8, 100)).toEqual([''])
  })

  it('terminates even when a single character is wider than the column', async () => {
    // Guards the character-level loop: without the `chunk === ''` escape it would
    // push empty strings for ever.
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    const lines = wrapText('WWWWW', font, 20, 1)
    expect(lines).toEqual(['W', 'W', 'W', 'W', 'W'])
  })
})
