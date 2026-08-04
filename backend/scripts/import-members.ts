/**
 * Create club accounts in bulk from a CSV, with their roles.
 *
 *   npm run members:import                              # checks, writes nothing
 *   npm run members:import -- --write                   # applies it
 *   npm run members:import -- --file ../data/club/members.csv --write
 *
 * Columns: `name,email,role`. Header required, order free, extra columns ignored so a
 * spreadsheet the club already keeps can be used with columns it needs for other
 * purposes.
 *
 * ## Why this exists rather than a loop around `npm run user -- create`
 *
 * Fifty invocations is fifty chances to mistype one, and the failure mode of getting a
 * *role* wrong is somebody who cannot see the club's accounts, or somebody who can.
 * Validating the whole file before writing anything means a typo in row forty is found
 * before row one has been created.
 *
 * ## Safety properties, in order of how much they matter
 *
 *   * **Nothing is written unless every row parses.** A partial import leaves the club
 *     unsure which half happened.
 *   * **Existing accounts are never re-created.** Matched by email; their role is
 *     updated if the file disagrees, which is reported explicitly because silently
 *     changing who can see the finances would be the worst possible quiet behaviour.
 *   * **Passwords are generated, shown once, and never written to disk.** A file of
 *     working passwords for every member of the club is a liability nobody asked for.
 *     `--reset-only` skips showing them at all, for the safer flow where members set
 *     their own through "Reset password".
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

import { ID, Query } from 'node-appwrite'

import { getUsers } from '../src/config/appwrite.js'
import { ROLES, type Role } from '../src/config/constants.js'
import { hasAppwriteCredentials } from '../src/config/env.js'
import { parseCsv } from '../src/domain/csv.js'

/**
 * Words the club actually uses, mapped to the roles the system has.
 *
 * "Cashier" and "accountant" both mean `treasurer` here, and someone filling in a
 * spreadsheet has no reason to know that. Accepting the synonym and **saying what it
 * became** is better than refusing the file over vocabulary, and far better than
 * accepting it silently — the mapping is printed for every row that uses one.
 */
const ROLE_SYNONYMS: Record<string, Role> = {
  cashier: 'treasurer',
  accountant: 'treasurer',
  treasurer: 'treasurer',
  'joint secretary': 'secretary',
  secretary: 'secretary',
  president: 'president',
  chairman: 'president',
  admin: 'administrator',
  administrator: 'administrator',
  member: 'member',
  'ordinary member': 'member',
  'general member': 'member',
  volunteer: 'volunteer',
  visitor: 'visitor',
}

interface MemberRow {
  line: number
  name: string
  email: string
  role: Role
  /** What the file said, when it was not the canonical role name. */
  wrote?: string
}

interface RowProblem {
  line: number
  message: string
}

