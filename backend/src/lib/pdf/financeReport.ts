import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import { REQUIRED_APPROVALS } from '../../config/constants.js'
import { formatPaise } from '../../domain/money.js'
import { reconcile, type PeriodReport } from '../../domain/report.js'
import type { Rollup } from '../../domain/ledger.js'

/**
 * Renders a period financial statement as a PDF.
 *
 * Built with pdf-lib's standard fonts, which are WinAnsi-encoded: they cannot
 * draw '₹'. Amounts are therefore prefixed 'Rs.' in the PDF (see `money()`), and
 * every string drawn is passed through `safe()` to strip characters the encoder
 * would throw on. A report that crashes on an em dash in a description is not a
 * report the treasurer can rely on.
 *
 * ## Why the text is wrapped here rather than by pdf-lib
 *
 * `drawText` takes a `maxWidth` and wraps to it, and that is a trap: it wraps but
 * reports nothing back, so the caller has no idea how tall the result was. Every
 * table here used to pass `maxWidth` and then advance the cursor by a fixed row
 * height, which is correct only while every cell fits on one line. It did not: a
 * description reading "Membership payment from Bristi Ghosh by cash
 * (REF-2026-000001) - Receipt" wrapped to three lines and printed straight through
 * the two rows beneath it and into the Certification block. The club's first real
 * statement was unreadable.
 *
 * So wrapping is measured before anything is drawn — `wrapText` returns the lines,
 * the row is as tall as its tallest cell, and the cursor moves by that. Nothing
 * passes `maxWidth` to `drawText` any more; a cell that needs two lines gets two
 * lines of space.
 */

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 42

const INK = rgb(0.11, 0.09, 0.08)
const MUTED = rgb(0.45, 0.42, 0.38)
const BRAND = rgb(0.06, 0.24, 0.18)
const RULE = rgb(0.85, 0.83, 0.79)
const POSITIVE = rgb(0.08, 0.45, 0.3)
const NEGATIVE = rgb(0.7, 0.15, 0.12)

/** WinAnsi cannot encode ₹, em dashes or most non-Latin text. */
function safe(text: string): string {
  return text
    .replace(/₹/g, 'Rs.')
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?')
}

function money(paise: number): string {
  return safe(formatPaise(paise, { withSymbol: false }))
}

/** Multiple of the font size used as the distance between wrapped lines. */
const LINE_SPACING = 1.3

/**
 * Break text into lines that each fit `maxWidth`.
 *
 * Greedy word wrap, with one thing that matters more than it looks: a single word
 * wider than the column is broken by characters. Club data is full of them — a UPI
 * transaction ID, a long bill number, `REF-2026-000001` — and a word left unbroken
 * runs out of its column and under the next one, which is the horizontal version of
 * exactly the bug this module was fixing.
 *
 * Always returns at least one line, so a caller can measure an empty cell.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const widthOf = (value: string) => font.widthOfTextAtSize(value, size)
  const words = text.split(/\s+/).filter((word) => word !== '')

  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`

    if (widthOf(candidate) <= maxWidth) {
      line = candidate
      continue
    }

    // No reset to '' here: every path below assigns `line` before it is read again.
    if (line !== '') lines.push(line)

    if (widthOf(word) <= maxWidth) {
      line = word
      continue
    }

    let chunk = ''
    for (const character of word) {
      // `chunk === ''` guarantees progress: if even one character is wider than the
      // column, it is placed and allowed to overflow rather than looping forever.
      if (chunk === '' || widthOf(chunk + character) <= maxWidth) {
        chunk += character
        continue
      }
      lines.push(chunk)
      chunk = character
    }
    line = chunk
  }

  if (line !== '') lines.push(line)

  return lines.length > 0 ? lines : ['']
}

/** How tall `text` will be once wrapped, in points. */
function heightOf(text: string, font: PDFFont, size: number, maxWidth: number): number {
  return wrapText(text, font, size, maxWidth).length * size * LINE_SPACING
}

interface TextStyle {
  x: number
  size: number
  font: PDFFont
  color: ReturnType<typeof rgb>
  maxWidth: number
  /** Right-aligned within [x, x + maxWidth]. Used for amount columns. */
  align?: 'left' | 'right'
}

