import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

import { financialYearLabel, periodLabel } from '../../domain/payments.js'
import type { Payment, Transaction } from '../../domain/types.js'
import {
  amountInWords,
  BRAND,
  drawClubMark,
  embedClubMark,
  formatDocumentDate as formatDate,
  INK,
  letterheadLines,
  money,
  MUTED,
  ON_BRAND,
  ON_BRAND_ACCENT,
  ON_BRAND_MUTED,
  PAPER,
  PENDING,
  RULE,
  safe,
  WASH,
} from './brand.js'

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
 * Two signatures, and they are two different people. The **cashier** is the officer
 * who checked the money against the club's records and recorded it. The **approving
 * officer** is the second bearer who approved that ledger entry — the club's
 * two-person rule, on the face of the document.
 *
 * The approver is read from the ledger entry at the moment the receipt is printed,
 * not stored on the payment, because it does not exist yet when the receipt number is
 * allocated. Until somebody approves, the receipt says so rather than inventing a
 * name or quietly repeating the cashier's: a receipt claiming two signatures it did
 * not have is worse than one that admits it is waiting.
 *
 * Both are printed as recorded facts *and* left as ruled lines, because a paper
 * receipt in India gets signed by hand and a printed name is not a signature.
 *
 * ## Not a tax receipt
 *
 * Marked as a club receipt, deliberately without any registration or exemption
 * number. Printing an 80G reference the club may not hold would be worse than
 * printing nothing, and it is not this system's place to imply one.
 */

const A5 = { width: 595.28, height: 420.94 }
const MARGIN = 36

/** The green band at the top. Deep enough for the logo and three letterhead lines. */
const BAND = 86

const METHOD_LABEL = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer / cheque' } as const
const PURPOSE_LABEL = {
  membership: 'Membership subscription',
  donation: 'Donation',
  event: 'Event payment',
  other: 'Payment',
} as const

export interface ReceiptInput {
  clubName: string
  /** Printed under the club's name. Omitted when the club has not stated one. */
  clubAddress?: string | undefined
  clubRegistrationNumber?: string | undefined
  payment: Payment
  /**
   * The ledger entry this payment produced, if it can still be read.
   *
   * Used only for the approving officer's name. Optional because a receipt must still
   * print when the entry has been reversed, or when the ledger cannot be reached —
   * the member is entitled to their receipt either way.
   */
  transaction?: Pick<Transaction, 'status' | 'approvals'> | null
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

  const mark = await embedClubMark(pdf)

  const page = pdf.addPage([A5.width, A5.height])
  page.drawRectangle({ x: 0, y: 0, width: A5.width, height: A5.height, color: PAPER })

  drawHeader(page, input, mark, bold, regular)
  const afterBody = drawBody(page, payment, bold, regular)
  drawSignatures(page, payment, input.transaction ?? null, afterBody, bold, regular)
  drawFooter(page, input, regular)

  return pdf.save()
}

/**
 * The letterhead: logo, club, address, and what this document is.
 *
 * The logo sits inside the green band rather than above it, because a receipt is
 * often the only piece of club stationery a member ever holds and it should look like
 * stationery. The receipt number is the largest thing on the right — it is what
 * anybody quotes when they ring up about a payment.
 */
function drawHeader(
  page: PDFPage,
  input: ReceiptInput,
  mark: PDFImage | null,
  bold: PDFFont,
  regular: PDFFont
): void {
  const { clubName, payment } = input

  page.drawRectangle({ x: 0, y: A5.height - BAND, width: A5.width, height: BAND, color: BRAND })

  const markSize = 44
  drawClubMark(page, {
    mark,
    clubName,
    x: MARGIN,
    y: A5.height - BAND + (BAND - markSize) / 2,
    size: markSize,
    font: bold,
  })

  const textX = MARGIN + markSize + 14
  let y = A5.height - 34

  page.drawText(safe(clubName), { x: textX, y, size: 14, font: bold, color: ON_BRAND })
  y -= 14

  for (const line of letterheadLines({
    address: input.clubAddress,
    registrationNumber: input.clubRegistrationNumber,
  })) {
    page.drawText(safe(line), { x: textX, y, size: 7.5, font: regular, color: ON_BRAND_MUTED })
    y -= 10
  }

  page.drawText(safe('RECEIPT'), {
    x: textX,
    y: A5.height - BAND + 13,
    size: 9,
    font: bold,
    color: ON_BRAND_ACCENT,
  })

  const number = safe(payment.receiptNumber ?? payment.reference)
  const numberWidth = bold.widthOfTextAtSize(number, 13)
  page.drawText(number, {
    x: A5.width - MARGIN - numberWidth,
    y: A5.height - 36,
    size: 13,
    font: bold,
    color: ON_BRAND_ACCENT,
  })

  const dated = safe(`Issued ${formatDate(payment.reviewedAt ?? payment.submittedAt)}`)
  const datedWidth = regular.widthOfTextAtSize(dated, 8)
  page.drawText(dated, {
    x: A5.width - MARGIN - datedWidth,
    y: A5.height - 51,
    size: 8,
    font: regular,
    color: ON_BRAND_MUTED,
  })
}

