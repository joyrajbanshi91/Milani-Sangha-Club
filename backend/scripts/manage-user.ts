/**
 * Create club accounts and grant roles.
 *
 *   npm run user -- create  --email x@club.org --name "Full Name" --role treasurer
 *   npm run user -- role    --email x@club.org --role president
 *   npm run user -- list
 *   npm run user -- disable --email x@club.org
 *
 * Roles live in Appwrite **labels**, which only a server holding an API key can
 * set — that is the whole point. Not prefs: a signed-in member can write their own
 * prefs, so a role kept there could be self-granted. There is no screen for this
 * either, because the first officer has to exist before anyone can sign in to grant
 * anything, and a self-service "make me the treasurer" button would defeat the
 * two-person rule.
 *
 * A role change takes effect on the person's very next request. The API reads the
 * labels each time rather than trusting anything baked into the token, so there is
 * no waiting for a refresh and no need to sign out and in.
 */
import { randomBytes } from 'node:crypto'

import { AppwriteException, ID, Query } from 'node-appwrite'

import { getUsers } from '../src/config/appwrite.js'
import { ROLES, type Role } from '../src/config/constants.js'
import { hasAppwriteCredentials } from '../src/config/env.js'

interface Options {
  email?: string
  name?: string
  role?: string
  password?: string
}

function parseArgs(argv: string[]): { command: string; options: Options } {
  const [command = 'help', ...rest] = argv
  const options: Options = {}

  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.replace(/^--/, '')
    const value = rest[index + 1]
    if (key && value && ['email', 'name', 'role', 'password'].includes(key)) {
      options[key as keyof Options] = value
    }
  }

  return { command, options }
}

function assertRole(value: string | undefined): Role {
  if (!value || !ROLES.includes(value as Role)) {
    exit(`--role must be one of: ${ROLES.join(', ')}`)
  }
  return value as Role
}

function assertEmail(value: string | undefined): string {
  if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    exit('--email is required and must be valid')
  }
  return value
}

function exit(message: string): never {
  console.error(`\nerror: ${message}\n`)
  process.exit(1)
}

function usage(): never {
  console.log(`
Manage club accounts and roles.

  npm run user -- create  --email <email> --name "<name>" --role <role> [--password <password>]
  npm run user -- role    --email <email> --role <role>
  npm run user -- list
  npm run user -- disable --email <email>

Roles: ${ROLES.join(', ')}

Finance roles (see the club's accounts, approve entries):
  treasurer, secretary, president, administrator

Notes
  • Omit --password on create and a strong one is generated and printed once.
    Better still: omit it, then have the person use "Reset password" on the
    sign-in page so nobody else ever sees it.
  • Appwrite requires a password of at least 8 characters.
  • A role change takes effect on their next request — no sign-out needed.
`)
  process.exit(0)
}

/**
 * Appwrite has no "get user by email", so the directory is searched.
 *
 * `Query.equal` rather than the `search` parameter: search is a fuzzy match and
 * would happily return a *different* member whose address merely resembles the one
 * asked for — which, for a command that grants finance roles, is not a mistake
 * worth risking.
 */
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
      'Appwrite is not configured, so there is no user directory to manage.\n' +
        '       Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in backend/.env.\n' +
        '       The key needs the Users scope. See docs/10-appwrite.md.'
    )
  }

  const { command, options } = parseArgs(process.argv.slice(2))
  const users = getUsers()

  switch (command) {
    case 'create': {
      const email = assertEmail(options.email)
      const role = assertRole(options.role)
      const name = options.name ?? email
      // 18 random bytes as base64url: comfortably longer than Appwrite's 8
      // character minimum, and expected to be replaced via password reset anyway.
      const password = options.password ?? randomBytes(18).toString('base64url')

      if (await findByEmail(email)) {
        exit('An account with that email already exists. Use "role" to change its role.')
      }

      const user = await users.create({ userId: ID.unique(), email, password, name })
      await users.updateLabels({ userId: user.$id, labels: [role] })

      console.log(`\ncreated ${email}`)
      console.log(`  id:   ${user.$id}`)
      console.log(`  name: ${name}`)
      console.log(`  role: ${role}`)
      if (!options.password) {
        console.log(`\n  temporary password: ${password}`)
        console.log('  Give this to them over a channel you trust, and ask them to')
        console.log('  change it — or tell them to use "Reset password" instead.\n')
      }
      break
    }

    case 'role': {
      const email = assertEmail(options.email)
      const role = assertRole(options.role)

      const user = await findByEmail(email)
      if (!user) exit('No account with that email.')

      // Replaced, not merged: two role labels on one account would make the role
      // depend on which the API happened to read first.
      await users.updateLabels({ userId: user.$id, labels: [role] })

      console.log(`\n${email} is now: ${role}`)
      console.log('This takes effect on their next request.\n')
      break
    }

    case 'list': {
      const { users: all } = await users.list({ queries: [Query.limit(1000)] })
      if (all.length === 0) {
        console.log('\nNo accounts yet. Create the first one with "create".\n')
        break
      }

      console.log(`\n${all.length} account${all.length === 1 ? '' : 's'}:\n`)
      for (const user of all) {
        const roles = user.labels.filter((label) => ROLES.includes(label as Role))
        const role = roles.join(', ') || '(no role — treated as member)'
        const flags = [
          user.status ? null : 'DISABLED',
          user.emailVerification ? null : 'unverified',
        ]
          .filter(Boolean)
          .join(' ')
        console.log(`  ${(user.email || user.$id).padEnd(34)} ${role.padEnd(16)} ${flags}`)
      }
      console.log()
      break
    }

    case 'disable': {
      const email = assertEmail(options.email)
      const user = await findByEmail(email)
      if (!user) exit('No account with that email.')

      await users.updateStatus({ userId: user.$id, status: false })
      // Blocking the account stops new sign-ins; existing sessions would otherwise
      // keep working, and a JWT minted from one stays valid until it expires.
      await users.deleteSessions({ userId: user.$id })

      console.log(`\n${email} is disabled and their existing sessions are revoked.\n`)
      break
    }

    default:
      usage()
  }
}

main().catch((error: unknown) => {
  if (error instanceof AppwriteException) {
    if (error.type === 'user_already_exists' || error.code === 409) {
      exit('An account with that email already exists. Use "role" to change its role.')
    }
    if (error.type === 'user_not_found' || error.code === 404) exit('No account with that email.')
    if (error.type === 'general_argument_invalid') exit(error.message)
  }
  exit(error instanceof Error ? error.message : String(error))
})