/**
 * Draw wrapped text with its top line at `y`, and return the height it consumed.
 *
 * The return value is the whole point: every caller uses it to decide where the
 * next thing goes, which is what stops one block being drawn on top of another.
 */
function drawWrapped(page: PDFPage, text: string, y: number, style: TextStyle): number {
  const lines = wrapText(text, style.font, style.size, style.maxWidth)
  const step = style.size * LINE_SPACING

  lines.forEach((line, index) => {
    const offset =
      style.align === 'right' ? style.maxWidth - style.font.widthOfTextAtSize(line, style.size) : 0

    page.drawText(line, {
      x: style.x + offset,
      y: y - index * step,
      size: style.size,
      font: style.font,
      color: style.color,
    })
  })

  return lines.length * step
}

interface Cursor {
  page: PDFPage
  y: number
  pageNumber: number
}

/**
 * A table column, positioned by accumulating widths rather than by hand-written
 * offsets.
 *
 * The old code kept a list of x positions and a separate list of `maxWidth`s, which
 * could — and did — disagree: the description column started 120pt before the next
 * one but was allowed 115pt of text plus no gutter, so long values touched the
 * column beside them. Deriving x from the widths makes that impossible to express.
 */
interface Column {
  header: string
  width: number
  align?: 'left' | 'right'
}

const GUTTER = 6

function positionsOf(columns: readonly Column[]): number[] {
  const positions: number[] = []
  let x = MARGIN
  for (const column of columns) {
    positions.push(x)
    x += column.width + GUTTER
  }
  return positions
}

/**
 * How much of the statement to print.
 *
 * **summary** — the club's position in categories. Every membership payment is one
 * line under "Membership fees" rather than one line per member, which is the whole
 * point: the by-source breakdown and the entry list both name individual members,
 * and a page of subscriptions is not what a committee meeting is for. This is the
 * version to read out, circulate, or pin to the noticeboard.
 *
 * **detailed** — everything, entry by entry, for the person checking the books
 * against the bank statement.
 *
 * Both are built from the same `PeriodReport`, so the figures at the top of the two
 * documents are identical by construction. Only how much is shown differs.
 */
export type ReportDetail = 'summary' | 'detailed'

export async function renderFinanceReportPdf(
  report: PeriodReport,
  options: { detail?: ReportDetail } = {}
): Promise<Uint8Array> {
  const detail = options.detail ?? 'detailed'

  const pdf = await PDFDocument.create()
  pdf.setTitle(
    `${report.club.name} — ${detail} financial statement ${report.period.label}`
  )
  pdf.setSubject('Period financial statement')
  pdf.setProducer('Milani Sangha Club platform')
  pdf.setCreationDate(new Date(report.generatedAt))

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const cursor: Cursor = { page: pdf.addPage([A4.width, A4.height]), y: 0, pageNumber: 1 }
  cursor.y = A4.height - MARGIN

  drawHeader(cursor, report, detail, bold, regular)
  drawSummary(cursor, report, bold, regular)
  drawFunds(cursor, report, bold, regular, pdf)
  drawRollup(cursor, 'Income by category', report.incomeByCategory, bold, regular, pdf)
  drawRollup(cursor, 'Expenditure by category', report.expenseByCategory, bold, regular, pdf)

  if (detail === 'detailed') {
    drawRollup(cursor, 'Collections by source', report.incomeBySource, bold, regular, pdf)
    drawRollup(cursor, 'Payments by recipient', report.expenseBySource, bold, regular, pdf)
    drawTransactions(cursor, report, bold, regular, pdf)
  } else {
    drawSummaryNote(cursor, report, bold, regular, pdf)
  }

  drawSignatures(cursor, bold, regular, pdf)

  // Page numbers can only be written once the total is known.
  const pages = pdf.getPages()
  pages.forEach((page, index) => {
    page.drawText(safe(`Page ${index + 1} of ${pages.length}`), {
      x: A4.width - MARGIN - 70,
      y: MARGIN - 18,
      size: 7.5,
      font: regular,
      color: MUTED,
    })
    page.drawText(safe(`${report.club.name} - ${report.period.label}`), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      font: regular,
      color: MUTED,
    })
  })

  return pdf.save()
}

