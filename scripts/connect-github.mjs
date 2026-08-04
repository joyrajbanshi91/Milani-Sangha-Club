#!/usr/bin/env node
/**
 * Connect the Appwrite Site and Function to the GitHub repository, so a push
 * redeploys the website and the API without anyone running a command.
 *
 *   npm run appwrite:github            # report what it would do
 *   npm run appwrite:github -- --write # apply it
 *
 * ## The one step this cannot do
 *
 * Appwrite reaches GitHub through its own GitHub App, and installing that app is an
 * OAuth flow in a browser — there is no API for granting it. So the first time, you
 * install it in the console; everything after that is here.
 *
 * The script says so plainly when no installation exists rather than failing with a
 * permissions error, because "you have not done the browser step yet" and "your key
 * lacks a scope" need completely different responses.
 *
 * ## Why both resources, with different root directories
 *
 * The site builds from `frontend/`; the function builds from the repository root,
 * because its entrypoint imports `backend/dist`. Getting these the wrong way round
 * produces a build that fails on a missing package.json, which reads like a broken
 * repository rather than a misconfigured root.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const write = process.argv.includes('--write')
const root = fileURLToPath(new URL('..', import.meta.url))

function readEnvFile(path) {
  const values = {}
  let contents
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    return values
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const equals = line.indexOf('=')
    if (equals < 1) continue
    values[line.slice(0, equals).trim()] = line.slice(equals + 1).trim()
  }
  return values
}

const env = readEnvFile(join(root, 'backend', '.env'))
const endpoint = env.APPWRITE_ENDPOINT?.replace(/\/+$/, '')
const project = env.APPWRITE_PROJECT_ID
const key = env.APPWRITE_API_KEY

if (!endpoint || !project || !key) {
  process.stderr.write('\nbackend/.env needs APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY.\n\n')
  process.exit(1)
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      'X-Appwrite-Project': project,
      'X-Appwrite-Key': key,
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

/** The repository to attach. Taken from git so it cannot drift from reality. */
function repositoryName() {
  try {
    const config = readFileSync(join(root, '.git', 'config'), 'utf8')
    const url = /url\s*=\s*(.+)/.exec(config)?.[1]?.trim()
    return url ? (/([^/:]+?)(?:\.git)?$/.exec(url)?.[1] ?? null) : null
  } catch {
    return null
  }
}

process.stdout.write('\nConnecting Appwrite to GitHub\n\n')

const installations = await api('/vcs/installations')
if (!installations.ok) {
  process.stderr.write(
    `Could not list VCS installations (HTTP ${installations.status}).\n` +
      'The API key may lack the VCS scope.\n\n'
  )
  process.exit(1)
}

const installation = installations.body?.installations?.[0]

if (!installation) {
  process.stdout.write(
    'No GitHub installation on this project yet, and that step has to happen in a\n' +
      'browser — Appwrite installs a GitHub App, which cannot be granted over the API.\n\n' +
      'Do this once:\n\n' +
      '  1. Open the Appwrite console → your project → Settings → Git (or the\n' +
      '     "Connect Git" button on the site\'s Deployments tab).\n' +
      '  2. Choose GitHub and authorise it. Grant it access to the\n' +
      `     ${repositoryName() ?? 'club'} repository — "only select repositories" is enough,\n` +
      '     and is better than granting every repository you own.\n' +
      '  3. Come back and run:\n\n' +
      '       npm run appwrite:github -- --write\n\n' +
      'That will attach the repository to both the website and the API, so a push to\n' +
      'main redeploys them.\n\n'
  )
  process.exit(0)
}

process.stdout.write(
  `  installation  ${installation.$id}  (${installation.provider}, ${installation.organization})\n`
)

const wanted = repositoryName()

/**
 * Find the repository behind the installation.
 *
 * Three details here were all wrong on the first attempt and none of them was
 * guessable:
 *
 *   * the path is `/vcs/github/installations/…`, not `/vcs/installations/…` — the
 *     latter 404s, which reads like a missing installation rather than a wrong URL;
 *   * `type` is required and must be `framework` (for Sites) or `runtime` (for
 *     Functions), not something sensible like `all`;
 *   * the array comes back under `frameworkProviderRepositories` or
 *     `runtimeProviderRepositories` — never a plain `providerRepositories`, so reading
 *     that key finds nothing while `total` cheerfully says 1.
 *
 * Both types list the same repositories and a GitHub repository id is the same either
 * way, so the first that answers is enough.
 */
async function findRepository() {
  for (const type of ['framework', 'runtime']) {
    const response = await api(
      `/vcs/github/installations/${installation.$id}/providerRepositories?type=${type}`
    )
    if (!response.ok) continue

    const list =
      response.body?.[`${type}ProviderRepositories`] ?? response.body?.providerRepositories ?? []

    const match =
      list.find((candidate) => candidate.name?.toLowerCase() === wanted?.toLowerCase()) ?? list[0]

    if (match) return match
  }
  return null
}

