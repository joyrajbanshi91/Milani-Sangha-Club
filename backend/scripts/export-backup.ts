/**
 * Turn a backup into a spreadsheet the club can read without this software.
 *
 *   npm run export:book -- --file ../backups/2026-08-05T17-40-39-795Z.json
 *   npm run export:book -- --file <backup> --out "/somewhere/Club books.xlsx"
 *
 * ## Why this exists
 *
 * `npm run backup` writes JSON, and JSON is a *restore file*: it exists so the club's
 * data can be put back into Appwrite. It is not something a treasurer can open, and a
 * club whose only copy of its books is a file nobody can read has a backup in the same
 * sense that a locked safe with no key is storage.
 *
 * The club asked the right question — what happens when the site or the server is not
 * working. The answer has to be *"open the spreadsheet"*, not *"restore the database and
 * redeploy the application"*, because the second is not something anybody does on a
 * Sunday evening when the AGM is on Monday.
 *
 * So this writes an .xlsx: one sheet per table, amounts in rupees rather than paise,
 * and a summary sheet with each fund's opening balance, what came in, what went out and
 * what is left. Excel, Numbers, LibreOffice and Google Sheets all open it, on a laptop
 * with no internet and no login.
 *
 * ## The figures are computed by the same code as the statement
 *
 * `fundBalances` and `periodTotals` from the domain, not arithmetic written again here.
 * A spreadsheet that disagreed with the club's own statement would be worse than no
 * spreadsheet: two documents, both apparently authoritative, and no way to tell which
 * is wrong.
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import ExcelJS from 'exceljs'

import { fundBalances, periodTotals, totalFundsPaise } from '../src/domain/ledger.js'
import type { Category, Fund, Payment, Transaction, YearOpening } from '../src/domain/types.js'

interface Backup {
  formatVersion: number
  takenAt: string
  projectId?: string
  tables: Record<string, Array<Record<string, unknown>>>
  users?: Array<Record<string, unknown>>
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function log(message = ''): void {
  process.stdout.write(`${message}\n`)
}

/** Paise to rupees, as a number so the spreadsheet can add them up. */
function rupees(paise: unknown): number {
  return typeof paise === 'number' ? Math.round(paise) / 100 : 0
}

/**
 * Appwrite's own columns dropped, and `$id` kept as `id`.
 *
 * `$createdAt` and friends are the database's bookkeeping, not the club's, and a sheet
 * of forty columns is one nobody reads.
 */
function plain(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: row.$id }
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('$')) out[key] = value
  }
  return out
}

const file = argument('file')

if (!file) {
  log('usage: npm run export:book -- --file <backup.json> [--out <book.xlsx>]')
  log('')
  log('Turns a backup into a spreadsheet that opens without this software —')
  log('for the day the site or the server is not working.')
  process.exit(2)
}

const path = resolve(process.cwd(), file)
const backup = JSON.parse(readFileSync(path, 'utf8')) as Backup

if (backup.formatVersion !== 1) {
  log(`error: this backup says formatVersion ${backup.formatVersion}; this script reads 1.`)
  process.exit(1)
}

const table = <T,>(name: string): T[] => (backup.tables[name] ?? []).map(plain) as T[]

const funds = table<Fund>('finance_funds').map((fund) => ({ ...fund, id: String(fund.id) }))
const categories = table<Category>('finance_categories')
const transactions = table<Transaction>('finance_transactions').map((entry) => ({
  ...entry,
  // The ledger's signature lists live in a JSON column; the domain wants them parsed.
  approvals:
    typeof (entry as unknown as { approvalsJson?: string }).approvalsJson === 'string'
      ? (JSON.parse((entry as unknown as { approvalsJson: string }).approvalsJson) as [])
      : (entry.approvals ?? []),
}))
const payments = table<Payment>('payments')
const openings = table<YearOpening>('finance_years')

const workbook = new ExcelJS.Workbook()
workbook.creator = 'Milani Sangha Club platform'
workbook.created = new Date(backup.takenAt)