/** Starts a new page when the next block would not fit. */
function ensureSpace(cursor: Cursor, needed: number, pdf: PDFDocument): void {
  if (cursor.y - needed > MARGIN + 10) return
  cursor.page = pdf.addPage([A4.width, A4.height])
  cursor.pageNumber += 1
  cursor.y = A4.height - MARGIN
}

function drawHeader(
  cursor: Cursor,
  report: PeriodReport,
  detail: ReportDetail,
  bold: PDFFont,
  regular: PDFFont
): void {
  const { page } = cursor

  page.drawRectangle({
    x: 0,
    y: A4.height - 96,
    width: A4.width,
    height: 96,
    color: BRAND,
  })

  page.drawText(safe(report.club.name), {
    x: MARGIN,
    y: A4.height - 46,
    size: 17,
    font: bold,
    color: rgb(1, 1, 1),
  })
  // Which of the two this is, on the face of it. Two documents covering the same
  // period with different totals visible is exactly the confusion to head off.
  page.drawText(safe(detail === 'summary' ? 'Financial statement — summary' : 'Financial statement — detailed'), {
    x: MARGIN,
    y: A4.height - 65,
    size: 10,
    font: regular,
    color: rgb(0.85, 0.93, 0.89),
  })
  page.drawText(safe(report.period.label), {
    x: MARGIN,
    y: A4.height - 82,
    size: 11,
    font: bold,
    color: rgb(0.96, 0.8, 0.35),
  })

  const generated = new Date(report.generatedAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })
  const meta = [`Generated ${generated}`, `By ${report.generatedBy}`]
  meta.forEach((line, index) => {
    const width = regular.widthOfTextAtSize(safe(line), 8)
    page.drawText(safe(line), {
      x: A4.width - MARGIN - width,
      y: A4.height - 46 - index * 11,
      size: 8,
      font: regular,
      color: rgb(0.85, 0.93, 0.89),
    })
  })

  cursor.y = A4.height - 96 - 26
}

function drawSectionTitle(cursor: Cursor, title: string, bold: PDFFont): void {
  cursor.page.drawText(safe(title), {
    x: MARGIN,
    y: cursor.y,
    size: 11,
    font: bold,
    color: BRAND,
  })
  cursor.y -= 6
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: A4.width - MARGIN, y: cursor.y },
    thickness: 0.75,
    color: RULE,
  })
  cursor.y -= 16
}

function drawSummary(
  cursor: Cursor,
  report: PeriodReport,
  bold: PDFFont,
  regular: PDFFont
): void {
  drawSectionTitle(cursor, 'Summary', bold)

  const cells: Array<{ label: string; value: string; colour?: typeof INK }> = [
    { label: 'Opening balance', value: money(report.openingBalancePaise) },
    { label: 'Total income', value: money(report.totals.incomePaise), colour: POSITIVE },
    { label: 'Total expenditure', value: money(report.totals.expensePaise), colour: NEGATIVE },
    {
      label: 'Surplus / deficit',
      value: money(report.totals.netPaise),
      colour: report.totals.netPaise >= 0 ? POSITIVE : NEGATIVE,
    },
    { label: 'Closing balance', value: money(report.closingBalancePaise) },
    { label: 'Entries in period', value: String(report.totals.transactionCount) },
  ]

  const columnWidth = (A4.width - MARGIN * 2) / 3
  const rowHeight = 38

  cells.forEach((cell, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    const x = MARGIN + column * columnWidth
    const y = cursor.y - row * rowHeight

    cursor.page.drawText(safe(cell.label), { x, y, size: 8, font: regular, color: MUTED })
    cursor.page.drawText(cell.value, {
      x,
      y: y - 14,
      size: 13,
      font: bold,
      color: cell.colour ?? INK,
    })
  })

  cursor.y -= rowHeight * Math.ceil(cells.length / 3) + 6

  /**
   * The notes below are the ones most likely to be long, and each used to advance
   * the cursor by a fixed 20-odd points however many lines it took. Three overdrawn
   * funds is enough to make the warning wrap, and it then printed through the funds
   * table beneath it — hiding the very figures it was warning about.
   */
  const note = (text: string, font: PDFFont, colour: ReturnType<typeof rgb>) => {
    const used = drawWrapped(cursor.page, safe(text), cursor.y, {
      x: MARGIN,
      size: 7.5,
      font,
      color: colour,
      maxWidth: A4.width - MARGIN * 2,
    })
    cursor.y -= used + 8
  }

  const check = reconcile(report)
  if (!check.balanced) {
    // Flagged on the face of the statement, not buried: an unbalanced statement
    // that looks tidy is a trap for whoever signs it.
    note(
      `Note: opening + income - expenditure does not equal the closing balance. ` +
        `Difference ${money(check.differencePaise)}. Check for an opening balance dated inside this period.`,
      bold,
      NEGATIVE
    )
  }

  if (report.overdrawnFunds.length > 0) {
    const names = report.overdrawnFunds
      .map((fund) => `${fund.fundName} (${money(fund.balancePaise)})`)
      .join(', ')
    note(
      `WARNING: ${report.overdrawnFunds.length} fund${report.overdrawnFunds.length === 1 ? '' : 's'} ` +
        `show a balance below zero - ${names}. Check the opening balance and look for a duplicated import.`,
      bold,
      NEGATIVE
    )
  }

  if (report.pendingCount > 0) {
    note(
      `${report.pendingCount} entr${report.pendingCount === 1 ? 'y is' : 'ies are'} awaiting a second officer's approval and ` +
        `are NOT included in these figures.`,
      regular,
      MUTED
    )
  }

  cursor.y -= 6
}

