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
 * Vite's own loadEnv is used deliberately, so this sees exactly what the build
 * will see: process.env (Netlify dashboard variables, GitHub Actions `env:`)
 * merged with the .env files.
 */
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

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

const env = loadEnv('production', frontendDir, 'VITE_')
const missing = REQUIRED.filter((key) => !env[key]?.trim())

if (missing.length > 0) {
  const list = missing.map((key) => `  • ${key}`).join('\n')
  process.stderr.write(
    `\nCannot build the frontend — ${missing.length} required environment ` +
      `variable(s) are not set:\n${list}\n\n` +
      'Locally: copy frontend/.env.example to frontend/.env.local and fill it in.\n\n' +
      'On Netlify: Site configuration → Environment variables. Each variable needs\n' +
      'the "Builds" scope and "All deploy contexts". VITE_* values are compiled into\n' +
      'the bundle, so adding one requires a new deploy — editing it does not update\n' +
      'the site already published.\n\n' +
      'See docs/03-environment-variables.md and docs/09-netlify.md.\n\n'
  )
  process.exit(1)
}
