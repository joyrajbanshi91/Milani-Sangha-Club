#!/usr/bin/env node
/**
 * Configure a Netlify project from backend/.env, in one command.
 *
 *   npm run netlify:setup            # show what would be set, change nothing
 *   npm run netlify:setup -- --write # apply it, then read it back and prove it
 *
 * ## Why this talks to the REST API instead of the CLI
 *
 * It used `netlify env:set --scope functions`, which **silently did nothing**. On the
 * free plan that call is refused with
 * `403 Upgrade your Netlify account to set specific scopes` — variable *scoping* is a
 * paid feature — and the CLI swallowed the error, printed nothing at all, and exited
 * 0. This script trusted the exit code and reported nine variables as "set" when the
 * site had none. The deployed API stayed in demo mode, and nothing anywhere said why.
 *
 * Two lessons are built in now:
 *
 *   * **Talk to the API directly.** `POST /accounts/{id}/env?site_id=…` returns a real
 *     status code. A 403 is a 403.
 *   * **Never believe a write without reading it back.** Every run finishes by
 *     fetching the variables and comparing them to what was asked for, and fails if
 *     they disagree.
 *
 * ## No scopes, and why that is safe
 *
 * Variables are created unscoped, which the free plan grants all four scopes —
 * builds, functions, post-processing and runtime. That means `APPWRITE_API_KEY` is
 * present in the build environment as well as the function's.
 *
 * It still cannot reach the browser. Vite only inlines variables prefixed `VITE_`
 * into client code, and nothing here is. That is verified rather than assumed:
 * `npm run check:bundle` builds with a canary value in the environment and fails if
 * it appears in any built file.
 *
 * The values are not marked secret, so they remain readable in your own Netlify
 * dashboard — which is what lets this script verify them. Rotate the Appwrite key if
 * anyone else gains access to the team.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const write = process.argv.includes('--write')
const root = fileURLToPath(new URL('..', import.meta.url))
const API = 'https://api.netlify.com/api/v1'

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

/**
 * The CLI's own token, so this needs no separate login.
 *
 * `NETLIFY_AUTH_TOKEN` wins, for CI. Otherwise the location differs by platform, so
 * all the known ones are tried rather than guessed at.
 */
function authToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN

  const candidates = [
    join(homedir(), 'Library', 'Preferences', 'netlify', 'config.json'),
    join(homedir(), '.config', 'netlify', 'config.json'),
    join(homedir(), '.netlify', 'config.json'),
    join(homedir(), 'AppData', 'Roaming', 'netlify', 'Config', 'config.json'),
  ]

  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      for (const user of Object.values(parsed.users ?? {})) {
        const token = user?.auth?.token
        if (token) return token
      }
    } catch {
      // Missing or unreadable is the ordinary case for all but one of these.
    }
  }

  return null
}

function siteId() {
  try {
    return JSON.parse(readFileSync(join(root, '.netlify', 'state.json'), 'utf8')).siteId ?? null
  } catch {
    return null
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }

  return { ok: response.ok, status: response.status, body: parsed }
}

