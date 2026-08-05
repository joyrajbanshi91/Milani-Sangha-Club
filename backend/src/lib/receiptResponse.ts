import type { Response } from 'express'

import { env } from '../config/env.js'
import type { Payment, Transaction } from '../domain/types.js'
import { logger } from './logger.js'
import { AppError } from './httpError.js'
import { receiptFilename } from './pdf/filenames.js'
import { renderReceiptPdf } from './pdf/receipt.js'

/**
 * Send a member's receipt as a PDF download.
 *
 * Shared by the member's own route and the officers' reprint route, so the two
 * cannot drift — in particular so that neither can start issuing a receipt for a
 * payment nobody has verified. That check lives here rather than in each caller
 * precisely because it is the one worth never forgetting.
 *
 * `findEntry` looks up the ledger entry so the receipt can name the officer who
 * approved it. Passed in rather than imported to keep this module free of the
 * container, and allowed to fail: a member is entitled to their receipt even if the
 * ledger cannot be read at that moment, and the receipt says the approval is
 * outstanding rather than claiming a signature it could not confirm.
 */
export async function sendReceipt(
  res: Response,
  payment: Payment,
  findEntry?: (id: string) => Promise<Transaction | null>
): Promise<void> {
  if (payment.status !== 'approved') {
    throw new AppError(
      409,
      'not_verified',
      payment.status === 'pending_verification'
        ? 'This payment has not been verified yet, so there is no receipt for it. An office bearer has to confirm it against the club’s records first.'
        : `This payment is ${payment.status.replace('_', ' ')}, so no receipt was issued.`
    )
  }

  let transaction: Transaction | null = null

  if (findEntry && payment.transactionId) {
    try {
      transaction = await findEntry(payment.transactionId)
    } catch (error) {
      logger.warn(
        { err: error, payment: payment.reference, entry: payment.transactionId },
        'could not read the ledger entry for a receipt; printing it as awaiting approval'
      )
    }
  }

  const pdf = await renderReceiptPdf({
    clubName: env.CLUB_NAME,
    clubAddress: env.CLUB_ADDRESS,
    clubRegistrationNumber: env.CLUB_REGISTRATION_NUMBER,
    payment,
    transaction,
    generatedAt: new Date().toISOString(),
  })

  const filename = receiptFilename({
    clubName: env.CLUB_NAME,
    receiptNumber: payment.receiptNumber ?? payment.reference,
    paidOn: payment.paidOn,
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  // Never cached: a receipt is a personal document, and a shared cache holding one
  // member's receipt where another could be served it is the whole risk.
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Content-Length', String(pdf.byteLength))

  res.end(Buffer.from(pdf))
}
