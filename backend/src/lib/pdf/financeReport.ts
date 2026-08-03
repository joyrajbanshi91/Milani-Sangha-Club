import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

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

interface Cursor {
  page: PDFPage
  y: number
  pageNumber: number
}

export async function renderFinanceReportPdf(report: PeriodReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${report.club.name} — financial statement ${report.period.label}`)
  pdf.setSubject('Period financial statement')
  pdf.setProducer('Milani Sangha Club platform')
  pdf.setCreationDate(new Date(report.generatedAt))

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const cursor: Cursor = { page: pdf.addPage([A4.width, A4.height]), y: 0, pageNumber: 1 }
  cursor.y = A4.height - MARGIN

  drawHeader(cursor, report, bold, regular)
  drawSummary(cursor, report, bold, regular)
  drawFunds(cursor, report, bold, regular, pdf)
  drawRollup(cursor, 'Income by category', report.incomeByCategory, bold, regular, pdf)
  drawRollup(cursor, 'Expenditure by category', report.expenseByCategory, bold, regular, pdf)
  drawRollup(cursor, 'Collections by source', report.incomeBySource, bold, regular, pdf)
  drawRollup(cursor, 'Payments by recipient', report.expenseBySource, bold, regular, pdf)
  drawTransactions(cursor, report, bold, regular, pdf)
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

function drawHeader(cursor: Cursor, report: PeriodReport, bold: PDFFont, regular: PDFFont): void {
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
  page.drawText(safe('Financial statement'), {
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

  const check = reconcile(report)
  if (!check.balanced) {
    // Flagged on the face of the statement, not buried: an unbalanced statement
    // that looks tidy is a trap for whoever signs it.
    cursor.page.drawText(
      safe(
        `Note: opening + income - expenditure does not equal the closing balance. ` +
          `Difference ${money(check.differencePaise)}. Check for an opening balance dated inside this period.`
      ),
      { x: MARGIN, y: cursor.y, size: 7.5, font: bold, color: NEGATIVE, maxWidth: A4.width - MARGIN * 2 }
    )
    cursor.y -= 22
  }

  if (report.overdrawnFunds.length > 0) {
    const names = report.overdrawnFunds
      .map((fund) => `${fund.fundName} (${money(fund.balancePaise)})`)
      .join(', ')
    cursor.page.drawText(
      safe(
        `WARNING: ${report.overdrawnFunds.length} fund${report.overdrawnFunds.length === 1 ? '' : 's'} ` +
          `show a balance below zero - ${names}. Check the opening balance and look for a duplicated import.`
      ),
      {
        x: MARGIN,
        y: cursor.y,
        size: 7.5,
        font: bold,
        color: NEGATIVE,
        maxWidth: A4.width - MARGIN * 2,
      }
    )
    cursor.y -= 22
  }

  if (report.pendingCount > 0) {
    cursor.page.drawText(
      safe(
        `${report.pendingCount} entr${report.pendingCount === 1 ? 'y is' : 'ies are'} awaiting a second officer's approval and ` +
          `are NOT included in these figures.`
      ),
      { x: MARGIN, y: cursor.y, size: 7.5, font: regular, color: MUTED, maxWidth: A4.width - MARGIN * 2 }
    )
    cursor.y -= 20
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
  ensureSpace(cursor, 60 + report.fundBalances.length * 16, pdf)
  drawSectionTitle(cursor, 'Where the money is held', bold)

  const columns = [MARGIN, MARGIN + 190, MARGIN + 280, MARGIN + 375, MARGIN + 460]
  const headers = ['Fund', 'Opening', 'In', 'Out', 'Balance']

  headers.forEach((header, index) => {
    cursor.page.drawText(safe(header), {
      x: columns[index] ?? MARGIN,
      y: cursor.y,
      size: 8,
      font: bold,
      color: MUTED,
    })
  })
  cursor.y -= 14

  for (const fund of report.fundBalances) {
    ensureSpace(cursor, 20, pdf)
    const values = [
      `${fund.fundName} (${fund.kind})`,
      money(fund.openingBalancePaise),
      money(fund.inPaise),
      money(fund.outPaise),
      money(fund.balancePaise),
    ]
    values.forEach((value, index) => {
      cursor.page.drawText(value, {
        x: columns[index] ?? MARGIN,
        y: cursor.y,
        size: 8.5,
        font: index === 4 ? bold : regular,
        color: INK,
        maxWidth: index === 0 ? 180 : 90,
      })
    })
    cursor.y -= 15
  }

  cursor.y -= 4
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y + 6 },
    end: { x: A4.width - MARGIN, y: cursor.y + 6 },
    thickness: 0.75,
    color: RULE,
  })
  cursor.page.drawText(safe('Total held'), { x: MARGIN, y: cursor.y - 6, size: 9, font: bold, color: INK })
  cursor.page.drawText(money(report.closingBalancePaise), {
    x: columns[4] ?? MARGIN,
    y: cursor.y - 6,
    size: 9,
    font: bold,
    color: BRAND,
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

  ensureSpace(cursor, 60 + Math.min(rows.length, 6) * 16, pdf)
  drawSectionTitle(cursor, title, bold)

  const barX = MARGIN + 300
  const barWidth = 130

  for (const row of rows) {
    ensureSpace(cursor, 20, pdf)

    cursor.page.drawText(safe(row.label), {
      x: MARGIN,
      y: cursor.y,
      size: 8.5,
      font: regular,
      color: INK,
      maxWidth: 200,
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
    const width = bold.widthOfTextAtSize(amount, 8.5)
    cursor.page.drawText(amount, {
      x: A4.width - MARGIN - width,
      y: cursor.y,
      size: 8.5,
      font: bold,
      color: INK,
    })

    cursor.y -= 15
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

  const columns = [MARGIN, MARGIN + 58, MARGIN + 130, MARGIN + 250, MARGIN + 355, MARGIN + 430]
  const drawHeaderRow = () => {
    const headers = ['Date', 'Reference', 'Description', 'Source', 'Fund', 'Amount']
    headers.forEach((header, index) => {
      cursor.page.drawText(safe(header), {
        x: columns[index] ?? MARGIN,
        y: cursor.y,
        size: 7.5,
        font: bold,
        color: MUTED,
      })
    })
    cursor.y -= 13
  }
  drawHeaderRow()

  const fundNames = new Map(report.fundBalances.map((f) => [f.fundId, f.fundName]))

  for (const transaction of report.transactions) {
    if (cursor.y - 16 <= MARGIN + 10) {
      ensureSpace(cursor, 40, pdf)
      drawHeaderRow()
    }

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
    ]

    cells.forEach((value, index) => {
      cursor.page.drawText(value, {
        x: columns[index] ?? MARGIN,
        y: cursor.y,
        size: 7.5,
        font: regular,
        color: transaction.reverses ? MUTED : INK,
        maxWidth: index === 2 ? 115 : index === 3 ? 100 : 70,
      })
    })

    const width = regular.widthOfTextAtSize(signed, 7.5)
    cursor.page.drawText(signed, {
      x: A4.width - MARGIN - width,
      y: cursor.y,
      size: 7.5,
      font: regular,
      color:
        transaction.kind === 'income' ? POSITIVE : transaction.kind === 'expense' ? NEGATIVE : MUTED,
    })

    cursor.y -= 12
  }

  cursor.y -= 14
}

/**
 * Signature block. A club statement is adopted at a meeting, so the printed
 * document needs somewhere for that to be recorded on paper.
 */
function drawSignatures(cursor: Cursor, bold: PDFFont, regular: PDFFont, pdf: PDFDocument): void {
  ensureSpace(cursor, 90, pdf)
  drawSectionTitle(cursor, 'Certification', bold)

  cursor.page.drawText(
    safe('The figures above are drawn from entries approved by two office bearers each.'),
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
