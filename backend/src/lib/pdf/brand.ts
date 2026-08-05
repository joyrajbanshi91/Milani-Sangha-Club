import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

import { formatPaise } from '../../domain/money.js'
import { CLUB_MARK_PNG_BASE64 } from './clubMark.js'

/**
 * The look shared by the club's two printed documents.
 *
 * A member's receipt and the committee's statement come off the same press: the same
 * green band, the same logo, the same way of writing an amount and a date. They were
 * drifting apart because each file carried its own copy of the colours and its own
 * `safe()` — so a colour corrected on the statement stayed wrong on the receipt.
 *
 * Everything here is drawing and formatting. No figure is computed in this file.
 */

export const INK = rgb(0.11, 0.09, 0.08)
export const MUTED = rgb(0.45, 0.42, 0.38)
export const BRAND = rgb(0.06, 0.24, 0.18)
export const RULE = rgb(0.85, 0.83, 0.79)
export const PAPER = rgb(0.99, 0.98, 0.96)
export const POSITIVE = rgb(0.08, 0.45, 0.3)
export const NEGATIVE = rgb(0.7, 0.15, 0.12)
export const PENDING = rgb(0.72, 0.45, 0.05)

/** On the green band. */
export const ON_BRAND = rgb(1, 1, 1)
export const ON_BRAND_MUTED = rgb(0.85, 0.93, 0.89)
export const ON_BRAND_ACCENT = rgb(0.96, 0.8, 0.35)

/** A tinted panel behind a figure that should be read first. */
export const WASH = rgb(0.94, 0.96, 0.94)

/**
 * Text a standard PDF font can actually encode.
 *
 * pdf-lib's built-in fonts are WinAnsi, which has no ₹, no em dash and no Bengali.
 * An unencodable character throws while writing the file, so a member's name in
 * Bengali would have produced no receipt at all rather than an imperfect one. The
 * substitutions are chosen to read correctly on paper: 'Rs.' for ₹, ASCII quotes for
 * curly ones.
 *
 * Embedding a Unicode font is the real fix and a much larger change: it needs a
 * licensed Devanagari/Bengali face compiled into the bundle. Recorded here so the
 * next reader knows this is a known limit, not an oversight.
 */
export function safe(text: string): string {
  return text
    .replace(/₹/g, 'Rs.')
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?')
}

/** An amount as it should appear on a document: 1,20,000.00, no symbol. */
export function money(paise: number): string {
  return safe(formatPaise(paise, { withSymbol: false }))
}

/** '11 June 2026'. Takes a date or a timestamp. */
export function formatDocumentDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

function under100(value: number): string {
  if (value < 20) return UNITS[value] as string
  const tens = TENS[Math.floor(value / 10)] as string
  const unit = value % 10
  return unit === 0 ? tens : `${tens}-${UNITS[unit]}`
}

function under1000(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  if (hundreds === 0) return under100(rest)
  const head = `${UNITS[hundreds]} hundred`
  return rest === 0 ? head : `${head} and ${under100(rest)}`
}

/**
 * A whole number in the Indian system: crore, lakh, thousand, hundred.
 *
 * Grouped as 1,20,000 is spoken — "one lakh twenty thousand" — because this is what
 * a receipt in India says, and "one hundred and twenty thousand" would read as a
 * translation of the document rather than the document.
 */
function wordsForWholeNumber(value: number): string {
  if (value === 0) return 'zero'

  const parts: string[] = []
  const crore = Math.floor(value / 10_000_000)
  const lakh = Math.floor((value % 10_000_000) / 100_000)
  const thousand = Math.floor((value % 100_000) / 1000)
  const rest = value % 1000

  if (crore > 0) parts.push(`${wordsForWholeNumber(crore)} crore`)
  if (lakh > 0) parts.push(`${under1000(lakh)} lakh`)
  if (thousand > 0) parts.push(`${under1000(thousand)} thousand`)
  if (rest > 0) parts.push(under1000(rest))

  return parts.join(' ')
}

