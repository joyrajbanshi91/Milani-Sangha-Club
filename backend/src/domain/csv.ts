import { isIsoDate } from './dates.js'
import { MoneyError, rupeesToPaise } from './money.js'
import type { Category, Fund, TransactionDraft } from './types.js'
import { CATEGORY_KINDS, FUND_KINDS, TRANSACTION_KINDS } from '../config/constants.js'

/**
 * CSV import for the finance area.
 *
 * The club fills in a spreadsheet; this turns it into pending entries. Two
 * decisions shape the whole module:
 *
 *   • **Nothing is imported unless every row is valid.** A half-imported cash
 *     book is worse than a rejected one — you cannot tell what is missing. The
 *     parser therefore collects every error with its row number and the offending
 *     value, so the club can fix the spreadsheet in one pass.
 *
 *   • **Imported entries arrive as pending, as one batch.** A batch is approved
 *     by a second officer in a single decision, because asking someone to approve
 *     four hundred rows individually guarantees they will stop reading.
 */

export interface RowError {
  /** 1-based line number in the file as the club sees it in their spreadsheet. */
  line: number
  column: string
  value: string
  message: string
}

export interface ParseResult<T> {
  rows: T[]
  errors: RowError[]
}

/**
 * Minimal RFC 4180 reader: quoted fields, escaped quotes, embedded commas and
 * newlines, CRLF or LF. Written out rather than taken from a library because the
 * input is a handful of columns and a dependency that parses everything is a
 * dependency that can also parse something unexpected.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  // A byte-order mark from Excel would otherwise become part of the first header.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  while (index < input.length) {
    const char = input[index]

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"') {
      quoted = true
      index += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      index += 1
      continue
    }

    field += char
    index += 1
  }

  // Whatever is buffered when the file ends is the last field of the last row.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop blank lines — trailing newlines and spacer rows are normal in exports.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

interface Table {
  header: string[]
  rows: Array<{ line: number; cells: Record<string, string> }>
}

/** Header names are compared case- and space-insensitively. */
function normaliseHeader(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_')
}

