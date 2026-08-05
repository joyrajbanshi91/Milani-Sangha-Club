# Environment variables

Two files, two different threat models. Read the first paragraph of each section
before filling anything in.

**Nothing in either file is required.** Both apps run with no environment variables
at all: the website is self-contained, and the API falls back to an embedded sample
ledger with demo sign-in. Every variable below switches something on or points it
somewhere else. That is what makes a first deploy to Netlify a push rather than a
configuration exercise — see [09-netlify.md](09-netlify.md).

---

## Frontend — `frontend/.env.local`

**Everything here is public.** Vite compiles `VITE_*` values into the JavaScript
bundle that is served to every visitor. Anyone can read them with DevTools.

That is fine for an Appwrite endpoint and project id — they are identifiers, not
credentials, and access is decided by the caller's session and by table permissions.
It is never fine for a server API key, a service account key, an SMTP password or any
other secret.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_APPWRITE_PROJECT_ID` | no | Appwrite project id. **Blank means demo sign-in** — a working state, not an error |
| `VITE_APPWRITE_ENDPOINT` | no (default set) | Region-specific, e.g. `https://fra.cloud.appwrite.io/v1`. Copy it from the console rather than guessing |
| `VITE_API_BASE_URL` | no (default `/api/v1`) | API prefix. Relative, because the Netlify redirect keeps the API on the site's own origin |
| `VITE_CLUB_NAME` | no (default set) | Club name shown throughout the UI |
| `VITE_CLUB_UPI_ID` | no | Displayed alongside the payment QR code (Phase 7) |
| `VITE_SUPPORT_EMAIL` | no | Contact address in the footer and help desk |
| `DEV_API_PROXY` | no | Dev-server proxy target. Intentionally has no `VITE_` prefix, so it stays out of the browser bundle; read by `vite.config.ts` only |

**No required variables, down from six.** The six `VITE_FIREBASE_*` values went when
sign-in moved to Appwrite, which needs only a project id and an endpoint — and then
the project id stopped being required too, because demanding it was the single reason
a hosted build failed. Removing the Firebase SDK also took 63 KiB off the precached
bundle.

Values are validated by `frontend/src/config/env.ts` at startup. Since absence can no
longer fail, the only error it can now raise is a value that is *present but
malformed* — a support address that is not an email address, say.

`frontend/scripts/check-build-env.mjs` runs as `prebuild`, so `npm run build` cannot
skip it. It no longer fails over a missing variable; it prints which optional
integrations are off, and stops the build for exactly one thing — the frontend
workspace not being installed, which otherwise dies at `vite: not found` and says
nothing about the cause.

It **imports nothing**, not even Vite. An earlier version used Vite's `loadEnv`, which
read the files correctly but broke in the one situation the check exists for: a hosted
build whose install step had not yet created `node_modules`, where it failed with
`ERR_MODULE_NOT_FOUND: vite` instead of naming the problem. A guard must not depend on
the toolchain it is guarding.

---

## Backend — `backend/.env`

**Everything here is secret.** This file is git-ignored and must stay that way.
For the deployed API these values live in the Netlify dashboard, scoped to
**Functions**, never in a file in the repository.

With none of them set the API runs the embedded demo ledger and demo sign-in, logs a
warning saying so on every boot, reports `store: "memory"` from `/auth/config`, and
answers `503` from `/api/v1/health/ready`. It does **not** refuse to start; see
`container.ts` for why that changed.

### Service

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `5055` | Listening port |
| `APP_VERSION` | `0.1.0` | Reported by the health endpoint |
| `LOG_LEVEL` | `info` | `fatal`…`trace`, or `silent` |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed browser origins |
| `APP_BASE_URL` | `http://localhost:5173` | Public web app URL used in emails, receipts and QR verification links |
| `TRUST_PROXY` | `0` | Proxy hops to trust for client IP. `0` locally, `1` behind Netlify — wrong values break rate limiting |

### Appwrite — the recommended store

