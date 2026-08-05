import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import { formatPaise } from '../../domain/money.js'
import { financialYearLabel, periodLabel } from '../../domain/payments.js'
import type { Payment } from '../../domain/types.js'

/**
 * A member's receipt.
 *
 * Issued only for a payment an officer has confirmed arrived, and printed to be
 * kept: a member who has paid their subscription in cash has nothing else to show
 * for it, and "the website says I paid" is not a receipt.
 *
 * ## What is on it and why
 *
 * The **months it covers** are as important as the amount. A club argument a year
 * later is almost never about whether ₹600 was paid; it is about which year it was
 * for. So the period is on the face of the receipt, in words, along with the
 * financial year it belongs to.
 *
 * Two signatures. The **cashier** is the officer who checked the money against the
 * club's records; the **approving officer** is whoever entered it in the books. The
 * club runs with one officer able to do both, so those are often the same person and
 * the receipt says so plainly rather than pretending to a second pair of eyes it did
 * not have. Both are printed as recorded facts *and* left as ruled lines, because a
 * paper receipt in India gets signed by hand and a printed name is not a signature.
 *
 * ## Not a tax receipt
 *
 * Marked as a club receipt, deliberately without any registration or exemption
 * number. Printing an 80G reference the club may not hold would be worse than
 * printing nothing, and it is not this system's place to imply one.
 */

const A5 = { width: 595.28, height: 420.94 }
const MARGIN = 36

const INK = rgb(0.11, 0.09, 0.08)
const MUTED = rgb(0.45, 0.42, 0.38)
const BRAND = rgb(0.06, 0.24, 0.18)
const RULE = rgb(0.85, 0.83, 0.79)
const PAPER = rgb(0.99, 0.98, 0.96)

/** WinAnsi cannot encode ₹, em dashes or Bengali. Same rule as the statement. */
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

function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const METHOD_LABEL = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer / cheque' } as const
const PURPOSE_LABEL = {
  membership: 'Membership subscription',
  donation: 'Donation',
  event: 'Event payment',
  other: 'Payment',
} as const

export interface ReceiptInput {
  clubName: string
  payment: Payment
  /** ISO timestamp of printing, shown in the footer so a reprint is identifiable. */
  generatedAt: string
}