function mask(value) {
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`
}

// ---------------------------------------------------------------------------

const backend = readEnvFile(join(root, 'backend', '.env'))
const token = authToken()
const site = siteId()

process.stdout.write('\nNetlify configuration, from backend/.env\n\n')

if (!token) {
  process.stderr.write(
    'No Netlify token found. Log in once:\n\n  npx netlify-cli login\n\n' +
      'Or export NETLIFY_AUTH_TOKEN.\n\n'
  )
  process.exit(1)
}

if (!site) {
  process.stderr.write(
    'This directory is not linked to a Netlify project:\n\n' +
      '  npx netlify-cli sites:list                 # find the id\n' +
      '  npx netlify-cli link --id <the-site-id>\n\n' +
      'If a previous project was deleted, `link` refuses while the stale id is on\n' +
      'disk — run `npx netlify-cli unlink` first.\n\n'
  )
  process.exit(1)
}

const siteInfo = await api(`/sites/${site}`, { token })
if (!siteInfo.ok) {
  process.stderr.write(
    `The linked site id does not resolve (HTTP ${siteInfo.status}):\n\n  ${site}\n\n` +
      'That is a stale link, left behind when a project is deleted and recreated.\n' +
      'It is not a login problem, and `netlify deploy` reports it only as\n' +
      '`JSONHTTPError: Not Found`. Fix it with:\n\n' +
      '  npx netlify-cli unlink\n' +
      '  npx netlify-cli sites:list\n' +
      '  npx netlify-cli link --id <the-site-id>\n\n'
  )
  process.exit(1)
}

const accountId = siteInfo.body.account_id
const siteUrl = siteInfo.body.ssl_url ?? siteInfo.body.url

/**
 * What the deployed function needs.
 *
 * `CORS_ORIGINS` and `APP_BASE_URL` come from the project itself rather than being
 * typed. `APP_BASE_URL` is what receipts and QR verification links are built from, so
 * a wrong value there is worse than a missing one.
 */
const PLAN = [
  { key: 'APPWRITE_ENDPOINT', from: 'APPWRITE_ENDPOINT', required: true },
  { key: 'APPWRITE_PROJECT_ID', from: 'APPWRITE_PROJECT_ID', required: true },
  { key: 'APPWRITE_API_KEY', from: 'APPWRITE_API_KEY', required: true, secret: true },
  { key: 'APPWRITE_DATABASE_ID', from: 'APPWRITE_DATABASE_ID' },
  { key: 'NODE_ENV', literal: 'production' },
  { key: 'TRUST_PROXY', literal: '1' },
  { key: 'CLUB_NAME', from: 'CLUB_NAME' },
  ...(siteUrl
    ? [
        { key: 'CORS_ORIGINS', literal: siteUrl, fromSite: true },
        { key: 'APP_BASE_URL', literal: siteUrl, fromSite: true },
      ]
    : []),
]

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

if (missing.length > 0) {
  process.stderr.write(
    'Cannot continue — these are not set in backend/.env:\n' +
      missing.map((key) => `  • ${key}`).join('\n') +
      '\n\nSet up Appwrite first (docs/10-appwrite.md), then run this again.\n\n'
  )
  process.exit(1)
}

process.stdout.write(`  project   ${siteInfo.body.name}  (${siteUrl})\n\n`)

for (const entry of resolved) {
  const shown = entry.secret
    ? `${mask(entry.value)}  (not printed)`
    : `${entry.value}${entry.fromSite ? '   ← from the linked project' : ''}`
  process.stdout.write(`  ${entry.key.padEnd(22)} ${shown}\n`)
}

process.stdout.write(
  '\nCreated unscoped: the free plan refuses specific scopes with a 403, so Netlify\n' +
    'grants all four. The API key still cannot reach the browser — Vite only inlines\n' +
    'VITE_-prefixed values, which `npm run check:bundle` proves.\n\n'
)

if (!write) {
  process.stdout.write('Check only — nothing was changed. Add --write to apply.\n\n')
  process.exit(0)
}

// --- apply -----------------------------------------------------------------

const existing = await api(`/accounts/${accountId}/env?site_id=${site}`, { token })
if (!existing.ok) {
  process.stderr.write(`Could not read the current variables (HTTP ${existing.status}).\n\n`)
  process.exit(1)
}

const present = new Set((existing.body ?? []).map((variable) => variable.key))

let failed = 0

for (const entry of resolved) {
  // No `scopes` field: sending one is what the free plan refuses outright.
  const payload = { key: entry.key, values: [{ context: 'all', value: entry.value }] }

  const result = present.has(entry.key)
    ? await api(`/accounts/${accountId}/env/${entry.key}?site_id=${site}`, {
        method: 'PUT',
        body: payload,
        token,
      })
    : await api(`/accounts/${accountId}/env?site_id=${site}`, {
        method: 'POST',
        body: [payload],
        token,
      })

  if (result.ok) {
    process.stdout.write(`  ${present.has(entry.key) ? 'updated' : 'created'}  ${entry.key}\n`)
  } else {
    failed += 1
    const detail = result.body?.message ?? JSON.stringify(result.body).slice(0, 120)
    process.stdout.write(`  FAILED   ${entry.key} — HTTP ${result.status} ${detail}\n`)
  }
}

// --- verify, because a clean exit code proved nothing last time -------------

process.stdout.write('\nReading it back:\n')

const after = await api(`/accounts/${accountId}/env?site_id=${site}`, { token })
const actual = new Map(
  (after.body ?? []).map((variable) => [
    variable.key,
    variable.values?.find((v) => v.context === 'all')?.value ??
      variable.values?.[0]?.value ??
      null,
  ])
)

let wrong = 0

for (const entry of resolved) {
  if (!actual.has(entry.key)) {
    wrong += 1
    process.stdout.write(`  MISSING  ${entry.key} — the write did not stick\n`)
    continue
  }

  const stored = actual.get(entry.key)
  // A null value means Netlify is withholding it (a secret). Presence is all we can
  // check then, and all we need to.
  if (stored !== null && stored !== entry.value) {
    wrong += 1
    process.stdout.write(`  WRONG    ${entry.key} — stored value differs from backend/.env\n`)
    continue
  }

  process.stdout.write(`  ok       ${entry.key}\n`)
}

if (failed > 0 || wrong > 0) {
  process.stderr.write(
    `\n${failed} write(s) failed and ${wrong} variable(s) did not verify. The site is\n` +
      'NOT configured. Nothing was rolled back.\n\n'
  )
  process.exit(1)
}

process.stdout.write(
  `\nAll ${resolved.length} variables verified on ${siteInfo.body.name}.\n\n` +
    'They only take effect on a new deploy:\n\n' +
    '  npx netlify-cli deploy --prod\n\n' +
    'Then check the live API. If the site has SSO enabled (Project configuration →\n' +
    'Access & security → Visitor access) every path answers 401 to anything but your\n' +
    'own signed-in browser, so use the browser for this:\n\n' +
    `  ${siteUrl}/api/v1/health/ready     → expect "store":"appwrite"\n` +
    `  ${siteUrl}/login                   → expect an email and password form\n\n`
)
