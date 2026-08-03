# Environment variables

Two files, two different threat models. Read the first paragraph of each section
before filling anything in.

---

## Frontend — `frontend/.env.local`

**Everything here is public.** Vite compiles `VITE_*` values into the JavaScript
bundle that is served to every visitor. Anyone can read them with DevTools.

That is fine for Firebase web configuration — it is an identifier, not a
credential, and access is controlled by Authentication and security rules. It is
never fine for a service account key, an SMTP password or an API secret.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | yes | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | yes | Firebase project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | yes | `<project>.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes | Cloud Messaging sender id |
| `VITE_FIREBASE_APP_ID` | yes | Web app id |
| `VITE_FIREBASE_MEASUREMENT_ID` | no | Google Analytics, if used |
| `VITE_FIREBASE_VAPID_KEY` | no | Web push public key (Phase 13) |
| `VITE_API_BASE_URL` | yes (default `/api/v1`) | API prefix; keep relative so one origin serves both |
| `VITE_USE_FIREBASE_EMULATORS` | no | `true` to use the local emulator suite |
| `VITE_CLUB_NAME` | yes (default set) | Club name shown throughout the UI |
| `VITE_CLUB_UPI_ID` | no | Displayed alongside the payment QR code (Phase 7) |
| `VITE_SUPPORT_EMAIL` | no | Contact address in the footer and help desk |
| `DEV_API_PROXY` | no | Dev-server proxy target. Intentionally has no `VITE_` prefix, so it stays out of the browser bundle; read by `vite.config.ts` only |

All values are validated by `frontend/src/config/env.ts` at startup. A missing
required key shows a readable error screen naming it, rather than a blank page.

The required keys are also checked **before the build**, by
`frontend/scripts/check-build-env.mjs` (wired as `prebuild`, so `npm run build`
cannot skip it). This matters for hosted builds: `VITE_*` values are compiled into
the bundle, so one missing on the build machine cannot be recovered at runtime — the
deploy would succeed and the published site would then refuse to start for every
visitor. The check reads the environment through Vite's own `loadEnv`, so it sees
what the build will see: the `.env` files plus `process.env` (Netlify dashboard
variables, GitHub Actions `env:`).

---

## Backend — `backend/.env`

**Everything here is secret.** This file is git-ignored and must stay that way.
In production these values come from the hosting platform's secret manager
(Secret Manager for Cloud Run / Cloud Functions), not from a file in the image.

### Service

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `5055` | Listening port |
| `APP_VERSION` | `0.1.0` | Reported by the health endpoint |
| `LOG_LEVEL` | `info` | `fatal`…`trace`, or `silent` |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed browser origins |
| `APP_BASE_URL` | `http://localhost:5173` | Public web app URL used in emails, receipts and QR verification links |
| `TRUST_PROXY` | `0` | Proxy hops to trust for client IP. `0` locally, `1` behind Hosting/Cloud Run — wrong values break rate limiting |

### Firebase Admin

Supply **one** of these two forms.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to a service account JSON file. Keep the file outside the repository. Simplest choice locally |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | The same credential inline. Preferred for CI and hosting secrets. Keep the literal `\n` sequences in the private key — the code converts them |
| `FIREBASE_STORAGE_BUCKET` | Bucket for receipts, gallery media and documents |

On Cloud Run and Cloud Functions neither form is needed: the runtime service
account is picked up automatically.

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

Set by the Firebase CLI when routes run under `firebase emulators:exec`;
set them by hand when running `npm run dev:api` against a running emulator suite.

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

---

## CI and deployment secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**.

| Name | Kind | Used by |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | secret | `deploy.yml` — full JSON of a deploy service account |
| `FIREBASE_PROJECT_ID` | secret | `deploy.yml`, `ci.yml` |
| `FIREBASE_TOKEN` | secret | optional: `ci.yml` rules dry-run |
| `VITE_FIREBASE_*` | secret | `deploy.yml` build step |
| `VITE_CLUB_UPI_ID` | secret | `deploy.yml` build step |
| `CLUB_NAME`, `SUPPORT_EMAIL` | variable | `deploy.yml` build step |

The `production` environment in `deploy.yml` should have required reviewers
configured, so a push to `main` cannot reach members without a human approving it.