export async function renderReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const { clubName, payment } = input

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${clubName} — receipt ${payment.receiptNumber ?? payment.reference}`)
  pdf.setSubject('Payment receipt')
  pdf.setProducer('Milani Sangha Club platform')
  pdf.setCreationDate(new Date(input.generatedAt))

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const page = pdf.addPage([A5.width, A5.height])
  page.drawRectangle({ x: 0, y: 0, width: A5.width, height: A5.height, color: PAPER })

  drawHeader(page, clubName, payment, bold, regular)
  const afterBody = drawBody(page, payment, bold, regular)
  drawSignatures(page, payment, afterBody, bold, regular)
  drawFooter(page, input, regular)

  return pdf.save()
}

function drawHeader(
  page: PDFPage,
  clubName: string,
  payment: Payment,
  bold: PDFFont,
  regular: PDFFont
): void {
  page.drawRectangle({ x: 0, y: A5.height - 72, width: A5.width, height: 72, color: BRAND })

  page.drawText(safe(clubName), {
    x: MARGIN,
    y: A5.height - 36,
    size: 15,
    font: bold,
    color: rgb(1, 1, 1),
  })
  page.drawText(safe('Receipt'), {
    x: MARGIN,
    y: A5.height - 55,
    size: 10,
    font: regular,
    color: rgb(0.85, 0.93, 0.89),
  })

  const number = safe(payment.receiptNumber ?? payment.reference)
  const numberWidth = bold.widthOfTextAtSize(number, 13)
  page.drawText(number, {
    x: A5.width - MARGIN - numberWidth,
    y: A5.height - 38,
    size: 13,
    font: bold,
    color: rgb(0.96, 0.8, 0.35),
  })

  const dated = safe(formatDate(payment.reviewedAt ?? payment.submittedAt))
  const datedWidth = regular.widthOfTextAtSize(dated, 8)
  page.drawText(dated, {
    x: A5.width - MARGIN - datedWidth,
    y: A5.height - 54,
    size: 8,
    font: regular,
    color: rgb(0.85, 0.93, 0.89),
  })
}

/** Returns the y position below the body, for the signature block. */
function drawBody(page: PDFPage, payment: Payment, bold: PDFFont, regular: PDFFont): number {
  let y = A5.height - 72 - 30

  page.drawText(safe('Received with thanks from'), {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: MUTED,
  })
  y -= 17
  page.drawText(safe(payment.memberName), { x: MARGIN, y, size: 14, font: bold, color: INK })

  // The amount, given the prominence it has on a paper receipt.
  const amount = `Rs. ${money(payment.amountPaise)}`
  const amountWidth = bold.widthOfTextAtSize(amount, 20)
  page.drawText(amount, {
    x: A5.width - MARGIN - amountWidth,
    y: y - 3,
    size: 20,
    font: bold,
    color: BRAND,
  })

  y -= 24
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A5.width - MARGIN, y },
    thickness: 0.75,
    color: RULE,
  })
  y -= 22

  const period = periodLabel(payment)
  const financialYear = financialYearLabel(payment)

  const rows: Array<[string, string]> = [
    ['Towards', PURPOSE_LABEL[payment.purpose]],
    ...(period
      ? ([['For the months', `${period}${financialYear ? `  (${financialYear})` : ''}`]] as Array<
          [string, string]
        >)
      : []),
    ['Paid on', formatDate(payment.paidOn)],
    ['Paid by', METHOD_LABEL[payment.method]],
    ...(payment.externalReference
      ? ([
          [payment.method === 'upi' ? 'UPI transaction ID' : 'Reference', payment.externalReference],
        ] as Array<[string, string]>)
      : []),
    ...(payment.handedTo ? ([['Handed to', payment.handedTo]] as Array<[string, string]>) : []),
    ['Declaration', payment.reference],
    ...(payment.transactionReference
      ? ([['Ledger entry', payment.transactionReference]] as Array<[string, string]>)
      : []),
  ]

  for (const [label, value] of rows) {
    page.drawText(safe(label), { x: MARGIN, y, size: 8.5, font: regular, color: MUTED })
    page.drawText(safe(value), { x: MARGIN + 130, y, size: 9.5, font: bold, color: INK })
    y -= 16
  }

  return y - 6
}

function drawSignatures(
  page: PDFPage,
  payment: Payment,
  top: number,
  bold: PDFFont,
  regular: PDFFont
): void {
  const y = Math.max(top, MARGIN + 58)

  page.drawLine({
    start: { x: MARGIN, y: y + 12 },
    end: { x: A5.width - MARGIN, y: y + 12 },
    thickness: 0.75,
    color: RULE,
  })

  /**
   * Both roles are named even when one person filled them.
   *
   * The club runs with a single officer able to record and post an entry, so the
   * cashier and the approving officer are usually the same name. Printing it twice
   * is the honest thing: a receipt that showed two different names would be claiming
   * a second check that nobody made.
   */
  const officer = payment.reviewedByName ?? ''

  const columns: Array<{ role: string; name: string }> = [
    { role: 'Cashier / Treasurer', name: officer },
    { role: 'Approved by', name: officer },
  ]

  const width = (A5.width - MARGIN * 2) / 2

  columns.forEach((column, index) => {
    const x = MARGIN + index * width

    page.drawLine({
      start: { x, y },
      end: { x: x + width - 40, y },
      thickness: 0.75,
      color: RULE,
    })

    page.drawText(safe(column.role), { x, y: y - 12, size: 8, font: bold, color: INK })

    if (column.name) {
      page.drawText(safe(column.name), { x, y: y - 23, size: 7.5, font: regular, color: MUTED })
    }
  })
}

function drawFooter(page: PDFPage, input: ReceiptInput, regular: PDFFont): void {
  const printed = new Date(input.generatedAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })

  page.drawText(
    safe(
      'This is a club receipt for the club’s own records. It is not a tax receipt and carries no exemption number.'
    ),
    { x: MARGIN, y: MARGIN - 4, size: 6.5, font: regular, color: MUTED }
  )
  page.drawText(safe(`Printed ${printed}`), {
    x: MARGIN,
    y: MARGIN - 14,
    size: 6.5,
    font: regular,
    color: MUTED,
  })
}
