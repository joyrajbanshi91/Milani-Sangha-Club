#!/usr/bin/env node
/**
 * Configure a Netlify project from backend/.env, in one command.
 *
 *   npm run netlify:setup            # show what would be set, change nothing
 *   npm run netlify:setup -- --write # apply it
 *
 * ## Why this exists
 *
 * Setting these by hand in the dashboard went wrong repeatedly, and the design was to
 * blame rather than the person doing it. Six variables, spread across two different
 * variable *scopes*, where the editor defaults to all four scopes and the consequence
 * of a wrong scope is silence: a server API key scoped to Builds is compiled into the
 * browser bundle, and a value scoped only to Functions is invisible to the build. In
 * neither case does anything fail — you just get the demo account picker on a site you
 * have configured correctly-looking six times.
 *
 * Two changes fixed the underlying problem. The API now tells the browser the Appwrite
 * endpoint and project id at runtime through `/auth/config`, so the two `VITE_`
 * variables and the whole Builds scope are gone. And this script sets what remains,
 * reading the values from the file that already holds them, so there is nothing to
 * retype and no scope to tick.
 *
 * The API key is passed with `--secret`, so Netlify will not show it again, and it is
 * never printed here.
 *
 * Requires the Netlify CLI to be logged in and this directory linked to a project:
 *
 *   npx netlify-cli login
 *   npx netlify-cli link
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const write = process.argv.includes('--write')
const root = fileURLToPath(new URL('..', import.meta.url))

/** Minimal dotenv: `KEY=value`, `#` comments, optional quotes. */
function readEnvFile(path) {
  const values = {}
  let contents

  try {
    contents = readFileSync(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return values
    throw error
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const equals = line.indexOf('=')
    if (equals < 1) continue

    const key = line.slice(0, equals).trim()
    let value = line.slice(equals + 1).trim()

    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

const backend = readEnvFile(`${root}backend/.env`)

/**
 * What the deployed function needs.
 *
 * Every one is `functions` scope. There is deliberately no `builds` entry any more:
 * the browser gets the Appwrite endpoint and project id from `/auth/config` at
 * runtime, so nothing about the backing service is compiled into the bundle.
 *
 * `secret: true` means Netlify stores it write-only. Correct for the API key and
 * wrong for everything else — a secret value cannot be read back to check it.
 */
const PLAN = [
  { key: 'APPWRITE_ENDPOINT', from: 'APPWRITE_ENDPOINT', required: true },
  { key: 'APPWRITE_PROJECT_ID', from: 'APPWRITE_PROJECT_ID', required: true },
  { key: 'APPWRITE_API_KEY', from: 'APPWRITE_API_KEY', required: true, secret: true },
  { key: 'APPWRITE_DATABASE_ID', from: 'APPWRITE_DATABASE_ID', required: false },
  { key: 'NODE_ENV', literal: 'production', required: false },
  { key: 'TRUST_PROXY', literal: '1', required: false },
  { key: 'CLUB_NAME', from: 'CLUB_NAME', required: false },
]

function netlify(args, { capture = false } = {}) {
  return execFileSync('npx', ['--yes', 'netlify-cli', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
}

/** Which project is this directory linked to? Refuse to guess. */
function linkedProject() {
  try {
    const status = netlify(['status', '--json'], { capture: true })
    const parsed = JSON.parse(status)
    return parsed.siteData?.name ?? parsed.siteData?.url ?? null
  } catch {
    return null
  }
}

function mask(value) {
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`
}

// ---------------------------------------------------------------------------

const resolved = []
const missing = []

for (const entry of PLAN) {
  const value = entry.literal ?? backend[entry.from]?.trim()

  if (!value) {
    if (entry.required) missing.push(entry.key)
    continue
  }

  resolved.push({ ...entry, value })
}

process.stdout.write('\nNetlify configuration, from backend/.env\n\n')

if (missing.length > 0) {
  process.stderr.write(
    `Cannot continue — these are not set in backend/.env:\n` +
      missing.map((key) => `  • ${key}`).join('\n') +
      '\n\nSet up Appwrite first (docs/10-appwrite.md), then run this again.\n\n'
  )
  process.exit(1)
}

for (const entry of resolved) {
  const shown = entry.secret ? `${mask(entry.value)}  (not printed, sent with --secret)` : entry.value
  process.stdout.write(`  ${entry.key.padEnd(22)} functions   ${shown}\n`)
}

process.stdout.write(
  '\nAll functions scope. Nothing needs the builds scope: the browser gets the\n' +
    'Appwrite endpoint and project id from /auth/config at runtime.\n\n'
)

if (!write) {
  process.stdout.write('Check only — nothing was changed. Add --write to apply.\n\n')
  process.exit(0)
}

const project = linkedProject()
if (!project) {
  process.stderr.write(
    'This directory is not linked to a Netlify project, or the CLI is not logged in:\n\n' +
      '  npx netlify-cli login\n' +
      '  npx netlify-cli link\n\n' +
      'Then run this again. Linking is per directory, so a new Netlify project needs\n' +
      'a fresh `link` even though nothing else changed.\n\n'
  )
  process.exit(1)
}

process.stdout.write(`Applying to: ${project}\n\n`)

let failed = 0

for (const entry of resolved) {
  const args = ['env:set', entry.key, entry.value, '--scope', 'functions', '--force']
  if (entry.secret) args.push('--secret')

  try {
    netlify(args, { capture: true })
    process.stdout.write(`  set  ${entry.key}\n`)
  } catch (error) {
    failed += 1
    const detail = error.stderr?.toString().trim().split('\n').slice(-2).join(' ') ?? error.message
    process.stdout.write(`  FAIL ${entry.key} — ${detail}\n`)
  }
}

process.stdout.write(
  failed === 0
    ? '\nDone. Environment variables only take effect on a new deploy:\n\n' +
        '  npx netlify-cli deploy --build --prod\n\n' +
        'or in the dashboard: Deploys → Trigger deploy → Deploy site.\n\n' +
        'Then confirm the live site is on the real database:\n\n' +
        '  API_PROBE_URL=https://<your-site>.netlify.app npm run appwrite:check\n\n' +
        'You want `store "appwrite"`, no amber Sample data bar, and an email and\n' +
        'password form at /login rather than the demo account picker.\n\n'
    : `\n${failed} variable(s) could not be set. Nothing else was rolled back.\n\n`
)

process.exit(failed > 0 ? 1 : 0)