/** A sheet with a bold header row, frozen, and columns wide enough to read. */
function sheet(
  name: string,
  columns: Array<{ header: string; key: string; width?: number }>,
  rows: Array<Record<string, unknown>>
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(name)
  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
  }))
  worksheet.getRow(1).font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  rows.forEach((row) => worksheet.addRow(row))
  return worksheet
}

// ---------------------------------------------------------------------------
// Summary — the sheet somebody opens first
// ---------------------------------------------------------------------------

/**
 * The whole ledger, not a period.
 *
 * A backup has no "period" in it, and picking one here would produce a figure that
 * quietly excluded entries. Everything from the funds' opening dates to the last entry
 * is the honest span for a document whose job is "this is what the club had".
 */
const dates = transactions.map((entry) => entry.date).sort()
const from = funds.map((fund) => fund.openingDate).sort()[0] ?? dates[0] ?? backup.takenAt.slice(0, 10)
const to = dates[dates.length - 1] ?? backup.takenAt.slice(0, 10)

const balances = fundBalances(funds, transactions, to)
const totals = periodTotals(transactions, from, to)

const summary = workbook.addWorksheet('Summary')
summary.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }]

summary.addRow(['The club’s books, exported from a backup'])
summary.getRow(1).font = { bold: true, size: 14 }
summary.addRow([])
summary.addRow(['Backup taken', backup.takenAt])
summary.addRow(['Covering', `${from} to ${to}`])
summary.addRow(['Entries counted', transactions.filter((entry) => entry.status === 'posted').length])
summary.addRow([
  'Awaiting approval (excluded)',
  transactions.filter((entry) => entry.status === 'pending').length,
])
summary.addRow([])

const header = summary.addRow(['Fund', 'Opening (Rs.)', 'In', 'Out', 'Balance'])
header.font = { bold: true }

for (const balance of balances) {
  summary.addRow([
    `${balance.fundName} (${balance.kind})`,
    rupees(balance.openingBalancePaise),
    rupees(balance.inPaise),
    rupees(balance.outPaise),
    rupees(balance.balancePaise),
  ])
}

const totalRow = summary.addRow([
  'Total held',
  rupees(balances.reduce((sum, balance) => sum + balance.openingBalancePaise, 0)),
  rupees(totals.incomePaise),
  rupees(totals.expensePaise),
  rupees(totalFundsPaise(balances)),
])
totalRow.font = { bold: true }

summary.addRow([])
summary.addRow(['Only entries approved by a second office bearer are counted above.'])
summary.addRow(['Amounts are in rupees. The club’s year runs April to March.'])

// ---------------------------------------------------------------------------
// One sheet per table
// ---------------------------------------------------------------------------

const fundName = (id: unknown): string =>
  funds.find((fund) => fund.id === id)?.name ?? (id ? String(id) : '')
const categoryName = (id: unknown): string =>
  categories.find((category) => category.id === id)?.name ?? (id ? String(id) : '')

sheet(
  'Entries',
  [
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Date', key: 'date' },
    { header: 'Kind', key: 'kind' },
    { header: 'Status', key: 'status' },
    { header: 'Amount (Rs.)', key: 'amount' },
    { header: 'Fund', key: 'fund', width: 18 },
    { header: 'To fund', key: 'toFund', width: 18 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Source', key: 'source', width: 24 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'External reference', key: 'externalReference', width: 22 },
    { header: 'Recorded by', key: 'createdByName', width: 20 },
    { header: 'Approved by', key: 'approvedBy', width: 20 },
    { header: 'Posted at', key: 'postedAt', width: 24 },
  ],
  transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference))
    .map((entry) => ({
      ...entry,
      amount: rupees(entry.amountPaise),
      fund: fundName(entry.fundId),
      toFund: fundName(entry.toFundId),
      category: categoryName(entry.categoryId),
      approvedBy: (entry.approvals ?? []).map((approval) => approval.name).join(', '),
    }))
)

