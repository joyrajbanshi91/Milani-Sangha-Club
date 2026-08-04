#!/usr/bin/env node
/**
 * Build-time guard. Runs as `prebuild`, so `npm run build` cannot skip it.
 *
 * ## What it does and does not check
 *
 * It no longer fails over a missing environment variable, because there are no
 * longer any required ones — src/config/env.ts gives every value a default and the
 * public website is entirely self-contained. That change fixed the failure this
 * file used to *cause*: it demanded `VITE_APPWRITE_PROJECT_ID`, which only Appwrite
 * Sites ever supplied, so a Netlify build died in `prebuild` complaining about a
 * variable nobody had been told to set. A guard that blocks a working deploy is
 * worse than no guard.
 *
 * What remains is the one problem that genuinely cannot be recovered from at
 * runtime, plus advisory notes for the optional integrations.
 *
 * **No imports.** An earlier version used Vite's own `loadEnv`, which was neater
 * but made this script useless in the situation it most needs to work: a hosted
 * build whose install step has not put `node_modules` in place yet. It failed with
 * `ERR_MODULE_NOT_FOUND: vite` — a stack trace about the checker instead of a
 * sentence about the cause. A guard must not depend on the toolchain it guards, so
 * the .env parsing below is deliberately its own.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Nothing to advise about any more, and that is the point.
 *
 * This list held `VITE_APPWRITE_PROJECT_ID`, on the grounds that without it real
 * member sign-in was off. That is no longer true: the API reports the Appwrite
 * endpoint and project id through `/auth/config` at runtime, so sign-in follows
 * whatever the *function* is configured with and the bundle needs to know nothing
 * about the backing service.
 *
 * Which means there is no longer any build-scope variable that affects how the
 * deployed site behaves — the reason the Netlify setup was so easy to get wrong. Kept
 * as an empty list rather than deleted, because the reporting below is the right shape
 * for the next optional integration that genuinely is compiled in.
 */
const ADVISORY = []

// Resolved from this file rather than process.cwd(), so the check behaves the same
// whether it is run from frontend/ or through `npm --prefix frontend`.
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
      // values arrive through the environment instead. Anything else is a real fault
      // and must not be swallowed: an earlier version caught everything here, which
      // hid a bad path and silently read no files at all — so the guard reported
      // every variable missing whatever the .env file said.
      if (error.code !== 'ENOENT') throw error
    }
  }

  // process.env wins: a value set in the Netlify dashboard is the deliberate one,
  // and a stale file in the image must not mask it.
  return { ...fromFiles, ...process.env }
}

/**
 * Was this workspace installed at all?
 *
 * This repository holds two npm projects and declares no workspaces, so `npm
 * install` at the root installs the root only — `frontend/node_modules` stays empty
 * and the build dies at `vite: not found`, which says nothing about the cause.
 *
 * This is the one failure that must still stop the build, because it cannot be
 * diagnosed from the error it produces.
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
    'netlify.toml already handles this — its build command runs `npm run install:all`,\n' +
    'which installs both workspaces. Seeing this means the build command was\n' +
    'overridden in the Netlify dashboard, which takes precedence over netlify.toml.\n' +
    'Either clear it there, or set it to:\n\n' +
    '  npm run install:all && npm --prefix backend run build && npm --prefix frontend run build\n\n' +
    'Locally: run `npm install` in frontend/, or `npm run install:all` at the root.'
  )
}

const environment = readEnvironment()

const problem = findInstallProblem()
if (problem) {
  process.stderr.write(`\nCannot build the frontend.\n\n${problem}\n\n`)
  process.exit(1)
}

// Advisory only — printed, never fatal.
const notes = ADVISORY.filter((entry) => !environment[entry.key]?.trim()).map(
  (entry) => `  • ${entry.key} is not set. ${entry.absent}`
)

if (notes.length > 0) {
  process.stdout.write(`\nBuilding with optional integrations off:\n${notes.join('\n')}\n\n`)
}
