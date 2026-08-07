import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Who may see the club's money, who may move it, and the two switches between.
 *
 * The club has a Cultural Secretary and a Game Secretary. Neither keeps the books, so
 * neither can record an entry — but they organise the events the money is spent on, so
 * they ship able to *read* the accounts. The club asked to be able to change that later
 * in both directions, without a code change and without asking anybody: promote them by
 * naming them in `FINANCE_ROLES_FULL`, demote them by moving the word back to
 * `FINANCE_ROLES_READONLY`.
 *
 * A switch nobody has tested in both positions is a switch that works in one of them, so
 * these cover both, plus the three ways the variables must refuse to misbehave: they
 * cannot take access away from the four who keep the books, they cannot invent a role out
 * of a typo, and full beats read-only when a word appears in both.
 *
 * Modules are reset between tests because the sets are read once and cached, which is
 * deliberate: a permission set that changed between two requests in one session would be
 * very hard to reason about.
 */

const ORIGINAL = {
  readOnly: process.env.FINANCE_ROLES_READONLY,
  full: process.env.FINANCE_ROLES_FULL,
}

/** May the role move money — record, approve, reverse, verify a payment? */
async function canRecord(role: string): Promise<boolean> {
  vi.resetModules()
  const { isFinanceOfficer } = await import('../src/domain/approval.js')
  return isFinanceOfficer(role as never)
}

/** May the role open the office area at all, whether or not it may act there? */
async function canView(role: string): Promise<boolean> {
  vi.resetModules()
  const { canViewFinances } = await import('../src/domain/approval.js')
  return canViewFinances(role as never)
}

beforeEach(() => {
  delete process.env.FINANCE_ROLES_READONLY
  delete process.env.FINANCE_ROLES_FULL
})

afterEach(() => {
  for (const [name, value] of [
    ['FINANCE_ROLES_READONLY', ORIGINAL.readOnly],
    ['FINANCE_ROLES_FULL', ORIGINAL.full],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  vi.resetModules()
})

describe('as the club ships it', () => {
  it('keeps the books with the four who keep the books', async () => {
    for (const role of ['treasurer', 'secretary', 'president', 'administrator']) {
      expect(await canRecord(role)).toBe(true)
      expect(await canView(role)).toBe(true)
    }
  })

  it('lets the cultural and game secretary read the accounts', async () => {
    // The default comes from env.ts, not from this test setting anything, because the
    // default is the thing the club is actually running.
    expect(await canView('culturalSecretary')).toBe(true)
    expect(await canView('gameSecretary')).toBe(true)
  })

  it('does not let them change anything', async () => {
    expect(await canRecord('culturalSecretary')).toBe(false)
    expect(await canRecord('gameSecretary')).toBe(false)
  })

  it('shows an ordinary member nothing at all', async () => {
    expect(await canView('member')).toBe(false)
    expect(await canRecord('member')).toBe(false)
  })
})

describe('promoting a role to full access', () => {
  it('lets in exactly the role named', async () => {
    process.env.FINANCE_ROLES_READONLY = 'gameSecretary'
    process.env.FINANCE_ROLES_FULL = 'culturalSecretary'

    expect(await canRecord('culturalSecretary')).toBe(true)
    // Promoting one does not promote the other, and says nothing about members.
    expect(await canRecord('gameSecretary')).toBe(false)
    expect(await canView('gameSecretary')).toBe(true)
    expect(await canRecord('member')).toBe(false)
  })

  it('takes a list, with the spacing somebody would actually type', async () => {
    process.env.FINANCE_ROLES_FULL = ' culturalSecretary , gameSecretary '

    expect(await canRecord('culturalSecretary')).toBe(true)
    expect(await canRecord('gameSecretary')).toBe(true)
  })

  it('does not mind the capital letter', async () => {
    // Nobody typing into a dashboard should have to guess at camel case.
    process.env.FINANCE_ROLES_FULL = 'culturalsecretary'
    expect(await canRecord('culturalSecretary')).toBe(true)
  })

  it('wins over read-only when a role is named in both', async () => {
    // The reading in which nobody is mysteriously refused a button they were promised.
    process.env.FINANCE_ROLES_READONLY = 'culturalSecretary'
    process.env.FINANCE_ROLES_FULL = 'culturalSecretary'

    expect(await canRecord('culturalSecretary')).toBe(true)
  })
})

describe('demoting a role back to read-only', () => {
  it('takes the buttons away and leaves the screens', async () => {
    process.env.FINANCE_ROLES_READONLY = 'culturalSecretary,gameSecretary'
    process.env.FINANCE_ROLES_FULL = ''

    for (const role of ['culturalSecretary', 'gameSecretary']) {
      expect(await canView(role)).toBe(true)
      expect(await canRecord(role)).toBe(false)
    }
  })

  it('can shut a role out of the office area entirely', async () => {
    // Emptying both variables is how a club removes the read-only grant altogether.
    process.env.FINANCE_ROLES_READONLY = ''

    expect(await canView('culturalSecretary')).toBe(false)
    expect(await canRecord('culturalSecretary')).toBe(false)
    expect(await canView('treasurer')).toBe(true)
  })
})

describe('what the variables refuse to do', () => {
  it('cannot take access away from the four core roles', async () => {
    // Whatever is in the variables, the people who keep the books keep their books. A
    // mistyped setting must not be able to lock a club out of its own accounts.
    process.env.FINANCE_ROLES_READONLY = 'treasurer,president'
    process.env.FINANCE_ROLES_FULL = 'member'

    for (const role of ['treasurer', 'secretary', 'president', 'administrator']) {
      expect(await canRecord(role)).toBe(true)
    }
  })

  it('ignores a word that is not a role, rather than inventing one', async () => {
    process.env.FINANCE_ROLES_READONLY = ''
    process.env.FINANCE_ROLES_FULL = 'cultural secretary,chief-of-cakes'

    // 'cultural secretary' with a space is not the stored role — labels are one
    // alphanumeric word — so it is ignored and logged rather than half-matched.
    expect(await canRecord('culturalSecretary')).toBe(false)
    expect(await canView('culturalSecretary')).toBe(false)
  })

  it('treats a value of only separators as "nobody"', async () => {
    process.env.FINANCE_ROLES_READONLY = '   ,  ,'

    expect(await canView('culturalSecretary')).toBe(false)
    expect(await canRecord('treasurer')).toBe(true)
  })
})