sheet(
  'Member payments',
  [
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Receipt', key: 'receiptNumber', width: 18 },
    { header: 'Verification code', key: 'securityCode', width: 18 },
    { header: 'Member', key: 'memberName', width: 24 },
    { header: 'Status', key: 'status' },
    { header: 'Amount (Rs.)', key: 'amount' },
    { header: 'Paid on', key: 'paidOn' },
    { header: 'Method', key: 'method' },
    { header: 'Purpose', key: 'purpose' },
    { header: 'Months', key: 'months', width: 20 },
    { header: 'UPI / cheque reference', key: 'externalReference', width: 24 },
    { header: 'Verified by', key: 'reviewedByName', width: 20 },
    { header: 'Ledger entry', key: 'transactionReference', width: 18 },
  ],
  payments
    .slice()
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn))
    .map((payment) => ({
      ...payment,
      amount: rupees(payment.amountPaise),
      months:
        payment.periodStart && payment.periodEnd
          ? payment.periodStart === payment.periodEnd
            ? payment.periodStart
            : `${payment.periodStart} to ${payment.periodEnd}`
          : '',
    }))
)

sheet(
  'Funds',
  [
    { header: 'Fund', key: 'name', width: 24 },
    { header: 'Kind', key: 'kind' },
    { header: 'Opening balance (Rs.)', key: 'opening', width: 22 },
    { header: 'Opening date', key: 'openingDate', width: 14 },
    { header: 'Active', key: 'active' },
    { header: 'Notes', key: 'notes', width: 40 },
  ],
  funds.map((fund) => ({ ...fund, opening: rupees(fund.openingBalancePaise) }))
)

sheet(
  'Categories',
  [
    { header: 'Category', key: 'name', width: 28 },
    { header: 'Income or expense', key: 'kind', width: 18 },
    { header: 'Active', key: 'active' },
  ],
  categories.map((category) => ({ ...category }))
)

if (openings.length > 0) {
  sheet(
    'Financial years',
    [
      { header: 'Year', key: 'financialYear' },
      { header: 'Opened with (Rs.)', key: 'adopted', width: 18 },
      { header: 'Books said (Rs.)', key: 'suggested', width: 18 },
      { header: 'Adopted by', key: 'createdByName', width: 20 },
      { header: 'Note', key: 'note', width: 50 },
    ],
    openings.map((opening) => {
      const balancesJson = (opening as unknown as { balancesJson?: string }).balancesJson
      const adopted = balancesJson
        ? Object.values(JSON.parse(balancesJson) as Record<string, number>).reduce(
            (sum, amount) => sum + amount,
            0
          )
        : Object.values(opening.balances ?? {}).reduce((sum, amount) => sum + amount, 0)

      return { ...opening, adopted: rupees(adopted), suggested: rupees(opening.suggestedTotalPaise) }
    })
  )
}

/**
 * Accounts, without anything that could be used to sign in as somebody.
 *
 * A backup holds no passwords — Appwrite does not hand them out and this script has
 * nothing to leak — but an exported spreadsheet travels further than a database does,
 * so it carries the names and roles the club needs and nothing more.
 */
if (backup.users && backup.users.length > 0) {
  sheet(
    'Accounts',
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Roles', key: 'roles', width: 20 },
      { header: 'Status', key: 'status' },
    ],
    backup.users.map((user) => ({
      name: user.name,
      email: user.email,
      roles: Array.isArray(user.labels) ? user.labels.join(', ') : '',
      status: user.status === false ? 'disabled' : 'active',
    }))
  )
}

// ---------------------------------------------------------------------------
// Write it
// ---------------------------------------------------------------------------

const out = resolve(
  process.cwd(),
  argument('out') ?? path.replace(/\.json$/, '') + '-books.xlsx'
)

mkdirSync(dirname(out), { recursive: true })
await workbook.xlsx.writeFile(out)

log(`→ wrote ${out}`)
log('')
log(`  backup taken   ${backup.takenAt}`)
log(`  sheets         ${workbook.worksheets.map((worksheet) => worksheet.name).join(', ')}`)
log(`  total held     Rs. ${rupees(totalFundsPaise(balances)).toFixed(2)}`)
log('')
log('Opens in Excel, Numbers, LibreOffice or Google Sheets — no server, no sign-in.')
log('Keep it beside the .json backup: the spreadsheet is for reading, the JSON restores.')