Set all three, or none. `container.ts` prefers Appwrite whenever these are present, so
a deployment still carrying stale `FIREBASE_*` values cannot quietly keep writing the
ledger to Firestore.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APPWRITE_ENDPOINT` | `https://cloud.appwrite.io/v1` | **Region-specific** on Appwrite Cloud. Copy it from the console |
| `APPWRITE_PROJECT_ID` | — | Project id. Also read from `APPWRITE_FUNCTION_PROJECT_ID` when running inside an Appwrite Function |
| `APPWRITE_API_KEY` | — | **Server** key, scopes: Databases read/write, Users read/write |
| `APPWRITE_DATABASE_ID` | `club` | Which database holds the tables |

`APPWRITE_API_KEY` has project-wide reach and bypasses every permission check. It is
the most dangerous value in this project alongside a service account key. Never give it
to a browser: on Netlify it must be scoped to **Functions** and not Builds. Setup is in
[10-appwrite.md](10-appwrite.md).

### Firebase Admin — the alternative store

Supply **one** of these two forms. Only read when the `APPWRITE_*` values are absent.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to a service account JSON file. Keep the file outside the repository. Simplest choice locally |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | The same credential inline. Preferred for CI and hosting secrets. Keep the literal `\n` sequences in the private key — the code converts them |
| `FIREBASE_STORAGE_BUCKET` | Bucket for receipts, gallery media and documents |

On Google's own runtimes (Cloud Run, Cloud Functions, App Engine) neither form is
needed: the runtime service account is picked up automatically, which is what
`isGoogleCloudRuntime` in `config/env.ts` detects. On Netlify there is no such thing,
which is why the inline trio is the form to use there — a function has no filesystem to
mount a key file onto.

A service account key is the most dangerous value in this project. It bypasses
every security rule. Do not commit it, do not paste it into a chat or a ticket,
and rotate it if it is ever exposed
(**Project settings → Service accounts → Manage keys**).

### Emulators

| Variable | Example |
| --- | --- |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` |
| `FIREBASE_STORAGE_EMULATOR_HOST` | `127.0.0.1:9199` |

Set by the Firebase CLI when routes run under `firebase emulators:exec`; set them by
hand when running `npm run dev:api` against a running emulator suite
(`npm run emulators`, which goes through `npx` — no global install needed).

Only relevant if the club chooses Firestore. Appwrite has no local emulator, so local
work against Appwrite uses a real project — or, more usually, the demo store.

### Rate limiting

| Variable | Default | Purpose |
| --- | --- | --- |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Window (15 minutes) |
| `RATE_LIMIT_MAX` | `300` | Requests per window per IP across the whole API |

Sensitive endpoints (login, OTP, payment submission) additionally get a fixed
10-per-15-minutes limiter from Phase 3.

### Email — Phase 13

| Variable | Notes |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `587` with `SMTP_SECURE=false` (STARTTLS) suits most providers |
| `SMTP_USER`, `SMTP_PASSWORD` | For Google Workspace use an app password, never the account password |
| `MAIL_FROM` | e.g. `Milani Sangha Club <no-reply@example.org>` |

### Club identity

| Variable | Purpose |
| --- | --- |
| `CLUB_NAME` | Name on receipts, cards and emails |
| `CLUB_UPI_ID` | UPI id the club collects into. Also stored in the `settings` collection from Phase 5 so the treasurer can change it without a deploy |
| `CLUB_ADDRESS` | Optional. Printed under the club's name on receipts and statements. The API cannot read the website's content file, so the address for printed documents is stated here — keep it in step with section 1 of `frontend/src/content/site.ts`. Unset, the documents print the name alone |
| `CLUB_REGISTRATION_NUMBER` | Optional. Printed as *Registration no. …* under the address |

The club's **logo** on those documents is not an environment variable: it is compiled into
the API by `npm run logo:pdf`, because a bundled serverless function cannot read a loose
file. See §6 of docs/11-running-the-club-office.md.

---

## CI and deployment secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**.

Deployment does **not** happen from GitHub Actions. Netlify builds and publishes on
push, so the deployment variables live in the Netlify dashboard — see
[09-netlify.md § 5](09-netlify.md#5-optional-connect-a-real-database) for the full list
with the scope each one needs.

**`ci.yml` needs no secrets at all.** It builds with no environment variables, which is
deliberate: that is exactly the state a fresh Netlify deploy builds in, so if it ever
stops working, CI is what notices rather than the club.
