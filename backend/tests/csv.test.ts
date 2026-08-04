import { describe, expect, it } from 'vitest'

import {
  parseCategoriesCsv,
  parseCsv,
  parseFundsCsv,
  parseTransactionsCsv,
  toIsoDate,
} from '../src/domain/csv.js'
import { TREASURER } from './helpers/fixtures.js'

const CONTEXT = {
  fundsByName: new Map([
    ['cash box', 'fund-cash'],
    ['bank account', 'fund-bank'],
  ]),
  categoriesByName: new Map([
    ['income:membership fees', 'cat-fees'],
    ['expense:ground maintenance', 'cat-ground'],
  ]),
  actor: { uid: TREASURER.uid, name: TREASURER.name },
}

describe('parseCsv', () => {
  it('reads quoted fields containing commas and newlines', () => {
    const rows = parseCsv('a,b\n"one, two","line\nbreak"\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['one, two', 'line\nbreak'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hello"""\n')).toEqual([['a'], ['say "hello"']])
  })

  it('handles CRLF line endings from Excel', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips a byte-order mark so the first header is not corrupted', () => {
    const rows = parseCsv('﻿name,kind\nCash box,cash\n')
    expect(rows[0]).toEqual(['name', 'kind'])
  })

  it('drops blank and whitespace-only lines', () => {
    expect(parseCsv('a\n\n1\n   \n')).toEqual([['a'], ['1']])
  })

  it('keeps the last row when the file has no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('funds.csv', () => {
  it('parses a valid file', () => {
    const result = parseFundsCsv(
      'name,kind,opening_balance,opening_date\nCash box,cash,5000,2026-04-01\nBank account,bank,"20,000.50",2026-04-01\n'
    )

    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]?.openingBalancePaise).toBe(500_000)
    expect(result.rows[1]?.openingBalancePaise).toBe(2_000_050)
  })

  it('reports a missing column once, naming it, rather than every row', () => {
    const result = parseFundsCsv('name,kind\nCash box,cash\n')

    expect(result.rows).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toContain('opening_balance')
  })

  it('rejects an unknown fund kind and says what is allowed', () => {
    const result = parseFundsCsv(
      'name,kind,opening_balance,opening_date\nPetty,wallet,100,2026-04-01\n'
    )

    expect(result.rows).toEqual([])
    expect(result.errors[0]?.column).toBe('kind')
    expect(result.errors[0]?.message).toContain('cash')
  })

  it('catches a duplicate fund name in the file', () => {
    const result = parseFundsCsv(
      'name,kind,opening_balance,opening_date\nCash box,cash,100,2026-04-01\nCash box,cash,200,2026-04-01\n'
    )

    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true)
  })

  /**
   * The club's opening balances were rejected by this column.
   *
   * They had typed the file from the template and their spreadsheet reformatted the
   * date to the local convention on its own — `2026-04-01` came back as `01/04/26`.
   * Demanding ISO was correct storage and a bad ask.
   */
  it('accepts a date a spreadsheet has reformatted, reading it day first', () => {
    const result = parseFundsCsv(
      'name,kind,opening_balance,opening_date\nBank account,bank,49460,01/04/26\n'
    )

    expect(result.errors).toEqual([])
    expect(result.rows[0]?.openingDate).toBe('2026-04-01')
    expect(result.rows[0]?.openingBalancePaise).toBe(4_946_000)
  })

  it('still rejects a date that is not a real day', () => {
    const result = parseFundsCsv(
      'name,kind,opening_balance,opening_date\nCash box,cash,0,31/02/2026\n'
    )

    expect(result.rows).toEqual([])
    expect(result.errors[0]?.column).toBe('opening_date')
  })
})

describe('dates as a spreadsheet writes them', () => {
  it('passes ISO through unchanged', () => {
    expect(toIsoDate('2026-04-01')).toBe('2026-04-01')
  })

  it('reads slashes and dots and hyphens, day first', () => {
    for (const input of ['01/04/2026', '01-04-2026', '01.04.2026', '1/4/2026']) {
      expect(toIsoDate(input), input).toBe('2026-04-01')
    }
  })

  it('reads a two-digit year as this century', () => {
    expect(toIsoDate('01/04/26')).toBe('2026-04-01')
    expect(toIsoDate('15/08/47')).toBe('2047-08-15')
    // 80–99 goes back a century, so an old record does not land in the future.
    expect(toIsoDate('15/08/97')).toBe('1997-08-15')
  })

  it('is unambiguous when the day is above twelve', () => {
    expect(toIsoDate('25/12/2026')).toBe('2026-12-25')
  })

  it('rejects a day that does not exist rather than rolling it forward', () => {
    // Date.parse('2026-02-31') succeeds and silently becomes 3 March.
    expect(toIsoDate('31/02/2026')).toBeNull()
    expect(toIsoDate('32/01/2026')).toBeNull()
    expect(toIsoDate('01/13/2026')).toBeNull()
  })

  it('rejects anything that is not a date at all', () => {
    for (const input of ['', '   ', 'April', '2026', '1/2/3/4', '2026-4-1-']) {
      expect(toIsoDate(input), input).toBeNull()
    }
  })
})

