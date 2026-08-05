import type { Response } from 'express'

import { env } from '../config/env.js'
import type { Payment } from '../domain/types.js'
import { AppError } from './httpError.js'
import { renderReceiptPdf } from './pdf/receipt.js'

/**
 * Send a member's receipt as a PDF download.
 *
 * Shared by the member's own route and the officers' reprint route, so the two
 * cannot drift — in particular so that neither can start issuing a receipt for a
 * payment nobody has verified. That check lives here rather than in each caller
 * precisely because it is the one worth never forgetting.
 */
export async function sendReceipt(res: Response, payment: Payment): Promise<void> {
  if (payment.status !== 'approved') {
    throw new AppError(
      409,
      'not_verified',
      payment.status === 'pending_verification'
        ? 'This payment has not been verified yet, so there is no receipt for it. An office bearer has to confirm it against the club’s records first.'
        : `This payment is ${payment.status.replace('_', ' ')}, so no receipt was issued.`
    )
  }

  const pdf = await renderReceiptPdf({
    clubName: env.CLUB_NAME,
    payment,
    generatedAt: new Date().toISOString(),
  })

  const filename = `receipt-${payment.receiptNumber ?? payment.reference}-${payment.paidOn}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  // Never cached: a receipt is a personal document, and a shared cache holding one
  // member's receipt where another could be served it is the whole risk.
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Content-Length', String(pdf.byteLength))

  res.end(Buffer.from(pdf))
}
