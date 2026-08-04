import { Client, TablesDB, Users } from 'node-appwrite'

import { env, hasAppwriteCredentials } from './env.js'

/**
 * Appwrite server client.
 *
 * Held lazily behind getters, for the same reason Firebase Admin is in
 * `firebase.ts`: constructing it needs configuration to be present and valid. If
 * that happened at import time, one wrong environment variable would take down
 * the whole API — including the health endpoint whose job is to report the
 * problem. Held lazily, the failure surfaces on the first request that needs the
 * database, naming the cause.
 *
 * The API key is a **server** credential with project-wide reach. It must never
 * be sent to the browser; the frontend uses the `appwrite` web SDK with only the
 * project id, and acts as the signed-in member rather than as the project.
 */

let client: Client | undefined
let tables: TablesDB | undefined
let users: Users | undefined

function getClient(): Client {
  if (!hasAppwriteCredentials) {
    throw new Error(
      'Appwrite is not configured. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and ' +
        'APPWRITE_API_KEY (see docs/03-environment-variables.md).'
    )
  }

  client ??= new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID as string)
    .setKey(env.APPWRITE_API_KEY as string)

  return client
}

/** Databases (tables/rows) service, for the ledger. */
export function getTables(): TablesDB {
  tables ??= new TablesDB(getClient())
  return tables
}

/** Users service, for creating officers and assigning roles as labels. */
export function getUsers(): Users {
  users ??= new Users(getClient())
  return users
}

/**
 * A client acting **as the caller**, not as the project.
 *
 * A JWT minted in the browser by `account.createJWT()` carries the member's own
 * identity and permissions. Verifying a request means asking Appwrite who this
 * token belongs to with a throwaway client — never the keyed one above, because
 * an API key would override the caller's permissions and every request would look
 * like an administrator.
 */
export function createCallerClient(jwt: string): Client {
  return new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID as string)
    .setJWT(jwt)
}

/** The database holding every table in this application. */
export function databaseId(): string {
  return env.APPWRITE_DATABASE_ID
}