function exit(message: string): never {
  console.error(`\nerror: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv: string[]) {
  const fileIndex = argv.indexOf('--file')
  return {
    write: argv.includes('--write'),
    resetOnly: argv.includes('--reset-only'),
    file: fileIndex === -1 ? '../data/club/members.csv' : (argv[fileIndex + 1] ?? ''),
  }
}

/** Column indexes from the header, so the order in the file does not matter. */
function headerIndexes(header: string[]): { name: number; email: number; role: number } {
  const find = (want: string) =>
    header.findIndex((cell) => cell.trim().toLowerCase().replace(/\s+/g, '') === want)

  const name = find('name')
  const email = find('email')
  const role = find('role')

  if (name === -1 || email === -1 || role === -1) {
    exit(
      'The header must include name, email and role.\n' +
        `       Found: ${header.join(', ') || '(nothing)'}\n` +
        '       Example: name,email,role'
    )
  }

  return { name, email, role }
}

// Deliberately simple. A full RFC 5322 matcher accepts addresses no mail server here
// will ever deliver to, and the cost of a wrong address is a member who cannot reset
// their password.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function readRows(path: string): { rows: MemberRow[]; problems: RowProblem[] } {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    exit(`Could not read ${path}`)
  }

  const table = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''))
  if (table.length === 0) exit(`${path} is empty.`)

  const [header, ...body] = table
  const index = headerIndexes(header ?? [])

  const rows: MemberRow[] = []
  const problems: RowProblem[] = []
  const seen = new Map<string, number>()

  body.forEach((cells, offset) => {
    // +2: one for the header, one because humans count from 1.
    const line = offset + 2
    const name = (cells[index.name] ?? '').trim()
    const email = (cells[index.email] ?? '').trim().toLowerCase()
    const rawRole = (cells[index.role] ?? '').trim()

    if (name === '') problems.push({ line, message: 'name is empty' })
    if (!EMAIL.test(email)) {
      problems.push({ line, message: `"${email}" does not look like an email address` })
    }

    const key = rawRole.toLowerCase().replace(/\s+/g, ' ')
    const role = ROLE_SYNONYMS[key]
    if (!role) {
      problems.push({
        line,
        message:
          `role "${rawRole}" is not recognised. Use one of: ${ROLES.join(', ')}\n` +
          `              (cashier and accountant are accepted and mean treasurer)`,
      })
    }

    // A duplicated address would create one account and then silently reassign its
    // role from the second row — the kind of thing noticed months later.
    const previous = seen.get(email)
    if (previous !== undefined) {
      problems.push({ line, message: `${email} also appears on line ${previous}` })
    } else if (email !== '') {
      seen.set(email, line)
    }

    if (name !== '' && EMAIL.test(email) && role) {
      rows.push({
        line,
        name,
        email,
        role,
        ...(key === role ? {} : { wrote: rawRole }),
      })
    }
  })

  return { rows, problems }
}

async function findByEmail(email: string) {
  const { users } = await getUsers().list({
    queries: [Query.equal('email', email), Query.limit(2)],
  })

  if (users.length > 1) {
    exit(`More than one account has the address ${email}. Resolve that in the Appwrite console.`)
  }

  return users[0] ?? null
}

async function main(): Promise<void> {
  if (!hasAppwriteCredentials) {
    exit(
      'Appwrite is not configured, so there is no user directory to write to.\n' +
        '       Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env.\n' +
        '       The key needs the Users scope. See docs/10-appwrite.md.'
    )
  }

  const { write, resetOnly, file } = parseArgs(process.argv.slice(2))
  const path = resolve(file)

  const { rows, problems } = readRows(path)

  console.log(`\nReading ${path}`)
  console.log(`  ${rows.length} usable row${rows.length === 1 ? '' : 's'}`)

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`)
    for (const problem of problems) {
      console.error(`  line ${problem.line}  ${problem.message}`)
    }
    console.error('\nNothing was written. Fix the spreadsheet and run again.\n')
    process.exit(1)
  }

  // Work out what would happen before doing any of it, so --write and the dry run
  // report the same plan.
  const users = getUsers()
  const toCreate: MemberRow[] = []
  const toRelabel: Array<MemberRow & { id: string; from: string }> = []
  const unchanged: MemberRow[] = []

  for (const row of rows) {
    const existing = await findByEmail(row.email)

    if (!existing) {
      toCreate.push(row)
      continue
    }

    const current = (existing.labels ?? []).find((label) => ROLES.includes(label as Role))
    if (current === row.role) {
      unchanged.push(row)
    } else {
      toRelabel.push({ ...row, id: existing.$id, from: current ?? '(none)' })
    }
  }

  console.log()
  for (const row of toCreate) {
    const noted = row.wrote ? `  (from "${row.wrote}")` : ''
    console.log(`  create    ${row.email.padEnd(34)} ${row.role}${noted}`)
  }
  for (const row of toRelabel) {
    console.log(`  role      ${row.email.padEnd(34)} ${row.from} -> ${row.role}`)
  }
  for (const row of unchanged) {
    console.log(`  unchanged ${row.email.padEnd(34)} ${row.role}`)
  }

  if (toRelabel.length > 0) {
    console.log(
      `\n  ${toRelabel.length} existing account(s) would have their role changed. Roles decide who` +
        '\n  can see the club’s accounts, so check that list before applying it.'
    )
  }

  if (!write) {
    console.log('\nThis was a check only. Add --write to apply it.\n')
    return
  }

  const created: Array<{ email: string; password: string }> = []

  for (const row of toCreate) {
    // 18 random bytes as base64url: comfortably beyond Appwrite's 8 character minimum,
    // and meant to be replaced by the member anyway.
    const password = randomBytes(18).toString('base64url')
    const user = await users.create({
      userId: ID.unique(),
      email: row.email,
      password,
      name: row.name,
    })
    await users.updateLabels({ userId: user.$id, labels: [row.role] })
    created.push({ email: row.email, password })
    console.log(`  created   ${row.email}`)
  }

  for (const row of toRelabel) {
    await users.updateLabels({ userId: row.id, labels: [row.role] })
    console.log(`  relabeled ${row.email}  -> ${row.role}`)
  }

  console.log(
    `\nDone. ${created.length} created, ${toRelabel.length} role change(s), ` +
      `${unchanged.length} already correct.`
  )

  if (created.length === 0) return

  if (resetOnly) {
    console.log(
      '\nPasswords were generated but deliberately not shown (--reset-only).\n' +
        'Tell each member their address is registered and to use "Reset password"\n' +
        'on the sign-in page. Nobody but they ever knows the password.\n'
    )
    return
  }

  console.log('\n  temporary passwords — shown once, stored nowhere:\n')
  for (const entry of created) {
    console.log(`    ${entry.email.padEnd(34)} ${entry.password}`)
  }
  console.log(
    '\n  Give these out over a channel you trust and ask each person to change it in\n' +
      '  the portal. Better still, run with --reset-only next time and have members set\n' +
      '  their own through "Reset password" — then no list like this exists at all.\n' +
      '\n  Do not redirect this into a file. A file of working passwords for every member\n' +
      '  of the club is a liability, and it will outlive the reason it was created.\n'
  )
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