function drawFunds(
  cursor: Cursor,
  report: PeriodReport,
  bold: PDFFont,
  regular: PDFFont,
  pdf: PDFDocument
): void {
  ensureSpace(cursor, 60 + report.fundBalances.length * 18, pdf)
  drawSectionTitle(cursor, 'Where the money is held', bold)

  // 185 + 4×74 + 4 gutters = 505 of the 511.28 available.
  const columns: Column[] = [
    { header: 'Fund', width: 185 },
    { header: 'Opening', width: 74, align: 'right' },
    { header: 'In', width: 74, align: 'right' },
    { header: 'Out', width: 74, align: 'right' },
    { header: 'Balance', width: 74, align: 'right' },
  ]
  const positions = positionsOf(columns)
  const SIZE = 8.5

  columns.forEach((column, index) => {
    drawWrapped(cursor.page, safe(column.header), cursor.y, {
      x: positions[index] ?? MARGIN,
      size: 8,
      font: bold,
      color: MUTED,
      maxWidth: column.width,
      ...(column.align ? { align: column.align } : {}),
    })
  })
  cursor.y -= 14

  for (const fund of report.fundBalances) {
    const values = [
      safe(`${fund.fundName} (${fund.kind})`),
      money(fund.openingBalancePaise),
      money(fund.inPaise),
      money(fund.outPaise),
      money(fund.balancePaise),
    ]

    // Measure before drawing: a club with a long fund name — "Durga Puja committee
    // collection account" — needs two lines, and the row has to be that tall.
    const rowHeight = Math.max(
      ...values.map((value, index) =>
        heightOf(value, index === 4 ? bold : regular, SIZE, columns[index]?.width ?? 74)
      )
    )

    ensureSpace(cursor, rowHeight + 6, pdf)

    values.forEach((value, index) => {
      const column = columns[index]
      drawWrapped(cursor.page, value, cursor.y, {
        x: positions[index] ?? MARGIN,
        size: SIZE,
        font: index === 4 ? bold : regular,
        color: INK,
        maxWidth: column?.width ?? 74,
        ...(column?.align ? { align: column.align } : {}),
      })
    })

    cursor.y -= rowHeight + 4
  }

  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y + 6 },
    end: { x: A4.width - MARGIN, y: cursor.y + 6 },
    thickness: 0.75,
    color: RULE,
  })
  cursor.page.drawText(safe('Total held'), { x: MARGIN, y: cursor.y - 6, size: 9, font: bold, color: INK })
  drawWrapped(cursor.page, money(report.closingBalancePaise), cursor.y - 6, {
    x: positions[4] ?? MARGIN,
    size: 9,
    font: bold,
    color: BRAND,
    maxWidth: columns[4]?.width ?? 74,
    align: 'right',
  })
  cursor.y -= 30
}

