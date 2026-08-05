import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { renderReceiptPdf } from '../src/lib/pdf/receipt.js'
import type { Payment } from '../src/domain/types.js'
import { overlaps, textBoxes } from './helpers/pdfBoxes.js'

/**
 * The member's receipt.
 *
 * The document a member keeps, so two things are load-bearing: it has to say which
 * months it covers — a club argument a year later is almost never about whether ₹600
 * was paid but about which year it was for — and it must never be issued for money
 * nobody has confirmed arrived, which the route enforces before it reaches here.
 */

const GENERATED = '2026-06-20T05:30:00.000Z'

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    reference: 'REF-2026-000012',
    receiptNumber: 'RCT-2026-000004',
    status: 'approved',
    memberUid: 'u-member',
    memberName: 'Bristi Ghosh',
    purpose: 'membership',
    method: 'cash',
    amountPaise: 60_000,
    paidOn: '2026-04-05',
    periodStart: '2026-04',
    periodEnd: '2027-03',
    handedTo: 'Treasurer',
    submittedAt: '2026-04-05T09:00:00.000Z',
    reviewedAt: '2026-04-06T11:00:00.000Z',
    reviewedBy: 'u-treasurer',
    reviewedByName: 'Debabrata Roy',
    transactionId: 'txn-9',
    transactionReference: 'TXN-2026-000009',
    ...overrides,
  }
}

async function render(overrides: Partial<Payment> = {}): Promise<Uint8Array> {
  return renderReceiptPdf({
    clubName: 'Milani Sangha Club',
    payment: payment(overrides),
    generatedAt: GENERATED,
  })
}

describe('the receipt', () => {
  it('is a valid single-page PDF titled with its number', async () => {
    const bytes = await render()

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
    expect(loaded.getTitle()).toContain('RCT-2026-000004')
  })

  it('names the member, the amount and the months it covers', async () => {
    const drawn = (await textBoxes(() => render())).map((box) => box.text).join(' | ')

    expect(drawn).toContain('Bristi Ghosh')
    expect(drawn).toContain('600.00')
    // The period, in words. This is the line the club will be asked about.
    expect(drawn).toContain('April 2026 to March 2027')
    expect(drawn).toContain('2026-27')
  })

  it('names a single month without a range', async () => {
    const drawn = (
      await textBoxes(() => render({ periodStart: '2026-04', periodEnd: '2026-04', amountPaise: 5_000 }))
    ).map((box) => box.text)

    // The period cell itself, not the whole page: 'to' appears in ordinary prose
    // elsewhere on the receipt, and asserting against the document would pass or
    // fail on wording that has nothing to do with the period.
    const period = drawn.find((text) => text.startsWith('April 2026'))
    expect(period).toBe('April 2026  (2026-27)')
  })

  it('carries both signature lines, named for the officer who verified it', async () => {
    // The club runs with one officer able to record and post. Printing the same name
    // against both roles is the honest thing; two different names would claim a
    // second check nobody made.
    const drawn = (await textBoxes(() => render())).map((box) => box.text)

    expect(drawn).toContain('Cashier / Treasurer')
    expect(drawn).toContain('Approved by')
    expect(drawn.filter((text) => text === 'Debabrata Roy')).toHaveLength(2)
  })

  it('links back to the declaration and the ledger entry', async () => {
    const drawn = (await textBoxes(() => render())).map((box) => box.text).join(' | ')

    expect(drawn).toContain('REF-2026-000012')
    expect(drawn).toContain('TXN-2026-000009')
  })

  it('says plainly that it is not a tax receipt', async () => {
    // Printing an exemption reference the club may not hold would be worse than
    // printing nothing, and it is not this system's place to imply one.
    const drawn = (await textBoxes(() => render())).map((box) => box.text).join(' ')
    expect(drawn).toMatch(/not a tax receipt/i)
  })

  it('shows a donation with no months at all', async () => {
    const drawn = (
      await textBoxes(() =>
        render({
          purpose: 'donation',
          periodStart: undefined,
          periodEnd: undefined,
          amountPaise: 250_000,
        })
      )
    )
      .map((box) => box.text)
      .join(' | ')

    expect(drawn).toContain('Donation')
    expect(drawn).not.toContain('For the months')
  })

  it('shows the UPI transaction ID when that is how it was paid', async () => {
    const drawn = (
      await textBoxes(() =>
        render({ method: 'upi', handedTo: undefined, externalReference: '4471829930' })
      )
    )
      .map((box) => box.text)
      .join(' | ')

    expect(drawn).toContain('UPI transaction ID')
    expect(drawn).toContain('4471829930')
  })

  it('draws nothing on top of anything else', async () => {
    expect(overlaps(await textBoxes(() => render()))).toEqual([])
  })

  it('draws nothing on top of anything else with a long name and every field filled', async () => {
    const boxes = await textBoxes(() =>
      render({
        memberName: 'Debabrata Bandyopadhyay Chattopadhyay',
        reviewedByName: 'Ashoke Kumar Mukhopadhyay',
        method: 'bank',
        handedTo: undefined,
        externalReference: 'CHQ-000123456789 / SBIN0001234',
      })
    )

    expect(overlaps(boxes)).toEqual([])
  })

  it('renders without throwing on a name the PDF font cannot encode', async () => {
    // WinAnsi again: a Bengali name would throw if it reached the encoder raw.
    const bytes = await render({ memberName: 'বৃষ্টি ঘোষ', reviewedByName: 'জয় রাজবংশী' })
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('falls back to the declaration reference when no receipt number exists', async () => {
    // Should not happen — the number is allocated at verification — but a receipt
    // with a blank number in the corner is worse than one showing REF-.
    const loaded = await PDFDocument.load(await render({ receiptNumber: undefined }))
    expect(loaded.getTitle()).toContain('REF-2026-000012')
  })
})
