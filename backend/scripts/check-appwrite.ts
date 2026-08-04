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
import { AppwriteException, Functions, Query } from 'node-appwrite'

import { getAppwriteClient, getTables, getUsers } from '../src/config/appwrite.js'
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
 * Variables the API cannot run without once it is deployed.
 *
 * `APPWRITE_PROJECT_ID` is on the list even though Appwrite may inject
 * `APPWRITE_FUNCTION_PROJECT_ID` and the code falls back to it. Relying on that
 * injection cost a round of debugging: the function returned an empty 503 because
 * `hasAppwriteCredentials` was false without it. Whether the injection is present
 * varies by runtime and is not worth depending on for the one variable that decides
 * whether the ledger is reachable at all — so it is required here, and the fallback
 * is a safety net rather than the plan.
 */
const FUNCTION_VARS = [
  'APPWRITE_PROJECT_ID',
  'APPWRITE_API_KEY',
  'APPWRITE_DATABASE_ID',
  'NODE_ENV',
  'TRUST_PROXY',
]

/**
 * Is the deployed API actually serving?
 *
 * A function can be enabled, with a deployment that built successfully, and still
 * answer 503 to everything — because the deployment was never *activated*, or
 * because it has no environment variables and so cannot reach the database. Neither
 * shows up as an error anywhere; the only symptom is an empty 503, which says
 * nothing. This asks the three questions that distinguish them.
 */
async function checkFunction(): Promise<boolean> {
  const functions = new Functions(getAppwriteClient())
  let healthy = true

  log()

  let fn
  try {
    fn = await functions.get({ functionId: 'api' })
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 404) {
      log('function   not created yet — run: npx --yes appwrite-cli push functions')
      return false
    }
    // A key without the Functions scope cannot answer this. Not fatal: the rest of
    // the configuration is still worth reporting.
    log(`function   could not be checked — ${explain(error, 'Functions')}`)
    return true
  }

  log(`function   ${fn.$id} — ${fn.enabled ? 'enabled' : 'DISABLED'}, runtime ${fn.runtime}`)

  if (!fn.deploymentId) {
    healthy = false
    const { deployments } = await functions.listDeployments({ functionId: 'api' })
    const ready = deployments.filter((d) => d.status === 'ready')

    log('           NO ACTIVE DEPLOYMENT — this alone makes every request 503')
    if (ready.length > 0) {
      log(`           one is built and ready: ${ready[0]?.$id ?? ''}`)
      log('           activate it: npx --yes appwrite-cli push functions --activate')
      log('           or console → Functions → Deployments → Activate')
    } else {
      log('           and none is built. Push one: npx --yes appwrite-cli push functions')
    }
  } else {
    log(`           active deployment ${fn.deploymentId}`)
  }

  const { variables } = await functions.listVariables({ functionId: 'api' })
  const present = new Set(variables.map((variable) => variable.key))
  const missing = FUNCTION_VARS.filter((key) => !present.has(key))

  if (missing.length > 0) {
    healthy = false
    log(`           variables missing: ${missing.join(', ')}`)
    log('           set them on the FUNCTION, not the site — the API key especially')
  } else {
    log(`           variables set: ${[...present].sort().join(', ')}`)
  }

  // Deliberately no live HTTP probe here: the function's public domain comes from a
  // proxy rule, which needs another scope on the API key to read, and guessing the
  // hostname would report a false failure. Set API_PROBE_URL to check it end to end.
  const probe = process.env.API_PROBE_URL
  if (probe) {
    try {
      const response = await fetch(`${probe.replace(/\/$/, '')}/health`)
      const body = await response.text()
      const isJson = body.trimStart().startsWith('{')
      log(`           GET ${probe}/health → ${response.status} ${isJson ? 'JSON' : 'not JSON'}`)
      if (!response.ok || !isJson) healthy = false
    } catch (error) {
      healthy = false
      log(`           probe FAILED — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // A failing function answers an empty 503, which says nothing at all. The reason
  // is in the execution record, and reading it here saves the round trip through the
  // console that this cost the first time.
  if (!healthy) {
    const { executions } = await functions.listExecutions({
      functionId: 'api',
      queries: [Query.limit(1), Query.orderDesc('$createdAt')],
    })

    const failed = executions.find((execution) => execution.errors)
    if (failed?.errors) {
      log('')
      log('           the last execution failed with:')
      for (const line of failed.errors.trim().split('\n').slice(0, 6)) {
        log(`             ${line}`)
      }
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

        const { columns } = await getTables().listColumns({
          databaseId: env.APPWRITE_DATABASE_ID,
          tableId: table.id,
        })

        const have = new Set(columns.map((column) => (column as unknown as { key: string }).key))
        const absent = table.columns.filter((column) => !have.has(column.key)).map((c) => c.key)

        const unavailable = columns
          .filter((column) => (column as unknown as { status?: string }).status !== 'available')
          .map((column) => (column as unknown as { key: string }).key)

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

  const functionReady = await checkFunction()
  if (!functionReady) ok = false

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
      log('  npm run user -- create --email you@club.org --name "Your Name" --role president')
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