function drawRollup(
  cursor: Cursor,
  title: string,
  rows: Rollup[],
  bold: PDFFont,
  regular: PDFFont,
  pdf: PDFDocument
): void {
  if (rows.length === 0) return

  ensureSpace(cursor, 60 + Math.min(rows.length, 6) * 18, pdf)
  drawSectionTitle(cursor, title, bold)

  const LABEL_WIDTH = 200
  const barX = MARGIN + 300
  const barWidth = 130
  const SIZE = 8.5

  for (const row of rows) {
    // A category or source is free text a committee member typed, so it can be as
    // long as they like — "Durga Puja pandal decoration and lighting" does not fit.
    const label = safe(row.label)
    const rowHeight = Math.max(heightOf(label, regular, SIZE, LABEL_WIDTH), SIZE * LINE_SPACING)

    ensureSpace(cursor, rowHeight + 6, pdf)

    drawWrapped(cursor.page, label, cursor.y, {
      x: MARGIN,
      size: SIZE,
      font: regular,
      color: INK,
      maxWidth: LABEL_WIDTH,
    })
    cursor.page.drawText(`${row.count}`, {
      x: MARGIN + 215,
      y: cursor.y,
      size: 8,
      font: regular,
      color: MUTED,
    })

    // A small bar makes the shape of the money visible at a glance.
    cursor.page.drawRectangle({
      x: barX,
      y: cursor.y - 1,
      width: barWidth,
      height: 7,
      color: rgb(0.93, 0.92, 0.9),
    })
    cursor.page.drawRectangle({
      x: barX,
      y: cursor.y - 1,
      width: Math.max(1, (barWidth * row.sharePercent) / 100),
      height: 7,
      color: BRAND,
    })

    const amount = money(row.amountPaise)
    const width = bold.widthOfTextAtSize(amount, SIZE)
    cursor.page.drawText(amount, {
      x: A4.width - MARGIN - width,
      y: cursor.y,
      size: SIZE,
      font: bold,
      color: INK,
    })

    cursor.y -= rowHeight + 4
  }

  cursor.y -= 10
}

function drawTransactions(
  cursor: Cursor,
  report: PeriodReport,
  bold: PDFFont,
  regular: PDFFont,
  pdf: PDFDocument
): void {
  ensureSpace(cursor, 80, pdf)
  drawSectionTitle(cursor, `Entries in this period (${report.transactions.length})`, bold)

  if (report.transactions.length === 0) {
    cursor.page.drawText(safe('No approved entries were recorded in this period.'), {
      x: MARGIN,
      y: cursor.y,
      size: 8.5,
      font: regular,
      color: MUTED,
    })
    cursor.y -= 20
    return
  }

  // 42+56+149+100+72+62 = 481, plus 5 gutters of 6 = 511, in the 511.28 available.
  const columns: Column[] = [
    { header: 'Date', width: 42 },
    { header: 'Reference', width: 56 },
    { header: 'Description', width: 149 },
    { header: 'Source', width: 100 },
    { header: 'Fund', width: 72 },
    { header: 'Amount', width: 62, align: 'right' },
  ]
  const positions = positionsOf(columns)
  const SIZE = 7.5

  const drawHeaderRow = () => {
    columns.forEach((column, index) => {
      drawWrapped(cursor.page, safe(column.header), cursor.y, {
        x: positions[index] ?? MARGIN,
        size: SIZE,
        font: bold,
        color: MUTED,
        maxWidth: column.width,
        ...(column.align ? { align: column.align } : {}),
      })
    })
    cursor.y -= 13
  }
  drawHeaderRow()

  const fundNames = new Map(report.fundBalances.map((f) => [f.fundId, f.fundName]))

  for (const transaction of report.transactions) {
    const signed =
      transaction.kind === 'expense'
        ? `- ${money(transaction.amountPaise)}`
        : transaction.kind === 'income'
          ? `+ ${money(transaction.amountPaise)}`
          : `  ${money(transaction.amountPaise)}`

    const cells = [
      transaction.date.slice(5),
      transaction.reference.replace(/^TXN-/, ''),
      safe(transaction.description),
      safe(transaction.source),
      safe(fundNames.get(transaction.fundId) ?? ''),
      signed,
    ]

    /**
     * The row is as tall as its tallest cell.
     *
     * This is the fix. Descriptions generated when an officer records a member's
     * payment are long by design — they carry the member's name, the method and the
     * declaration's reference so the ledger can be traced without this table — and
     * three lines of that used to be drawn into the two rows below it.
     */
    const rowHeight = Math.max(
      ...cells.map((value, index) => heightOf(value, regular, SIZE, columns[index]?.width ?? 70))
    )

    // Measured against the real row height rather than a guessed 16, so a tall row
    // near the foot of a page moves to the next one instead of running off it.
    if (cursor.y - rowHeight <= MARGIN + 10) {
      ensureSpace(cursor, rowHeight + 30, pdf)
      drawHeaderRow()
    }

    cells.forEach((value, index) => {
      const column = columns[index]
      drawWrapped(cursor.page, value, cursor.y, {
        x: positions[index] ?? MARGIN,
        size: SIZE,
        font: regular,
        color:
          index === 5
            ? transaction.kind === 'income'
              ? POSITIVE
              : transaction.kind === 'expense'
                ? NEGATIVE
                : MUTED
            : transaction.reverses
              ? MUTED
              : INK,
        maxWidth: column?.width ?? 70,
        ...(column?.align ? { align: column.align } : {}),
      })
    })

    cursor.y -= rowHeight + 3
  }

  cursor.y -= 14
}

