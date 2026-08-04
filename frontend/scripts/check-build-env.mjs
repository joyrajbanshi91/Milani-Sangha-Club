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
import { existsSync, readFileSync } from 'node:fs'
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

/**
 * Was this workspace installed at all?
 *
 * This repository holds three npm projects and declares no workspaces, so
 * `npm install` at the root installs the root only — `frontend/node_modules` stays
 * empty and the build dies at `vite: not found`, which says nothing about the
 * cause. A hosted build that has not been told where the app lives fails exactly
 * this way.
 *
 * Skipped when there is no package.json beside this script, so that running the
 * checker on its own — to verify the .env parsing, say — does not trip it.
 */
function findInstallProblem() {
  if (!existsSync(join(frontendDir, 'package.json'))) return null
  if (existsSync(join(frontendDir, 'node_modules', 'vite'))) return null

  return (
    'The frontend dependencies are not installed, so the build would fail at\n' +
    '`vite: not found`. The install step did not reach this workspace.\n\n' +
    'On Appwrite Sites, set the root directory to the app rather than the repo:\n\n' +
    '  Root directory    ./frontend\n' +
    '  Install command   npm install\n' +
    '  Build command     npm run build\n' +
    '  Output directory  ./dist\n\n' +
    'To keep the root directory at /, install this workspace explicitly:\n\n' +
    '  Install command   npm --prefix frontend install\n' +
    '  Build command     npm run build:web\n' +
    '  Output directory  ./frontend/dist\n\n' +
    'Locally: run `npm install` in frontend/, or `npm run install:all` at the root.'
  )
}

/** `VITE_FIREBASE_APP_ID` and `vitefirebaseappid` compare equal. */
function normalise(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Say *why* a variable counts as unset, not merely that it does.
 *
 * Typing six names into a dashboard by hand goes wrong in three distinct ways,
 * and they need three different fixes. Reporting them identically as "not set"
 * sends someone to re-check the value they already pasted, and each wrong guess
 * costs another hosted build.
 */
function diagnose(key, environment) {
  const raw = environment[key]

  if (typeof raw === 'string' && raw.trim() === '') {
    return `${key} — present but empty. The name was added without a value.`
  }

  const target = normalise(key)
  const lookalike = Object.keys(environment).find(
    (candidate) => candidate !== key && normalise(candidate) === target
  )

  if (lookalike) {
    return `${key} — missing, but ${lookalike} is set. Check the spelling.`
  }

  return `${key} — not set.`
}

function findEnvironmentProblem() {
  const environment = readEnvironment()
  const missing = REQUIRED.filter((key) => !environment[key]?.trim())
  if (missing.length === 0) return null

  const list = missing.map((key) => `  • ${diagnose(key, environment)}`).join('\n')
  const supplied = REQUIRED.length - missing.length

  return (
    `${missing.length} of ${REQUIRED.length} required environment variables are ` +
    `unusable${supplied > 0 ? ` (${supplied} came through fine)` : ''}:\n${list}\n\n` +
    'Locally: copy frontend/.env.example to frontend/.env.local and fill it in.\n\n' +
    'On a hosted build, add them in the platform dashboard. These are compiled\n' +
    'into the bundle, so adding one requires a new build — editing it does not\n' +
    'update a site that is already published.\n\n' +
    '  Appwrite Sites: your site → Settings → Environment variables.\n' +
    '                  Set them on the *site*; project and function variables are\n' +
    '                  separate and are not visible to this build.\n' +
    '  Netlify:        Site configuration → Environment variables\n' +
    '                  (needs the "Builds" scope and all deploy contexts)\n\n' +
    'To print the values from your own .env.local, ready to paste:\n' +
    "  grep -E '^VITE_' frontend/.env.local\n\n" +
    'See docs/03-environment-variables.md and docs/10-appwrite.md.'
  )
}

// Both are reported together. Fixing one and rediscovering the other on the next
// build is two wasted deploys, and on a hosted build each is several minutes.
const problems = [findInstallProblem(), findEnvironmentProblem()].filter(Boolean)

if (problems.length > 0) {
  const heading =
    problems.length === 1
      ? '\nCannot build the frontend.\n\n'
      : `\nCannot build the frontend — ${problems.length} problems.\n\n`

  process.stderr.write(heading + problems.join('\n\n---\n\n') + '\n\n')
  process.exit(1)
}
