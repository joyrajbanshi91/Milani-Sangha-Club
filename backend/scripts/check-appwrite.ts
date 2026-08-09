/**
 * Prove the Appwrite configuration works, before anything depends on it.
 *
 *   npm run appwrite:check
 *
 * Endpoint, project id and API key have to be right *together*, and getting one
 * wrong fails in ways that do not name the cause: a wrong project id looks like a
 * missing database, a key without the Users scope looks like an empty club. This
 * asks Appwrite directly and reports which of the three is at fault.
 *
 * Reads nothing it should not print. The API key is never echoed.
 */
import { AppwriteException, Query } from 'node-appwrite'

import { getTables, getUsers } from '../src/config/appwrite.js'
import { TABLES } from '../src/config/appwriteSchema.js'
import { appwriteProjectId, env, hasAppwriteCredentials } from '../src/config/env.js'

function log(message = ''): void {
  process.stdout.write(`${message}\n`)
}

/** 401 from a key that authenticated at all means the scope is absent, not the key. */
function explain(error: unknown, scope: string): string {
  if (error instanceof AppwriteException) {
    if (error.code === 401) return `unauthorised — the API key is missing the ${scope} scope`
    if (error.code === 404) return 'not found — check APPWRITE_PROJECT_ID'
    return `${error.code} ${error.type}: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Is the deployed API actually serving?
 *
 * This once inspected an Appwrite Function called `api` by name and reported
 * `function not created yet` against a perfectly healthy deployment, because the
 * function had been renamed. The check was left in place for a while and was worse
 * than nothing — a diagnostic that lies is what you consult when something else is
 * broken.
 *
 * What replaces it is a probe of the real thing, over HTTP, which needs no Appwrite
 * scope and makes no assumption about where the API is hosted. Skipped unless a URL
 * is given, because guessing the club's hostname would report a false failure.
 *
 *   API_PROBE_URL=https://milani-api.fra.appwrite.run npm run appwrite:check
 */
/**
 * Where the deployed API lives, discovered rather than demanded.
 *
 * Appwrite gives a function a domain through a proxy rule, so the project already
 * knows the answer and nobody should have to paste it in. `API_PROBE_URL` still wins,
 * for an API hosted somewhere else.
 *
 * Discovery matters more than convenience here: a function's *deployment*-scoped
 * domain changes every time it is redeployed, so any URL written down by hand goes
 * stale silently and the probe then reports a healthy deployment as unreachable.
 */
/**
 * Every column on a table, not the first page of them.
 *
 * `listColumns` returns 25 unless told otherwise, and the payments table has 27. Read
 * unpaged, this check reports two columns as missing on a database that has them — and
 * then tells the reader to run the provisioner, which finds nothing to do. A check that
 * lies is worse than no check, because it is what somebody consults when they are
 * already unsure what is wrong.
 *
 * The same paging lives in provision-appwrite.ts, where the same default cost an
 * afternoon.
 */
async function listAllColumns(tableId: string): Promise<Array<{ key: string; status?: string }>> {
  const all: Array<{ key: string; status?: string }> = []

  for (;;) {
    const page = await getTables().listColumns({
      databaseId: env.APPWRITE_DATABASE_ID,
      tableId,
      queries: [Query.limit(100), Query.offset(all.length)],
    })

    all.push(...(page.columns as unknown as Array<{ key: string; status?: string }>))

    if (page.columns.length === 0 || all.length >= page.total) return all
  }
}

async function discoverApiUrl(): Promise<string | null> {
  const explicit = process.env.API_PROBE_URL?.replace(/\/+$/, '')
  if (explicit) return explicit

  if (!hasAppwriteCredentials) return null

  try {
    const response = await fetch(`${env.APPWRITE_ENDPOINT.replace(/\/+$/, '')}/proxy/rules`, {
      headers: {
        'X-Appwrite-Project': appwriteProjectId ?? '',
        'X-Appwrite-Key': env.APPWRITE_API_KEY ?? '',
      },
    })

    if (!response.ok) return null

    const body = (await response.json()) as {
      rules?: Array<{
        domain?: string
        trigger?: string
        deploymentResourceType?: string
        deploymentResourceId?: string
      }>
    }

    const forApi = (body.rules ?? []).filter(
      (candidate) =>
        candidate.deploymentResourceType === 'function' && candidate.deploymentResourceId === 'api'
    )

    /**
     * Prefer the domain somebody chose over the one Appwrite generated.
     *
     * Both carry `trigger: 'manual'`, so that field cannot tell them apart. What can
     * is the shape of the name: Appwrite's own is a twenty-character generated id
     * (`6a71eb550029f8324d44.fra.appwrite.run`), while a deliberately created rule has
     * a readable label (`milani-api.fra.appwrite.run`). The readable one is what the
     * website is built against, because it survives a redeploy — so it is the one to
     * report, and a mismatch between it and the generated one is exactly the confusion
     * worth avoiding here.
     */
    const generatedId = /^[0-9a-f]{16,32}$/i
    const named = forApi.find((candidate) => {
      const label = candidate.domain?.split('.')[0] ?? ''
      return label !== '' && !generatedId.test(label)
    })

    const rule = named ?? forApi[0]

    return rule?.domain ? `https://${rule.domain}` : null
  } catch {
    // A key without the Proxy scope, or no network. Not fatal: the rest still reports.
    return null
  }
}

