#!/usr/bin/env node
/**
 * Build-time environment guard. Runs as `prebuild`, so `npm run build` cannot
 * skip it.
 *
 * Vite compiles `VITE_*` values into the bundle. A value missing on the build
 * machine therefore cannot be recovered at runtime: the deploy *succeeds*, and
 * the site then refuses to start in every visitor's browser with "The
 * application could not start" from src/app/fatalError.ts. That failure belongs
 * here — in the build log, in front of whoever triggered the deploy — not in
 * front of a member.
 *
 * **No imports.** An earlier version used Vite's own `loadEnv`, which was neater
 * but made this script useless in the situation it most needs to work: a hosted
 * build whose install step has not put `node_modules` in place yet. It failed
 * with `ERR_MODULE_NOT_FOUND: vite` — a stack trace about the checker instead of
 * a sentence about the missing variable. A guard must not depend on the
 * toolchain it is guarding, so the .env parsing below is deliberately its own.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The keys the schema in src/config/env.ts requires. Keys with a default there
// (VITE_API_BASE_URL, VITE_CLUB_NAME) are deliberately absent: the build does
// not need them. Keep this list in step with that schema.
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

// Resolved from this file rather than process.cwd(), so the check behaves the
// same whether it is run from frontend/ or through `npm --prefix frontend`.
const frontendDir = fileURLToPath(new URL('..', import.meta.url))

/**
 * The .env files Vite would read for a production build, in ascending order of
 * precedence. Only presence matters here, so a plain union is enough — but the
 * order is kept faithful so the value reported is the value the build will use.
 */
const ENV_FILES = ['.env', '.env.production', '.env.local', '.env.production.local']

/** Minimal dotenv: `KEY=value`, `#` comments, optional `export`, optional quotes. */
function parseEnvFile(contents) {
  const values = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line
    const equals = withoutExport.indexOf('=')
    if (equals < 1) continue

    const key = withoutExport.slice(0, equals).trim()
    let value = withoutExport.slice(equals + 1).trim()

    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

function readEnvironment() {
  const fromFiles = {}

  for (const name of ENV_FILES) {
    try {
      Object.assign(fromFiles, parseEnvFile(readFileSync(join(frontendDir, name), 'utf8')))
    } catch (error) {
      // A missing .env file is the normal case in CI and on a hosted build, where
      // the values arrive through the environment instead. Anything else is a real
      // fault and must not be swallowed: an earlier version caught everything
      // here, which hid a bad path and silently read no files at all — so the
      // guard reported every variable missing whatever the .env file said.
      if (error.code !== 'ENOENT') throw error
    }
  }

  // process.env wins: a value set in the hosting dashboard is the deliberate
  // one, and a stale file in the image must not mask it.
  return { ...fromFiles, ...process.env }
}

const environment = readEnvironment()
const missing = REQUIRED.filter((key) => !environment[key]?.trim())

if (missing.length > 0) {
  const list = missing.map((key) => `  • ${key}`).join('\n')
  process.stderr.write(
    `\nCannot build the frontend — ${missing.length} required environment ` +
      `variable(s) are not set:\n${list}\n\n` +
      'Locally: copy frontend/.env.example to frontend/.env.local and fill it in.\n\n' +
      'On a hosted build, add them in the platform dashboard. These are compiled\n' +
      'into the bundle, so adding one requires a new build — editing it does not\n' +
      'update a site that is already published.\n\n' +
      '  Appwrite Sites: your site → Settings → Environment variables\n' +
      '  Netlify:        Site configuration → Environment variables\n' +
      '                  (needs the "Builds" scope and all deploy contexts)\n\n' +
      'See docs/03-environment-variables.md.\n\n'
  )
  process.exit(1)
}
