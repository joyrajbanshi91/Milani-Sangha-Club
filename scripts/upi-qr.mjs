#!/usr/bin/env node
/**
 * Draw the club's UPI QR code from its UPI ID.
 *
 *   npm run upi:qr
 *
 * Reads `club.upi` from frontend/src/content/site.ts and writes
 * frontend/public/brand/upi-qr.svg.
 *
 * ## Why generate it rather than paste a screenshot in
 *
 * The obvious move is to save the QR the payment app offers and drop the image in.
 * Three things go wrong with that. A screenshot is a bitmap, so it blurs on a phone
 * at exactly the moment somebody is trying to scan it. It carries whatever else was
 * on that screen — a status bar, a profile photograph, an app's branding. And nothing
 * connects it to the UPI ID printed beside it, so changing the ID leaves a QR that
 * still sends money to the old account, silently, for as long as nobody scans it and
 * checks the name.
 *
 * Generated, the QR *is* the UPI ID: crisp at any size, nothing else in the frame, and
 * a mismatch is impossible because both come from the same line of one file.
 *
 * The payload is the standard UPI deep link — `upi://pay?pa=…&pn=…&cu=INR` — which
 * every Indian payment app understands. Deliberately no `am` (amount): a member pays
 * a different amount depending on how many months they are paying for, and a QR with
 * a fixed amount in it would be wrong for most of them.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = resolve(ROOT, 'frontend/src/content/site.ts')
const OUT = resolve(ROOT, 'frontend/public/brand/upi-qr.svg')

// qrcode is a backend dependency, so this reaches into that workspace rather than
// adding a second copy at the root.
const { toString: toQrString } = await import(
  resolve(ROOT, 'backend/node_modules/qrcode/lib/index.js')
)

/** Pull one quoted value out of the `upi` block, without parsing TypeScript. */
function readUpiField(source, field) {
  const block = source.slice(source.indexOf('upi: {'))
  const match = new RegExp(`${field}:\\s*'([^']*)'`).exec(block.slice(0, block.indexOf('},')))
  return match?.[1] ?? ''
}

const source = readFileSync(SITE, 'utf8')
const id = readUpiField(source, 'id')
const payeeName = readUpiField(source, 'payeeName')

if (!id) {
  console.error('error: club.upi.id is empty in frontend/src/content/site.ts.')
  console.error('       Set the club’s UPI ID there, then run this again.')
  process.exit(2)
}

const payload = `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(payeeName || id)}&cu=INR`

/**
 * Error correction level M, and a wide quiet zone.
 *
 * M recovers about 15% of a damaged symbol, which is what a printed QR on a
 * noticeboard needs after a month of thumbprints. The margin matters more than it
 * looks: a scanner needs white space around the symbol to find its edges, and a QR
 * cropped tight to its data is the commonest reason a code "does not work".
 */
const svg = await toQrString(payload, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#0f3d2e', light: '#ffffff' },
})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, svg)

console.log('→ wrote frontend/public/brand/upi-qr.svg')
console.log(`  UPI ID   : ${id}`)
console.log(`  payee    : ${payeeName || '(the VPA itself)'}`)
console.log(`  payload  : ${payload}`)
console.log('  Scan it with a payment app and CHECK THE NAME before the club publishes it.')