/**
 * The amount in words, as a receipt has to carry it.
 *
 * "Rupees six hundred only" beside "Rs. 600.00". This is not decoration: it is the
 * oldest anti-tampering device in bookkeeping, because a digit can be added to a
 * figure and a sentence cannot. Every paper receipt a club member has ever been
 * given has this line, and its absence is the sort of thing a treasurer notices
 * immediately.
 *
 * Paise are stated only when there are any, so an ordinary subscription reads
 * cleanly and an odd amount is still exact.
 */
export function amountInWords(paise: number): string {
  const negative = paise < 0
  const absolute = Math.abs(Math.trunc(paise))
  const rupees = Math.floor(absolute / 100)
  const remainder = absolute % 100

  const sentence =
    remainder === 0
      ? `Rupees ${wordsForWholeNumber(rupees)} only`
      : `Rupees ${wordsForWholeNumber(rupees)} and ${under100(remainder)} paise only`

  // Capital first letter, the rest as spoken. A receipt for a reversal should still
  // read as a sentence rather than as an error.
  const cased = sentence.charAt(0).toUpperCase() + sentence.slice(1)
  return negative ? `Minus ${cased.charAt(0).toLowerCase()}${cased.slice(1)}` : cased
}

/**
 * The club's logo, ready to draw, or null.
 *
 * Null rather than throwing: a club that has not run `npm run logo:pdf`, or whose
 * logo file is corrupt, must still get its receipts. `drawClubMark` then draws a
 * monogram, which looks deliberate rather than broken.
 */
export async function embedClubMark(pdf: PDFDocument): Promise<PDFImage | null> {
  if (!CLUB_MARK_PNG_BASE64) return null

  try {
    return await pdf.embedPng(Buffer.from(CLUB_MARK_PNG_BASE64, 'base64'))
  } catch {
    return null
  }
}

/**
 * The logo at `size`, or the club's initials in a ring.
 *
 * The fallback is a circle rather than a square: it reads as a badge, and it cannot
 * be mistaken for an image that failed to load. Both paths occupy exactly the same
 * box, so the letterhead beside it needs no knowledge of which one was drawn.
 */
export function drawClubMark(
  page: PDFPage,
  options: {
    mark: PDFImage | null
    clubName: string
    x: number
    /** The bottom of the box. */
    y: number
    size: number
    font: PDFFont
  }
): void {
  const { mark, clubName, x, y, size, font } = options

  if (mark) {
    page.drawImage(mark, { x, y, width: size, height: size })
    return
  }

  const radius = size / 2
  page.drawCircle({
    x: x + radius,
    y: y + radius,
    size: radius,
    color: ON_BRAND,
    opacity: 0.14,
    borderColor: ON_BRAND,
    borderWidth: 1,
    borderOpacity: 0.5,
  })

  const letters = safe(
    clubName
      .split(/\s+/)
      .filter((word) => /[A-Za-z]/.test(word))
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('')
  )

  const fontSize = size * 0.34
  const width = font.widthOfTextAtSize(letters, fontSize)
  page.drawText(letters, {
    x: x + radius - width / 2,
    y: y + radius - fontSize * 0.36,
    size: fontSize,
    font,
    color: ON_BRAND,
  })
}

/**
 * The lines under the club's name: address, then registration number.
 *
 * Only what the club has actually stated. An empty letterhead is correct for a club
 * that has not set them; an invented one is not.
 */
export function letterheadLines(input: {
  address?: string | undefined
  registrationNumber?: string | undefined
}): string[] {
  const lines: string[] = []

  if (input.address?.trim()) lines.push(input.address.trim())
  if (input.registrationNumber?.trim()) {
    lines.push(`Registration no. ${input.registrationNumber.trim()}`)
  }

  return lines
}

/**
 * A file name somebody can find again in six months.
 *
 * `statement.pdf` and `receipt.pdf` arrive in a downloads folder as `receipt(1).pdf`
 * with nothing to tell two of them apart — which is how a club ends up circulating
 * last month's figures. Every document this system produces is therefore named with
 * the club, what it is, what it covers, and a date.
 */
export function slugForFilename(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