/**
 * Is a push to main still going to deploy?
 *
 * Worth asking on every check, because this is the failure mode that reported
 * nothing at all. `appwrite push site` sends appwrite.config.json as a full replace,
 * that file has no VCS fields, and so each CLI deploy silently blanked the site's
 * GitHub connection. The site kept serving, the function kept following the
 * repository, and the website quietly stopped — for seven deploys.
 *
 * A missing connection is reported, not treated as a failure: a project that has
 * never been connected is a legitimate state, and `deploy-appwrite.sh` is a complete
 * way to ship. What must not happen is nobody noticing the difference.
 */
async function reportVcsLinks(): Promise<void> {
  const headers = {
    'X-Appwrite-Project': appwriteProjectId ?? '',
    'X-Appwrite-Key': env.APPWRITE_API_KEY ?? '',
  }
  const base = env.APPWRITE_ENDPOINT.replace(/\/+$/, '')

  log()

  for (const [label, path] of [
    ['website', '/sites/milani-web'],
    ['api', '/functions/api'],
  ] as const) {
    try {
      const response = await fetch(`${base}${path}`, { headers })

      if (!response.ok) {
        log(`git        ${label.padEnd(8)} not checked (HTTP ${response.status})`)
        continue
      }

      const body = (await response.json()) as {
        providerRepositoryId?: string
        providerBranch?: string
        providerRootDirectory?: string
      }

      if (body.providerRepositoryId) {
        log(
          `git        ${label.padEnd(8)} follows ${body.providerBranch || '?'} (root "${body.providerRootDirectory ?? ''}")`
        )
      } else {
        log(`git        ${label.padEnd(8)} NOT connected — a push to main will not deploy it`)
        log('             npm run appwrite:github -- --write')
      }
    } catch {
      // No network, or a key without the Sites/Functions scope. Not fatal.
      log(`git        ${label.padEnd(8)} not checked`)
    }
  }
}

