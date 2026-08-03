import { setGlobalOptions } from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'

import { createApp } from './app.js'

/**
 * The API as a Cloud Function, so it can be deployed with `firebase deploy` and
 * no Docker or gcloud installed locally — Google builds it in the cloud.
 *
 * Notes that matter:
 *
 *   • `createApp()` is reused unchanged. `server.ts` adds `listen()` for local
 *     development; here the platform owns the listening socket. That separation
 *     existed from the first commit, which is why this file is four lines of
 *     substance.
 *
 *   • **No credentials are configured.** The function runs as the project's own
 *     service account and Firebase Admin picks that up automatically, so there is
 *     no key to deploy, leak or rotate. See `isGoogleCloudRuntime` in config/env.ts.
 *
 *   • Region `asia-south1` (Mumbai) to sit beside the Firestore database. A
 *     function in another region would add a round trip to every query.
 *
 *   • `TRUST_PROXY` must be 1 in this environment: the function sits behind
 *     Google's load balancer, and without it every caller looks like the same IP
 *     and the rate limiter would throttle the whole club as one person.
 */
setGlobalOptions({
  region: 'asia-south1',
  // A club of this size needs very little. maxInstances caps a runaway bill far
  // below anything a budget alert would catch.
  maxInstances: 5,
  memory: '512MiB',
  timeoutSeconds: 60,
  concurrency: 40,
})

export const api = onRequest(
  {
    // The public site and the API share an origin via the hosting rewrite, so no
    // unauthenticated invoker concerns beyond what the app's own guards enforce.
    invoker: 'public',
  },
  createApp()
)
