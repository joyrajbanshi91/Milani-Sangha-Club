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

/**
 * Which project is this directory linked to, and is that link still good?
 *
 * Three failure states, three different fixes, and they are easy to confuse. The
 * nastiest is the third: `.netlify/state.json` holds a site id that no longer exists,
 * usually because the project was deleted and recreated. The CLI then reports a
 * `Project Id` with `Admin URL: undefined`, and `netlify deploy` fails with a bare
 * `JSONHTTPError: Not Found` that mentions neither the site nor the stale id.
 *
 * An earlier version of this function collapsed all three into "not linked, or not
 * logged in", which sent someone to re-run `login` and `link` when they were already
 * logged in and the real fix was to unlink first.
 */
function inspectLink() {
  let status
  try {
    status = JSON.parse(netlify(['status', '--json'], { capture: true }))
  } catch (error) {
    const text = `${error.stdout ?? ''}${error.stderr ?? ''}`
    if (/not logged in|log in|Not authorized/i.test(text)) return { state: 'logged-out' }
    return { state: 'unknown', detail: text.trim().split('\n').slice(-3).join(' ') }
  }

  // `netlify status --json` uses hyphenated keys — `site-name`, `site-url`, `site-id`
  // — not the camelCase ones the rest of the CLI's output suggests. Reading `name`
  // and `url` returned undefined for a perfectly good link, so this reported every
  // correctly-linked directory as stale. The fallbacks cover a future rename.
  const site = status.siteData ?? {}
  const name = site['site-name'] ?? site.name
  const url = site['site-url'] ?? site.url

  // A site id on disk with nothing behind it. Read the id straight from the file
  // rather than from the CLI, so the message can name it.
  if (!name && !url) {
    let staleId
    try {
      staleId = JSON.parse(readFileSync(`${root}.netlify/state.json`, 'utf8')).siteId
    } catch {
      staleId = undefined
    }
    return staleId ? { state: 'stale', staleId } : { state: 'unlinked' }
  }

  return { state: 'linked', name: name ?? url, url }
}

function mask(value) {
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`
}

// ---------------------------------------------------------------------------

// Read the link first, so the two URL-derived variables can be shown in the dry run
// rather than appearing only once --write is used. This call changes nothing.
const link = inspectLink()

/**
 * The site's own address, which two variables need and nobody should have to type.
 *
 * `CORS_ORIGINS` and `APP_BASE_URL` were on the "worth setting either way" list in the
 * docs, which meant they were usually not set — and `APP_BASE_URL` is what receipts and
 * QR verification links are built from, so wrong is worse than absent there. Taking
 * them from the linked project removes the transcription error entirely, and they
 * change on their own when the project changes.
 */
if (link.state === 'linked' && link.url) {
  PLAN.push(
    { key: 'CORS_ORIGINS', literal: link.url, required: false, fromSite: true },
    { key: 'APP_BASE_URL', literal: link.url, required: false, fromSite: true }
  )
}

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
  const shown = entry.secret
    ? `${mask(entry.value)}  (not printed, sent with --secret)`
    : `${entry.value}${entry.fromSite ? '   ← from the linked project' : ''}`
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

if (link.state !== 'linked') {
  const advice = {
    'logged-out':
      'The Netlify CLI is not logged in:\n\n' +
      '  npx netlify-cli login\n' +
      '  npx netlify-cli link\n',

    unlinked:
      'This directory is not linked to a Netlify project:\n\n' +
      '  npx netlify-cli link\n\n' +
      'Linking is per directory, so a new project needs a fresh `link` even though\n' +
      'nothing else about the repository changed.\n',

    stale:
      `This directory is linked to a Netlify project that no longer exists:\n\n` +
      `  stale site id  ${link.staleId ?? '(unreadable)'}\n\n` +
      'That happens when the project is deleted and recreated. It is not a login\n' +
      'problem — `netlify deploy` fails with a bare `JSONHTTPError: Not Found` and\n' +
      '`netlify status` shows a Project Id with `Admin URL: undefined`.\n\n' +
      'Point it at the right one:\n\n' +
      '  npx netlify-cli sites:list                 # find the id you want\n' +
      '  npx netlify-cli link --id <the-site-id>    # relinks, no prompts\n',

    unknown: `Could not read the Netlify link state.\n\n  ${link.detail ?? 'no detail'}\n`,
  }[link.state]

  process.stderr.write(`${advice}\nThen run this again.\n\n`)
  process.exit(1)
}

process.stdout.write(`Applying to: ${link.name}${link.url ? `  (${link.url})` : ''}\n\n`)

let failed = 0

for (const entry of resolved) {
  const args = ['env:set', entry.key, entry.value, '--scope', 'functions', '--force']

  /**
   * A secret value cannot cover the `dev` context, so it needs the others named.
   *
   * Netlify refuses `--secret` without an explicit non-development `--context`:
   * "To set a secret environment variable value, please specify a non-development
   * context". Left implicit, the API key was the one variable of the nine that failed
   * to set — and it is the one without which nothing works.
   *
   * Losing the `dev` context costs nothing: `netlify dev` reads backend/.env locally,
   * which is where the key already lives.
   */
  if (entry.secret) {
    args.push('--secret', '--context', 'production', 'deploy-preview', 'branch-deploy')
  }

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
