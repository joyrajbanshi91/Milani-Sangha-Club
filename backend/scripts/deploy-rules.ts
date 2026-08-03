/**
 * Deploy Firestore security rules using the Admin service account.
 *
 *   npm run rules:push
 *
 * Why this exists rather than `firebase deploy`:
 *
 * The Firebase CLI runs a pre-flight check against the Service Usage API to
 * confirm `firestore.googleapis.com` is enabled. The Admin SDK service account
 * does not have `serviceusage.services.get`, so the CLI fails before it ever
 * reaches the rules — even though it has permission to publish them.
 *
 * This talks to the Rules API directly, which needs only firebaserules access:
 *   1. create a ruleset from firebase/firestore.rules
 *   2. point the `cloud.firestore` release at it
 *
 * The alternative is `firebase login` in a browser, which is fine but cannot be
 * scripted. If this fails with 403 the fix is either that interactive login, or
 * granting the service account the Firebase Rules Admin role.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import dotenv from 'dotenv'
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app'

// Reads backend/.env, so GOOGLE_APPLICATION_CREDENTIALS is picked up the same way
// the server picks it up.
dotenv.config({ quiet: true })

const RULES_FILE = join(import.meta.dirname, '..', '..', 'firebase', 'firestore.rules')

function exit(message: string): never {
  console.error(`\nerror: ${message}\n`)
  process.exit(1)
}

async function accessToken(): Promise<{ token: string; projectId: string }> {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) exit('GOOGLE_APPLICATION_CREDENTIALS is not set. See docs/08-going-live.md.')

  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as ServiceAccount & { project_id?: string }
  const projectId = (key as { project_id?: string }).project_id
  if (!projectId) exit('That key file has no project_id.')

  const app = initializeApp({ credential: cert(key) }, `rules-${Date.now()}`)
  const token = await app.options.credential?.getAccessToken()
  if (!token?.access_token) exit('Could not mint an access token from the service account.')

  return { token: token.access_token, projectId }
}

async function call(
  url: string,
  token: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: response.ok, status: response.status, json }
}

function describeFailure(status: number, json: Record<string, unknown>): string {
  const error = json.error as { message?: string } | undefined
  const message = error?.message ?? JSON.stringify(json).slice(0, 300)

  if (status === 403) {
    return (
      `${message}\n\n` +
      '       The service account cannot publish rules. Two ways forward:\n' +
      '         a) Grant it "Firebase Rules Admin" in Google Cloud IAM, then re-run; or\n' +
      '         b) Deploy them yourself with an interactive login:\n' +
      '              npm run firebase -- login\n' +
      '              npm run firebase -- deploy --only firestore:rules --project club-app-8ce22'
    )
  }
  return message
}

async function main(): Promise<void> {
  const source = readFileSync(RULES_FILE, 'utf8')
  const { token, projectId } = await accessToken()

  console.log(`\nProject: ${projectId}`)
  console.log(`Rules:   ${RULES_FILE}  (${source.split('\n').length} lines)`)

  // 1. Upload the source as a ruleset. Firebase compiles it and rejects it here
  //    if it does not parse, before anything is released.
  const created = await call(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    token,
    { source: { files: [{ name: 'firestore.rules', content: source }] } }
  )

  if (!created.ok) exit(describeFailure(created.status, created.json))

  const rulesetName = created.json.name as string
  console.log(`\nCompiled and uploaded: ${rulesetName}`)

  // 2. Point the live release at it. Creating the release fails if one already
  //    exists, in which case it is updated instead.
  const releaseName = `projects/${projectId}/releases/cloud.firestore`
  const release = await call(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
    token,
    { name: releaseName, rulesetName }
  )

  if (!release.ok) {
    const alreadyExists = release.status === 409
    if (!alreadyExists) exit(describeFailure(release.status, release.json))

    const updated = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ release: { name: releaseName, rulesetName } }),
    })

    if (!updated.ok) {
      const json = (await updated.json().catch(() => ({}))) as Record<string, unknown>
      exit(describeFailure(updated.status, json))
    }
    console.log('Updated the existing cloud.firestore release.')
  } else {
    console.log('Created the cloud.firestore release.')
  }

  console.log('\nRules are live. The finance collections are now readable only by')
  console.log('an office bearer, and writable from a browser by nobody.\n')
}

main().catch((error: unknown) => exit(error instanceof Error ? error.message : String(error)))
