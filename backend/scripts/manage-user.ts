/**
 * Create club accounts and grant roles.
 *
 *   npm run user -- create  --email x@club.org --name "Full Name" --role treasurer
 *   npm run user -- role    --email x@club.org --role president
 *   npm run user -- list
 *   npm run user -- disable --email x@club.org
 *
 * Roles live in Firebase Auth **custom claims**, which only a server holding the
 * Admin credentials can set — that is the whole point. There is no screen for
 * this, because the first officer has to exist before anyone can sign in to grant
 * anything, and a self-service "make me the treasurer" button would defeat the
 * two-person rule.
 *
 * A role change reaches the browser on the next ID token refresh, within the hour.
 * Tell the person to sign out and in for it to take effect immediately.
 */
import { randomBytes } from 'node:crypto'

import { ROLES, type Role } from '../src/config/constants.js'
import { hasFirebaseCredentials } from '../src/config/env.js'
import { getAdminAuth } from '../src/config/firebase.js'

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
  if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) exit('--email is required and must be valid')
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
  • A role change takes effect when the person's ID token next refreshes
    (within an hour), or immediately if they sign out and back in.
`)
  process.exit(0)
}

async function main(): Promise<void> {
  if (!hasFirebaseCredentials) {
    exit(
      'Firebase Admin credentials are not configured, so there is no real user directory.\n' +
        '       Set GOOGLE_APPLICATION_CREDENTIALS (or the FIREBASE_* trio) in backend/.env.\n' +
        '       See docs/08-going-live.md.'
    )
  }

  const { command, options } = parseArgs(process.argv.slice(2))
  const auth = getAdminAuth()

  switch (command) {
    case 'create': {
      const email = assertEmail(options.email)
      const role = assertRole(options.role)
      const name = options.name ?? email
      // 18 random bytes as base64url: long enough that nobody guesses it, and it
      // is expected to be replaced via the reset-password flow anyway.
      const password = options.password ?? randomBytes(18).toString('base64url')

      const user = await auth.createUser({
        email,
        password,
        displayName: name,
        emailVerified: false,
      })
      await auth.setCustomUserClaims(user.uid, { role })

      console.log(`\ncreated ${email}`)
      console.log(`  uid:  ${user.uid}`)
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

      const user = await auth.getUserByEmail(email)
      // Merged, not replaced: any future claims stay intact.
      await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role })

      console.log(`\n${email} is now: ${role}`)
      console.log('They must sign out and back in for it to take effect immediately.\n')
      break
    }

    case 'list': {
      const { users } = await auth.listUsers(1000)
      if (users.length === 0) {
        console.log('\nNo accounts yet. Create the first one with "create".\n')
        break
      }

      console.log(`\n${users.length} account${users.length === 1 ? '' : 's'}:\n`)
      for (const user of users) {
        const role = (user.customClaims?.role as string | undefined) ?? '(no role — treated as member)'
        const flags = [user.disabled ? 'DISABLED' : null, user.emailVerified ? null : 'unverified']
          .filter(Boolean)
          .join(' ')
        console.log(`  ${(user.email ?? user.uid).padEnd(34)} ${role.padEnd(16)} ${flags}`)
      }
      console.log()
      break
    }

    case 'disable': {
      const email = assertEmail(options.email)
      const user = await auth.getUserByEmail(email)
      await auth.updateUser(user.uid, { disabled: true })
      // Revoke outstanding tokens too, or they stay valid for up to an hour.
      await auth.revokeRefreshTokens(user.uid)
      console.log(`\n${email} is disabled and their existing sessions are revoked.\n`)
      break
    }

    default:
      usage()
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string } | null)?.code
  if (code === 'auth/email-already-exists') {
    exit('An account with that email already exists. Use "role" to change its role.')
  }
  if (code === 'auth/user-not-found') exit('No account with that email.')
  exit(error instanceof Error ? error.message : String(error))
})
