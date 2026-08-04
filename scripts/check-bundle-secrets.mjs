#!/usr/bin/env node
/**
 * Prove that a server credential in the build environment cannot reach the browser.
 *
 *   npm run check:bundle
 *
 * ## Why this test exists
 *
 * Netlify's free plan refuses per-variable *scoping* — `403 Upgrade your Netlify
 * account to set specific scopes` — so every variable a site has is granted all four
 * scopes, builds included. `APPWRITE_API_KEY` is therefore present in the environment
 * when the frontend is compiled, and that key bypasses every permission check in the
 * club's database.
 *
 * The reason it is still safe is that Vite only inlines variables prefixed `VITE_`
 * into client code. That is a real guarantee, but it is a guarantee about a tool's
 * behaviour, sitting between a live credential and a public CDN — exactly the kind of
 * assumption that should be executable rather than remembered. A future config change
 * (a `define` block, an `envPrefix` setting, a plugin that embeds `process.env`) could
 * quietly break it, and the symptom would be a key published to the internet.
 *
 * So: build with canary values in the environment, then search every emitted file for
 * them. Fails loudly if any appears.
 *
 * Wired into `npm run verify`, and into CI.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'frontend', 'dist')

/**
 * Values planted in the build environment. Distinctive enough that a match cannot be
 * a coincidence, and shaped like the real thing so a transform that mangles them is
 * still caught.
 */
const CANARIES = {
  APPWRITE_API_KEY: 'canary_apikey_4f8e2b91c7d3a05e6f1b8c2d9e4a7f30',
  APPWRITE_PROJECT_ID: 'canary_project_a91c7d3b',
  APPWRITE_DATABASE_ID: 'canary_database_5e6f1b8c',
  FIREBASE_PRIVATE_KEY: 'canary_private_key_2d9e4a7f30b5c8',
  SMTP_PASSWORD: 'canary_smtp_7f30b5c8d1e2',
}

/**
 * Deliberately included: a `VITE_`-prefixed value, which *is* expected in the bundle.
 *
 * Without it a false pass is possible — if the build silently produced nothing, or the
 * search looked in the wrong directory, every canary would be "absent" and the test
 * would agree that all was well. This one must be found, which proves the search can
 * see the bundle at all.
 */
const SENTINEL = { VITE_CLUB_NAME: 'canary_sentinel_must_appear_c8d1' }

function walk(dir) {
  const files = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }

  return files
}

process.stdout.write('\nBuilding the frontend with canary credentials in the environment…\n')

try {
  execFileSync('npm', ['--prefix', 'frontend', 'run', 'build'], {
    cwd: root,
    env: { ...process.env, ...CANARIES, ...SENTINEL, NODE_ENV: 'production' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
} catch (error) {
  process.stderr.write(
    `\nThe build failed, so nothing could be checked:\n\n${error.stderr?.toString().trim().split('\n').slice(-12).join('\n')}\n\n`
  )
  process.exit(1)
}

const files = walk(dist)
const leaks = []
let sentinelFound = false

for (const path of files) {
  let contents
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    continue // A binary asset that is not valid UTF-8 cannot carry a pasted string.
  }

  for (const [name, value] of Object.entries(CANARIES)) {
    if (contents.includes(value)) leaks.push({ name, file: path.slice(root.length) })
  }

  if (contents.includes(Object.values(SENTINEL)[0])) sentinelFound = true
}

process.stdout.write(`Searched ${files.length} built files.\n\n`)

if (!sentinelFound) {
  process.stderr.write(
    'INCONCLUSIVE — the VITE_ sentinel was not found in the bundle either.\n\n' +
      'That means this check is not looking at what the build produced, so its clean\n' +
      'result would be meaningless. Confirm frontend/dist is where the build writes,\n' +
      'and that VITE_CLUB_NAME still reaches the bundle.\n\n'
  )
  process.exit(1)
}

if (leaks.length > 0) {
  process.stderr.write(
    'SECRET IN THE BUNDLE — do not deploy this.\n\n' +
      leaks.map(({ name, file }) => `  • ${name} appears in ${file}`).join('\n') +
      '\n\nA server credential compiled into the bundle is published to every visitor.\n' +
      'Rotate anything real that has already shipped, then find what changed: only\n' +
      'VITE_-prefixed values are meant to be inlined, so look at `define` and\n' +
      '`envPrefix` in frontend/vite.config.ts and at any plugin touching process.env.\n\n'
  )
  process.exit(1)
}

process.stdout.write(
  `No server credential reached the bundle. ${Object.keys(CANARIES).length} canaries\n` +
    'absent, VITE_ sentinel present — so the search was looking in the right place.\n\n'
)