describe('categories.csv', () => {
  it('parses income and expense headings', () => {
    const result = parseCategoriesCsv('name,kind\nMembership fees,income\nGround,expense\n')

    expect(result.errors).toEqual([])
    expect(result.rows.map((r) => r.kind)).toEqual(['income', 'expense'])
  })

  it('allows the same name as both an income and an expense heading', () => {
    const result = parseCategoriesCsv('name,kind\nEvents,income\nEvents,expense\n')
    expect(result.errors).toEqual([])
  })

  it('rejects a kind that is neither income nor expense', () => {
    const result = parseCategoriesCsv('name,kind\nMisc,other\n')
    expect(result.errors[0]?.column).toBe('kind')
  })
})

describe('transactions.csv', () => {
  const HEADER = 'date,kind,amount,fund,to_fund,category,source,description,reference'

  it('parses income, expense and transfer rows', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n` +
        '2026-04-05,income,1500,Cash box,,Membership fees,Member dues,April subscriptions,\n' +
        '2026-04-08,expense,750.50,Cash box,,Ground maintenance,Contractor,Grass cutting,BILL-12\n' +
        '2026-04-09,transfer,1000,Cash box,Bank account,,Internal,Cash deposited,\n',
      CONTEXT
    )

    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]?.amountPaise).toBe(150_000)
    expect(result.rows[1]?.amountPaise).toBe(75_050)
    expect(result.rows[1]?.externalReference).toBe('BILL-12')
    expect(result.rows[2]?.toFundId).toBe('fund-bank')
    expect(result.rows[2]?.categoryId).toBeUndefined()
  })

  it('stamps every row with the officer who imported it', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-04-05,income,1500,Cash box,,Membership fees,Dues,April,\n`,
      CONTEXT
    )

    expect(result.rows[0]?.createdBy).toBe(TREASURER.uid)
  })

  it('imports nothing when any row is invalid', () => {
    // All-or-nothing: a half-imported cash book cannot be reconciled, and you
    // cannot tell from the result which half is missing.
    const result = parseTransactionsCsv(
      `${HEADER}\n` +
        '2026-04-05,income,1500,Cash box,,Membership fees,Dues,Good row,\n' +
        '2026-04-06,income,oops,Cash box,,Membership fees,Dues,Bad row,\n',
      CONTEXT
    )

    expect(result.rows).toEqual([])
    expect(result.errors).toHaveLength(1)
  })

  it('points at the spreadsheet line the club sees, counting the header', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n` +
        '2026-04-05,income,1500,Cash box,,Membership fees,Dues,Row on line 2,\n' +
        '2026-13-99,income,1500,Cash box,,Membership fees,Dues,Row on line 3,\n',
      CONTEXT
    )

    expect(result.errors[0]?.line).toBe(3)
    expect(result.errors[0]?.column).toBe('date')
  })

  it('rejects a date that looks valid but does not exist', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-02-30,income,100,Cash box,,Membership fees,Dues,Impossible,\n`,
      CONTEXT
    )

    expect(result.errors[0]?.column).toBe('date')
  })

  it('names the unknown fund or category rather than failing vaguely', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-04-05,income,100,Petty cash,,Membership fees,Dues,Wrong fund,\n`,
      CONTEXT
    )

    expect(result.errors[0]?.column).toBe('fund')
    expect(result.errors[0]?.value).toBe('Petty cash')
  })

  it('matches fund and category names regardless of case', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-04-05,income,100,CASH BOX,,MEMBERSHIP FEES,Dues,Shouty,\n`,
      CONTEXT
    )

    expect(result.errors).toEqual([])
    expect(result.rows[0]?.fundId).toBe('fund-cash')
  })

  it('requires a destination fund for a transfer, and refuses a self-transfer', () => {
    const missing = parseTransactionsCsv(
      `${HEADER}\n2026-04-09,transfer,100,Cash box,,,Internal,No destination,\n`,
      CONTEXT
    )
    expect(missing.errors[0]?.column).toBe('to_fund')

    const same = parseTransactionsCsv(
      `${HEADER}\n2026-04-09,transfer,100,Cash box,Cash box,,Internal,Same fund,\n`,
      CONTEXT
    )
    expect(same.errors[0]?.column).toBe('to_fund')
  })

  it('refuses a category on a transfer', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-04-09,transfer,100,Cash box,Bank account,Membership fees,Internal,Bad,\n`,
      CONTEXT
    )
    expect(result.errors[0]?.column).toBe('category')
  })

  it('requires an amount above zero', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-04-05,income,0,Cash box,,Membership fees,Dues,Zero,\n`,
      CONTEXT
    )
    expect(result.errors[0]?.column).toBe('amount')
  })

  it('tolerates rupee symbols and thousands separators in the amount', () => {
    const result = parseTransactionsCsv(
      `${HEADER}\n2026-04-05,income,"₹1,23,456.78",Cash box,,Membership fees,Dues,Formatted,\n`,
      CONTEXT
    )

    expect(result.errors).toEqual([])
    expect(result.rows[0]?.amountPaise).toBe(12_345_678)
  })

  it('accepts columns in any order and with untidy header spacing', () => {
    const result = parseTransactionsCsv(
      'Description, Amount ,Kind,DATE,Fund,Source,Category\n' +
        'April subs,1500,income,2026-04-05,Cash box,Dues,Membership fees\n',
      CONTEXT
    )

    expect(result.errors).toEqual([])
    expect(result.rows[0]?.amountPaise).toBe(150_000)
  })

  it('reports an empty file plainly', () => {
    const result = parseTransactionsCsv('', CONTEXT)
    expect(result.errors[0]?.message).toContain('empty')
  })
})