function toTable(text: string, required: readonly string[]): ParseResult<never> | Table {
  const raw = parseCsv(text)
  const headerRow = raw[0]

  if (!headerRow) {
    return { rows: [], errors: [{ line: 1, column: '', value: '', message: 'The file is empty.' }] }
  }

  const header = headerRow.map(normaliseHeader)
  const missing = required.filter((column) => !header.includes(column))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          column: missing.join(', '),
          value: headerRow.join(','),
          message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template in data/demo/.`,
        },
      ],
    }
  }

  const rows = raw.slice(1).map((cells, offset) => {
    const record: Record<string, string> = {}
    header.forEach((name, column) => {
      record[name] = (cells[column] ?? '').trim()
    })
    // +2: one for the header row, one because spreadsheets count from 1.
    return { line: offset + 2, cells: record }
  })

  return { header, rows }
}

function isTable(value: ParseResult<never> | Table): value is Table {
  return 'header' in value
}

// ---------------------------------------------------------------------------
// funds.csv
// ---------------------------------------------------------------------------

const FUND_COLUMNS = ['name', 'kind', 'opening_balance', 'opening_date'] as const

export function parseFundsCsv(text: string): ParseResult<Omit<Fund, 'id'>> {
  const table = toTable(text, FUND_COLUMNS)
  if (!isTable(table)) return { rows: [], errors: table.errors }

  const rows: Array<Omit<Fund, 'id'>> = []
  const errors: RowError[] = []
  const seen = new Set<string>()

  for (const { line, cells } of table.rows) {
    const name = cells.name ?? ''
    const kind = (cells.kind ?? '').toLowerCase()
    const opening = cells.opening_balance ?? ''
    const openingDate = cells.opening_date ?? ''

    if (name === '') errors.push({ line, column: 'name', value: name, message: 'Name is required.' })
    if (seen.has(name.toLowerCase())) {
      errors.push({ line, column: 'name', value: name, message: 'Duplicate fund name in the file.' })
    }
    seen.add(name.toLowerCase())

    if (!FUND_KINDS.includes(kind as Fund['kind'])) {
      errors.push({
        line,
        column: 'kind',
        value: kind,
        message: `Must be one of: ${FUND_KINDS.join(', ')}.`,
      })
    }

    let openingBalancePaise = 0
    try {
      openingBalancePaise = opening === '' ? 0 : rupeesToPaise(opening)
    } catch (error) {
      errors.push({
        line,
        column: 'opening_balance',
        value: opening,
        message: error instanceof MoneyError ? error.message : 'Invalid amount.',
      })
    }

    if (!isIsoDate(openingDate)) {
      errors.push({
        line,
        column: 'opening_date',
        value: openingDate,
        message: 'Use the format YYYY-MM-DD, e.g. 2026-04-01.',
      })
    }

    rows.push({
      name,
      kind: kind as Fund['kind'],
      openingBalancePaise,
      openingDate,
      active: (cells.active ?? 'yes').toLowerCase() !== 'no',
      ...(cells.notes ? { notes: cells.notes } : {}),
    })
  }

  return { rows: errors.length > 0 ? [] : rows, errors }
}

// ---------------------------------------------------------------------------
// categories.csv
// ---------------------------------------------------------------------------

export function parseCategoriesCsv(text: string): ParseResult<Omit<Category, 'id'>> {
  const table = toTable(text, ['name', 'kind'])
  if (!isTable(table)) return { rows: [], errors: table.errors }

  const rows: Array<Omit<Category, 'id'>> = []
  const errors: RowError[] = []
  const seen = new Set<string>()

  for (const { line, cells } of table.rows) {
    const name = cells.name ?? ''
    const kind = (cells.kind ?? '').toLowerCase()

    if (name === '') errors.push({ line, column: 'name', value: name, message: 'Name is required.' })

    const key = `${kind}:${name.toLowerCase()}`
    if (seen.has(key)) {
      errors.push({ line, column: 'name', value: name, message: 'Duplicate category in the file.' })
    }
    seen.add(key)

    if (!CATEGORY_KINDS.includes(kind as Category['kind'])) {
      errors.push({
        line,
        column: 'kind',
        value: kind,
        message: `Must be either ${CATEGORY_KINDS.join(' or ')}.`,
      })
    }

    rows.push({
      name,
      kind: kind as Category['kind'],
      active: (cells.active ?? 'yes').toLowerCase() !== 'no',
      ...(cells.notes ? { notes: cells.notes } : {}),
    })
  }

  return { rows: errors.length > 0 ? [] : rows, errors }
}

// ---------------------------------------------------------------------------
// transactions.csv
// ---------------------------------------------------------------------------

const TRANSACTION_COLUMNS = ['date', 'kind', 'amount', 'fund', 'source', 'description'] as const

export interface TransactionCsvContext {
  /** Fund name (lower case) → id. */
  fundsByName: ReadonlyMap<string, string>
  /** '<kind>:<name>' (lower case) → id. */
  categoriesByName: ReadonlyMap<string, string>
  actor: { uid: string; name: string }
}

/**
 * Turn transaction rows into drafts.
 *
 * Funds and categories are referenced **by name**, not by id: the club fills this
 * in from a cash book, and asking a treasurer to paste document ids would
 * guarantee mistakes. Unknown names are reported with the offending value so the
 * spelling can be corrected.
 */
export function parseTransactionsCsv(
  text: string,
  context: TransactionCsvContext
): ParseResult<TransactionDraft> {
  const table = toTable(text, TRANSACTION_COLUMNS)
  if (!isTable(table)) return { rows: [], errors: table.errors }

  const rows: TransactionDraft[] = []
  const errors: RowError[] = []

  for (const { line, cells } of table.rows) {
    const date = cells.date ?? ''
    const kind = (cells.kind ?? '').toLowerCase()
    const amount = cells.amount ?? ''
    const fundName = cells.fund ?? ''
    const toFundName = cells.to_fund ?? ''
    const categoryName = cells.category ?? ''
    const source = cells.source ?? ''
    const description = cells.description ?? ''

    if (!isIsoDate(date)) {
      errors.push({
        line,
        column: 'date',
        value: date,
        message: 'Use the format YYYY-MM-DD, e.g. 2026-04-15.',
      })
    }

    if (!TRANSACTION_KINDS.includes(kind as TransactionDraft['kind'])) {
      errors.push({
        line,
        column: 'kind',
        value: kind,
        message: `Must be one of: ${TRANSACTION_KINDS.join(', ')}.`,
      })
    }

    let amountPaise = 0
    try {
      amountPaise = rupeesToPaise(amount)
      if (amountPaise === 0) {
        errors.push({ line, column: 'amount', value: amount, message: 'Amount must be more than 0.' })
      }
    } catch (error) {
      errors.push({
        line,
        column: 'amount',
        value: amount,
        message: error instanceof MoneyError ? error.message : 'Invalid amount.',
      })
    }

    const fundId = context.fundsByName.get(fundName.toLowerCase())
    if (!fundId) {
      errors.push({
        line,
        column: 'fund',
        value: fundName,
        message: 'No fund with this name. Check funds.csv, or the spelling here.',
      })
    }

    let toFundId: string | undefined
    let categoryId: string | undefined

    if (kind === 'transfer') {
      toFundId = context.fundsByName.get(toFundName.toLowerCase())
      if (!toFundId) {
        errors.push({
          line,
          column: 'to_fund',
          value: toFundName,
          message: 'A transfer needs a destination fund.',
        })
      } else if (toFundId === fundId) {
        errors.push({
          line,
          column: 'to_fund',
          value: toFundName,
          message: 'A transfer must be between two different funds.',
        })
      }
      if (categoryName !== '') {
        errors.push({
          line,
          column: 'category',
          value: categoryName,
          message: 'Leave category blank for a transfer.',
        })
      }
    } else if (kind === 'income' || kind === 'expense') {
      categoryId = context.categoriesByName.get(`${kind}:${categoryName.toLowerCase()}`)
      if (!categoryId) {
        errors.push({
          line,
          column: 'category',
          value: categoryName,
          message: `No ${kind} category with this name. Check categories.csv, or the spelling here.`,
        })
      }
    }

    if (source === '') {
      errors.push({
        line,
        column: 'source',
        value: source,
        message: 'Say where the money came from or went to.',
      })
    }
    if (description === '') {
      errors.push({ line, column: 'description', value: description, message: 'Required.' })
    }

    rows.push({
      kind: kind as TransactionDraft['kind'],
      date,
      amountPaise,
      fundId: fundId ?? '',
      ...(toFundId ? { toFundId } : {}),
      ...(categoryId ? { categoryId } : {}),
      source,
      description,
      ...(cells.reference ? { externalReference: cells.reference } : {}),
      createdBy: context.actor.uid,
      createdByName: context.actor.name,
    })
  }

  // All or nothing: a partially imported cash book cannot be reconciled.
  return { rows: errors.length > 0 ? [] : rows, errors }
}