/** Returns the y position below the body, for the signature block. */
function drawBody(page: PDFPage, payment: Payment, bold: PDFFont, regular: PDFFont): number {
  let y = A5.height - BAND - 26

  page.drawText(safe('Received with thanks from'), {
    x: MARGIN,
    y,
    size: 8,
    font: regular,
    color: MUTED,
  })
  y -= 17
  page.drawText(safe(payment.memberName), { x: MARGIN, y, size: 14, font: bold, color: INK })

  /**
   * The amount, in a panel of its own.
   *
   * On a paper receipt the figure is what the eye goes to, and a number floating in
   * white space beside a name is easy to read as part of the sentence above it. The
   * panel makes it a field, which is what it is.
   */
  const panel = { width: 186, height: 42 }
  const panelX = A5.width - MARGIN - panel.width
  const panelY = y - 12

  page.drawRectangle({
    x: panelX,
    y: panelY,
    width: panel.width,
    height: panel.height,
    color: WASH,
    borderColor: RULE,
    borderWidth: 0.75,
  })

  page.drawText(safe('Amount received'), {
    x: panelX + 10,
    y: panelY + panel.height - 14,
    size: 7,
    font: regular,
    color: MUTED,
  })

  const amount = `Rs. ${money(payment.amountPaise)}`
  const amountWidth = bold.widthOfTextAtSize(amount, 19)
  page.drawText(amount, {
    x: panelX + panel.width - 10 - amountWidth,
    y: panelY + 10,
    size: 19,
    font: bold,
    color: BRAND,
  })

  y -= 34
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A5.width - MARGIN, y },
    thickness: 0.75,
    color: RULE,
  })
  y -= 18

  /**
   * The amount in words.
   *
   * The oldest anti-tampering device in bookkeeping: a digit can be added to a
   * figure, a sentence cannot. Every paper receipt a club member has ever been handed
   * carries this line, and a treasurer notices its absence immediately.
   */
  page.drawText(safe('In words'), { x: MARGIN, y, size: 8.5, font: regular, color: MUTED })
  page.drawText(safe(amountInWords(payment.amountPaise)), {
    x: MARGIN + 130,
    y,
    size: 9,
    font: bold,
    color: BRAND,
  })
  y -= 20

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

/**
 * Who approved the ledger entry, as of this printing.
 *
 * Returns null while nobody has, which the receipt states rather than papering over.
 * Reads the first signature: the club needs one, and if it ever needs more, naming
 * the first is still true and the ruled line takes the rest by hand.
 */
function approverName(
  transaction: Pick<Transaction, 'status' | 'approvals'> | null
): string | null {
  const approval = transaction?.approvals?.[0]
  return approval?.name ?? null
}

function drawSignatures(
  page: PDFPage,
  payment: Payment,
  transaction: Pick<Transaction, 'status' | 'approvals'> | null,
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

  const approver = approverName(transaction)

  /**
   * One signature or two, depending on who actually signed.
   *
   * A verified declaration posts on the accepting officer's own check — the member put
   * the money forward, so that officer is the second pair of eyes and there is no third
   * name to print. Two columns naming the same person twice reads like a form filled in
   * wrong, so this collapses to a single line.
   *
   * Two columns remain for anything that took a separate approval, and for a receipt
   * printed while the entry is still pending — including every receipt issued before the
   * club moved to one acceptance, which is read from the ledger and stays truthful.
   */
  const columns: Array<{ role: string; name: string; pending?: boolean }> =
    approver && approver === payment.reviewedByName
      ? [{ role: 'Verified and entered by', name: approver }]
      : [
          { role: 'Cashier / Treasurer', name: payment.reviewedByName ?? '' },
          approver
            ? { role: 'Approved by', name: approver }
            : { role: 'Approved by', name: 'Awaiting a second office bearer', pending: true },
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
      page.drawText(safe(column.name), {
        x,
        y: y - 23,
        size: 7.5,
        font: regular,
        // The waiting note is set apart from a real name, so a glance at a stack of
        // receipts shows which are complete.
        color: column.pending ? PENDING : MUTED,
      })
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