async function probeDeployedApi(): Promise<boolean> {
  const base = await discoverApiUrl()

  log()

  if (!base) {
    log('api        not probed — no function domain found for this project.')
    log('             Deploy it with `npm run appwrite:deploy`, or set API_PROBE_URL')
    log('             if the API is hosted somewhere else.')
    return true
  }

  log(`api        ${base}`)

  let healthy = true

  for (const path of ['/api/v1/health', '/api/v1/health/ready']) {
    try {
      const response = await fetch(`${base}${path}`)
      const body = await response.text()
      const isJson = body.trimStart().startsWith('{')

      log(`api        GET ${path} → ${response.status} ${isJson ? 'JSON' : 'NOT JSON'}`)

      /**
       * A sign-in wall in front of the whole deployment, not a fault in the API.
       *
       * Some hosting arrangements put access control ahead of every path and answer
       * 401 with an HTML sign-in page. In a browser where you are already signed in
       * this is invisible, so the site appears to work while every request from
       * outside is refused. Named separately because the HTML case below would
       * otherwise blame the API for something in front of it.
       */
      if (response.status === 401 && /edge-access|Login Redirect/.test(body)) {
        log('             a sign-in wall is answering for the whole deployment, so it')
        log('             is closed to callers outside your browser. This is not an')
        log('             API fault and says nothing either way about Appwrite.')
        continue
      }

      // HTML here means the site's own SPA fallback answered instead of the API,
      // which is a routing problem in front of the function rather than anything to
      // do with Appwrite's database. Worth naming, because every other check then
      // misleads.
      if (!isJson) {
        healthy = false
        log('             HTML, so the site shell answered rather than the function.')
        log('             The /api/* redirect must come before the SPA catch-all.')
        continue
      }

      const parsed = JSON.parse(body) as { checks?: { store?: string } }
      const store = parsed.checks?.store

      if (path.endsWith('/ready')) {
        if (store === 'memory') {
          healthy = false
          log('             store is "memory" — the deployment has NO database and is')
          log('             showing sample data. Set APPWRITE_PROJECT_ID and')
          log('             APPWRITE_API_KEY on the function in the Appwrite console.')
        } else if (response.ok) {
          log(`             ready, store "${store ?? 'unknown'}"`)
        } else {
          healthy = false
        }
      } else if (!response.ok) {
        healthy = false
      }
    } catch (error) {
      healthy = false
      log(`api        GET ${path} FAILED — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return healthy
}

async function main(): Promise<number> {
  log(`endpoint   ${env.APPWRITE_ENDPOINT}`)
  log(`project    ${appwriteProjectId ?? '(not set)'}`)
  log(`database   ${env.APPWRITE_DATABASE_ID}`)
  log(`api key    ${env.APPWRITE_API_KEY ? 'set' : '(not set)'}`)
  log()

  if (!hasAppwriteCredentials) {
    log('Not configured yet. Missing from backend/.env:')
    if (!appwriteProjectId) {
      log('  APPWRITE_PROJECT_ID   Appwrite console → your project → Settings')
    }
    if (!env.APPWRITE_API_KEY) {
      log('  APPWRITE_API_KEY      your project → Integrations → API keys')
    }
    log()
    log('backend/.env is a hidden file, which is why Finder does not show it.')
    log('Open it with:  open -e backend/.env')
    return 1
  }

  let ok = true
  let provisioned = false
  let accounts = 0

  // Databases scope, and whether provisioning has run.
  try {
    const { databases } = await getTables().list({})
    const names = databases.map((database) => database.$id)
    log(
      `databases  reachable — ${databases.length} found${names.length ? `: ${names.join(', ')}` : ''}`
    )

    if (names.includes(env.APPWRITE_DATABASE_ID)) {
      const { tables } = await getTables().listTables({ databaseId: env.APPWRITE_DATABASE_ID })
      const present = new Set(tables.map((table) => table.$id))
      const missing = TABLES.filter((table) => !present.has(table.id)).map((table) => table.id)

      log(`tables     ${present.size} of ${TABLES.length} expected tables exist`)

      // A table can exist while its columns do not: provisioning creates the table
      // first, then each column, so an interrupted run leaves something that looks
      // finished from a list of names. Checking the columns is the difference
      // between "the table is there" and "the table is usable".
      const incomplete: string[] = []

      for (const table of TABLES) {
        if (!present.has(table.id)) continue

        const columns = await listAllColumns(table.id)

        const have = new Set(columns.map((column) => column.key))
        const absent = table.columns.filter((column) => !have.has(column.key)).map((c) => c.key)

        const unavailable = columns
          .filter((column) => column.status !== 'available')
          .map((column) => column.key)

        if (absent.length > 0 || unavailable.length > 0) {
          incomplete.push(table.id)
          log(`           ${table.id}: ${have.size}/${table.columns.length} columns`)
          if (absent.length > 0) log(`             missing: ${absent.join(', ')}`)
          if (unavailable.length > 0) log(`             not ready yet: ${unavailable.join(', ')}`)
        }
      }

      if (missing.length > 0) log(`           missing tables: ${missing.join(', ')}`)

      if (missing.length > 0 || incomplete.length > 0) {
        log('           run: npm --prefix backend run provision:appwrite -- --write')
        log('           (safe to re-run — it only adds what is absent)')
      } else {
        log('columns    every table has all of its columns, all available')
        provisioned = true
      }
    } else {
      log(`database   "${env.APPWRITE_DATABASE_ID}" does not exist yet`)
      log('           run: npm --prefix backend run provision:appwrite -- --write')
    }
  } catch (error) {
    ok = false
    log(`databases  FAILED — ${explain(error, 'Databases')}`)
  }

  // Users scope. Needed to create officers and to read their role labels.
  try {
    const { total, users } = await getUsers().list({ queries: [Query.limit(1)] })
    accounts = total ?? users.length
    log(`users      reachable — ${accounts} account(s)`)
  } catch (error) {
    ok = false
    log(`users      FAILED — ${explain(error, 'Users')}`)
  }

  await reportVcsLinks()

  const apiReady = await probeDeployedApi()
  if (!apiReady) ok = false

  log()
  if (ok) {
    log('Configuration works.')

    // Only suggest what is actually outstanding. Telling someone to provision
    // tables that already exist reads as though the check did not look.
    if (!provisioned) {
      log('Next: create the missing tables.')
      log('  npm --prefix backend run provision:appwrite -- --write')
    } else if (accounts === 0) {
      log('Everything is provisioned, and there are no accounts yet.')
      log('Next: create the first officer — use an address you can receive mail at.')
      log('  npm run user -- create --email you@example.org --name "Your Name" --role president')
    } else {
      log(`Everything is provisioned, with ${accounts} account(s).`)
      log('Take a backup and prove it restores:')
      log('  bash scripts/backup-to-drive.sh')
    }
  } else {
    log('Something above is wrong. Fix it before provisioning or backing up —')
    log('both would fail in less obvious ways.')
  }

  return ok ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(
      `\nCheck failed: ${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exit(1)
  })
