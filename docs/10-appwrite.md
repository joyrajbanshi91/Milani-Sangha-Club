# Appwrite

The club is moving from Firebase to Appwrite: Appwrite Sites for the website,
Appwrite Databases for the ledger, Appwrite Authentication for sign-in, and one
Appwrite Function for the API.

**This migration is part-way done.** Read [Where this stands](#where-this-stands)
before expecting the member area to work on a deployed site.

---

## Build settings for the site

Appwrite Sites does not detect a monorepo on its own, and this repository holds
three npm projects — root, `frontend/` and `backend/`. With the defaults it runs
`npm install` at the root, which installs neither, and then tries to build the
frontend anyway. That fails at the first thing to need a dependency.

**Your site → Settings → Build settings:**

| Setting | Value |
| --- | --- |
| Root directory | `./frontend` |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `./dist` |

Pointing the root directory at `frontend` is what makes the other three ordinary.
The site is a static bundle, so the backend has no part in this build and should
not be installed or compiled by it.

If you would rather keep the root directory at `/`, this is the equivalent — note
it installs only the frontend, deliberately:

| Setting | Value |
| --- | --- |
| Install command | `npm --prefix frontend install` |
| Build command | `npm run build:web` |
| Output directory | `./frontend/dist` |

### SPA fallback

The app is a single-page application: React Router owns every path. Without a
fallback, `/login` returns 404 on a fresh visit even though it works when reached
by clicking. Set the fallback file to `index.html` in the site's settings.

---

## Environment variables

**Your site → Settings → Environment variables.** These are compiled into the
browser bundle by Vite, so **changing one needs a new build**, not a restart.

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | from `frontend/.env.local` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `club-app-8ce22.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `club-app-8ce22` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `club-app-8ce22.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `5690789841` |
| `VITE_FIREBASE_APP_ID` | `1:5690789841:web:e61dc9e50c74fe1ae5daf0` |
| `VITE_API_BASE_URL` | `/api/v1` |

Yes, those are still the Firebase ones — sign-in has not moved yet. They go away
in stage 2, replaced by `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID`.

`frontend/scripts/check-build-env.mjs` fails the build if any required variable is
missing, with the list, rather than letting a bundle with no configuration in it
reach a member's browser. It imports nothing, so it reports the missing variable
even when the install step has not run.

### For the API (stage 2, not yet deployed)

The function will need these. `APPWRITE_API_KEY` is a **server** credential with
project-wide reach and must never be set on the site, only on the function.

| Variable | Value |
| --- | --- |
| `APPWRITE_ENDPOINT` | `https://<region>.cloud.appwrite.io/v1` — region-specific |
| `APPWRITE_PROJECT_ID` | your project id |
| `APPWRITE_API_KEY` | server key, Databases + Users scopes |
| `APPWRITE_DATABASE_ID` | `club` |
| `CLUB_NAME`, `APP_BASE_URL`, `CORS_ORIGINS` | as in `backend/.env.example` |

---

## Provisioning the database

Once the project exists and `backend/.env` has the three `APPWRITE_*` values:

```bash
npm --prefix backend run provision:appwrite            # prints the plan, writes nothing
npm --prefix backend run provision:appwrite -- --write
npm run seed:finance -- --dir ../data/demo --write     # chart of accounts
```

This creates the database, six tables, their columns and their indexes —
replacing `firebase/firestore.rules` and `firestore.indexes.json` together. It is
safe to re-run: anything already present is left alone.

**Every table is created with no permissions.** That is the security posture, not
an oversight. The browser never receives a database handle, so nothing signed in —
member or treasurer — can read or write the ledger directly. Access goes through
the API, which holds the server key and enforces what a permission system cannot
express: two-person approval, gapless reference numbers, the audit trail.

---

## Things worth knowing about the platform

Checked while planning this migration, because each one shaped a decision:

- **Express does not run in an Appwrite Function.** The handler receives
  `({ req, res, log, error })` with Appwrite's own objects, not Node's — so
  `serverless-http`, which is how the API ran on Netlify, has nothing to adapt.
  `req.path` is available, so one function routes every `/api/v1/*` path itself.
- **The free plan allows two functions per project**, reduced from five on
  8 January 2026. One function with internal routing is therefore the design, not
  a shortcut.
- **Synchronous executions are terminated at 30 seconds** (asynchronous ones get
  up to 900). Report and receipt generation must stay well inside that.
- **Transactions are available** — the Transactions API arrived in October 2025 and
  gives ACID multi-row writes. Without it the gapless reference sequence and the
  two-person approval lock could not have been ported honestly.
- **A function has its own domain**, and there is no documented Sites-to-Function
  path rewrite. `/api` is therefore cross-origin, so `CORS_ORIGINS` matters again —
  the single-origin arrangement Netlify allowed does not carry over for free.

Sources, worth re-checking as the platform changes:
[Sites: deploy from Git](https://appwrite.io/docs/products/sites/deploy-from-git) ·
[Functions: develop](https://appwrite.io/docs/products/functions/develop) ·
[Transactions](https://appwrite.io/docs/products/databases/transactions) ·
[Tables](https://appwrite.io/docs/products/databases/tables) ·
[Free plan function limit](https://appwrite.io/changelog/entry/2026-01-08)

---

## Where this stands

| Stage | What it covers | State |
| --- | --- | --- |
| 1 | Appwrite data layer — `appwriteStore.ts`, provisioning script, config | **done** |
| 2 | Sign-in on Appwrite Auth, and the API as an Appwrite Function | not started |
| 3 | Remove Firebase and the Netlify function; documentation | not started |

Stage 1 is additive: Firebase is still wired up and selected when only Firebase
credentials are present, so nothing about the current deployment changed. Set the
`APPWRITE_*` variables and the ledger moves to Appwrite; `container.ts` prefers
Appwrite when both are configured.

**Until stage 2 lands, a site deployed here serves the public pages and signs
members in through Firebase, and the officer area has no API to talk to.** That is
expected, not a misconfiguration.
