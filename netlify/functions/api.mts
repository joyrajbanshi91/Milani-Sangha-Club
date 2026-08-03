import serverless from 'serverless-http'

import { createApp } from '../../backend/dist/app.js'

/**
 * The Express API as a Netlify Function.
 *
 * Netlify serves static files only, exactly like Firebase Hosting, so the API has
 * to run as a function. `serverless-http` translates the invocation into the
 * request and response objects Express expects, which means `createApp()` is reused
 * completely unchanged — the same code that runs locally and that the backend tests
 * exercise.
 *
 * Four things about this environment are not obvious:
 *
 *   • **`export const handler`, not `export default`.** A default export opts into
 *     Netlify's v2 API, which hands the function a Web `Request` object;
 *     `serverless-http` expects the older event-and-context signature. Exporting
 *     `handler` keeps that signature.
 *
 *   • **`basePath` strips the function's own path.** The redirect in netlify.toml
 *     sends `/api/v1/x` to `/.netlify/functions/api/api/v1/x`. Stripping
 *     `/.netlify/functions/api` leaves `/api/v1/x`, which is where the routers are
 *     mounted. If Netlify instead reports the original path, the prefix is absent
 *     and nothing is stripped — so this is correct either way rather than relying
 *     on which behaviour applies.
 *
 *   • **The import is from `backend/dist`.** esbuild bundles this file; pointing it
 *     at compiled JavaScript avoids asking that bundler to resolve the backend's
 *     NodeNext TypeScript layout. netlify.toml builds the backend first.
 *
 *   • **Credentials come from environment variables.** There is no filesystem to
 *     mount a key file onto, so set the FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL
 *     / FIREBASE_PRIVATE_KEY trio in the Netlify dashboard. The existing code
 *     already converts the escaped `\n` in the key back to real newlines.
 */
export const handler = serverless(createApp(), {
  basePath: '/.netlify/functions/api',

  /**
   * Which responses must be base64-encoded.
   *
   * A function response travels as a JSON envelope with a string body, so anything
   * that is not text has to be base64-encoded and flagged. Without this the PDF
   * statement arrives as mangled UTF-8 and will not open.
   *
   * Given as content-type glob patterns, which is the shape serverless-http
   * matches against the response headers.
   */
  binary: ['application/pdf', 'application/octet-stream', 'image/*', 'font/*'],
})
