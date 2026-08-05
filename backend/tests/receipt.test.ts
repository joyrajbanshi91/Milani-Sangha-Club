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

describe('the letterhead', () => {
  it('carries the club logo, so the receipt looks like club stationery', async () => {
    const bytes = await render()

    /**
     * An embedded image object in the file.
     *
     * The logo is compiled into the API as base64 precisely so it cannot go missing on
     * a deployment that does not carry loose files — and a check that only looked at
     * the drawn text would not notice if it had.
     */
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/Subtype /Image')
  })

  it('prints the address and registration number when the club has stated them', async () => {
    const drawn = (
      await textBoxes(() =>
        renderReceiptPdf({
          clubName: 'Milani Sangha Club',
          clubAddress: 'Barrackpore, Kolkata 700122',
          clubRegistrationNumber: '50219',
          payment: payment(),
          generatedAt: GENERATED,
        })
      )
    ).map((box) => box.text)

    expect(drawn).toContain('Barrackpore, Kolkata 700122')
    expect(drawn).toContain('Registration no. 50219')
  })

  it('prints the club name alone when it has not', async () => {
    // An invented address on a document a member keeps is worse than no address.
    const drawn = (await textBoxes(() => render())).map((box) => box.text)

    expect(drawn).toContain('Milani Sangha Club')
    expect(drawn.some((text) => /Registration no\./.test(text))).toBe(false)
  })

  it('says on its face that it is a receipt', async () => {
    const drawn = (await textBoxes(() => render())).map((box) => box.text)
    expect(drawn).toContain('RECEIPT')
  })
})

describe('the amount', () => {
  it('is printed in words as well as figures', async () => {
    // The oldest anti-tampering device in bookkeeping: a digit can be added to a
    // figure, a sentence cannot.
    const drawn = (await textBoxes(() => render())).map((box) => box.text)

    expect(drawn).toContain('Rs. 600.00')
    expect(drawn).toContain('In words')
    expect(drawn).toContain('Rupees six hundred only')
  })

  it('states paise in words when the amount has them', async () => {
    const drawn = (await textBoxes(() => render({ amountPaise: 18_450 }))).map((box) => box.text)

    expect(drawn).toContain('Rs. 184.50')
    expect(drawn).toContain('Rupees one hundred and eighty-four and fifty paise only')
  })
})

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

  it('names the cashier and, once approved, the second bearer who approved it', async () => {
    const drawn = (
      await textBoxes(() =>
        renderReceiptPdf({
          clubName: 'Milani Sangha Club',
          payment: payment(),
          transaction: {
            status: 'posted',
            approvals: [
              { uid: 'u-sec', name: 'Ratna Das', role: 'secretary', at: '2026-04-07T09:00:00.000Z' },
            ],
          },
          generatedAt: GENERATED,
        })
      )
    ).map((box) => box.text)

    expect(drawn).toContain('Cashier / Treasurer')
    expect(drawn).toContain('Debabrata Roy')
    expect(drawn).toContain('Approved by')
    // Two different people, which is the point of the rule and of the document.
    expect(drawn).toContain('Ratna Das')
    expect(drawn).not.toContain('Awaiting a second office bearer')
  })

  it('prints one signature when the bearer who accepted it is the one who checked it', async () => {
    /**
     * The ordinary member payment now.
     *
     * One bearer accepts a declaration and it posts on their check, so there is no
     * second name to print. Two columns carrying the same name twice reads like a form
     * filled in wrong, and "Approved by: Debabrata Roy" beside "Cashier: Debabrata Roy"
     * would suggest a second person looked when nobody did.
     */
    const drawn = (
      await textBoxes(() =>
        renderReceiptPdf({
          clubName: 'Milani Sangha Club',
          payment: payment(),
          transaction: {
            status: 'posted',
            approvals: [
              {
                uid: 'u-tre',
                name: 'Debabrata Roy',
                role: 'treasurer',
                at: '2026-04-07T09:00:00.000Z',
              },
            ],
          },
          generatedAt: GENERATED,
        })
      )
    ).map((box) => box.text)

    expect(drawn).toContain('Verified and entered by')
    expect(drawn.filter((text) => text === 'Debabrata Roy')).toHaveLength(1)
    expect(drawn).not.toContain('Cashier / Treasurer')
    expect(drawn).not.toContain('Approved by')
    expect(drawn).not.toContain('Awaiting a second office bearer')
  })

  it('says the approval is outstanding rather than repeating the cashier', async () => {
    // A receipt claiming two signatures it did not have is worse than one that admits
    // it is waiting. The member still gets their receipt; it just tells the truth.
    const drawn = (await textBoxes(() => render())).map((box) => box.text)

    expect(drawn).toContain('Approved by')
    expect(drawn).toContain('Awaiting a second office bearer')
    expect(drawn.filter((text) => text === 'Debabrata Roy')).toHaveLength(1)
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