const repo = await findRepository()

if (!repo) {
  process.stderr.write(
    `\nThe installation lists no repository matching "${wanted}".\n` +
      'In GitHub → Settings → Applications → Appwrite, check it has been granted\n' +
      'access to this repository.\n\n'
  )
  process.exit(1)
}

process.stdout.write(`  repository    ${repo.name}  (id ${repo.id})\n\n`)

/**
 * The site builds from frontend/, the function from the repository root — its
 * entrypoint imports backend/dist, which is outside frontend/.
 */
const PLAN = [
  { resource: 'sites/milani-web', label: 'website', rootDirectory: 'frontend' },
  { resource: 'functions/api', label: 'API', rootDirectory: '.' },
]

for (const item of PLAN) {
  process.stdout.write(`  ${item.label.padEnd(8)} root "${item.rootDirectory}"  branch main\n`)
}

if (!write) {
  process.stdout.write('\nCheck only — nothing was changed. Add --write to apply.\n\n')
  process.exit(0)
}

let failed = 0
process.stdout.write('\n')

/**
 * Fields to carry over when re-sending a resource.
 *
 * Appwrite updates with `PUT`, not `PATCH`, and a `PUT` is a full replace: send only
 * the VCS fields and everything else is wiped or rejected. (A `PATCH` here does not
 * fail cleanly either — it returns Appwrite's 404 *HTML console page*, which is a
 * confusing thing to find in a JSON client.)
 *
 * So the current resource is read, these keys are carried across unchanged, and only
 * the VCS ones are replaced. Whitelisted rather than spread wholesale, because the
 * response also contains read-only fields like `$id` and `deploymentId` that the
 * update endpoint rejects.
 */
const CARRY = {
  'sites/milani-web': [
    'name',
    'framework',
    'enabled',
    'logging',
    'timeout',
    'installCommand',
    'buildCommand',
    'outputDirectory',
    'buildRuntime',
    'adapter',
    'fallbackFile',
    'specification',
  ],
  'functions/api': [
    'name',
    'runtime',
    'execute',
    'events',
    'schedule',
    'timeout',
    'enabled',
    'logging',
    'entrypoint',
    'commands',
    'scopes',
    'specification',
  ],
}

for (const item of PLAN) {
  const current = await api(`/${item.resource}`)
  if (!current.ok) {
    failed += 1
    process.stdout.write(`  FAILED     ${item.label} — could not read it (HTTP ${current.status})\n`)
    continue
  }

  const body = {}
  for (const field of CARRY[item.resource] ?? []) {
    if (current.body[field] !== undefined && current.body[field] !== null) {
      body[field] = current.body[field]
    }
  }

  Object.assign(body, {
    installationId: installation.$id,
    providerRepositoryId: String(repo.id),
    providerBranch: 'main',
    providerRootDirectory: item.rootDirectory,
    // Comments on every commit would be noise on a club's repository.
    providerSilentMode: true,
  })

  const result = await api(`/${item.resource}`, { method: 'PUT', body })

  if (result.ok) {
    process.stdout.write(`  connected  ${item.label}\n`)
  } else {
    failed += 1
    const detail = result.body?.message ?? JSON.stringify(result.body).slice(0, 140)
    process.stdout.write(`  FAILED     ${item.label} — HTTP ${result.status} ${detail}\n`)
  }
}

// Read it back: a clean status code has already been shown, elsewhere in this
// repository, to mean nothing at all.
process.stdout.write('\nReading it back:\n')

for (const item of PLAN) {
  const current = await api(`/${item.resource}`)
  const linked = current.body?.providerRepositoryId
  const branch = current.body?.providerBranch
  const dir = current.body?.providerRootDirectory

  if (linked === String(repo.id) && branch === 'main') {
    process.stdout.write(`  ok       ${item.label}  ${repo.name}@${branch} root "${dir}"\n`)
  } else {
    failed += 1
    process.stdout.write(`  WRONG    ${item.label} — repo=${linked || 'unset'} branch=${branch || 'unset'}\n`)
  }
}

process.stdout.write(
  failed === 0
    ? '\nDone. A push to main now rebuilds the website and the API.\n\n' +
        'Two things worth knowing:\n' +
        '  • The site keeps its VITE_API_BASE_URL variable, so builds triggered by a\n' +
        '    push still point at the API. Changing that variable needs a new build.\n' +
        '  • Appwrite builds both on every push, even for a change that only touches\n' +
        '    one. If that becomes annoying, set providerPaths on each resource.\n\n'
    : `\n${failed} problem(s). The connection is not complete.\n\n`
)

process.exit(failed > 0 ? 1 : 0)