/**
 * What the summary deliberately leaves out.
 *
 * A reader holding the summary must be able to tell that individual entries exist
 * and where to get them, or the missing detail looks like missing money. Naming the
 * count is what makes the two documents reconcile in someone's head.
 */
function drawSummaryNote(
  cursor: Cursor,
  report: PeriodReport,
  bold: PDFFont,
  regular: PDFFont,
  pdf: PDFDocument
): void {
  ensureSpace(cursor, 70, pdf)
  drawSectionTitle(cursor, 'About this summary', bold)

  const count = report.transactions.length

  const used = drawWrapped(
    cursor.page,
    safe(
      `This is the summary statement. The ${count} entr${count === 1 ? 'y' : 'ies'} behind these ` +
        'totals are grouped into the categories above, so members who paid a subscription appear ' +
        'once under their category rather than one line each. For the entry-by-entry version, ' +
        'including who each payment came from, print the detailed statement for the same period — ' +
        'the totals are identical.'
    ),
    cursor.y,
    { x: MARGIN, size: 8, font: regular, color: MUTED, maxWidth: A4.width - MARGIN * 2 }
  )

  cursor.y -= used + 16
}

/**
 * Signature block. A club statement is adopted at a meeting, so the printed
 * document needs somewhere for that to be recorded on paper.
 */
function drawSignatures(cursor: Cursor, bold: PDFFont, regular: PDFFont, pdf: PDFDocument): void {
  ensureSpace(cursor, 90, pdf)
  drawSectionTitle(cursor, 'Certification', bold)

  // Says what is actually true of these figures. It read "approved by two office
  // bearers each" while the club required two signatures; printing that on a
  // statement produced under one would be a false certification on a financial
  // document, which is worse than saying nothing.
  cursor.page.drawText(
    safe(
      REQUIRED_APPROVALS > 0
        ? `The figures above are drawn from entries approved by ${REQUIRED_APPROVALS + 1} office bearers each.`
        : 'The figures above are drawn from posted entries. Each was recorded by an office bearer, ' +
            'named against it in the club’s audit trail.'
    ),
    { x: MARGIN, y: cursor.y, size: 8, font: regular, color: MUTED }
  )
  cursor.y -= 40

  const roles = ['Treasurer', 'Secretary', 'President']
  const width = (A4.width - MARGIN * 2) / 3

  roles.forEach((role, index) => {
    const x = MARGIN + index * width
    cursor.page.drawLine({
      start: { x, y: cursor.y },
      end: { x: x + width - 30, y: cursor.y },
      thickness: 0.75,
      color: RULE,
    })
    cursor.page.drawText(safe(role), {
      x,
      y: cursor.y - 12,
      size: 8,
      font: regular,
      color: MUTED,
    })
  })

  cursor.y -= 30
}
