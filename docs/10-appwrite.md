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

### The settings are in the repository

`appwrite.config.json` holds all of them — `path`, install and build commands,
output directory and the SPA fallback — so they are reviewed and version-controlled
rather than retyped into a form. Put your project id in it, then:

```bash
npx --yes appwrite-cli login
npx --yes appwrite-cli push sites
```

This is the reliable route. A git-connected site takes its build settings from the
**console**, not from this file, so if the two disagree the console wins and the
file is documentation only. Pushing from the CLI applies exactly what is written
here — which is why it is worth preferring when a console-configured build is
failing for reasons that are hard to see.

Values checked against `node-appwrite`'s own enums rather than documentation prose:
`framework: vite`, `adapter: static`, `buildRuntime: node-22`.

### Or set them by hand in the console

**Your site → Settings → Build settings:**

| Setting          | Value           |
| ---------------- | --------------- |
| Root directory   | `./frontend`    |
| Install command  | `npm install`   |
| Build command    | `npm run build` |
| Output directory | `./dist`        |

Pointing the root directory at `frontend` is what makes the other three ordinary.
The site is a static bundle, so the backend has no part in this build and should
not be installed or compiled by it.

If you would rather keep the root directory at `/`, this is the equivalent — note
it installs only the frontend, deliberately:

| Setting          | Value                           |
| ---------------- | ------------------------------- |
| Install command  | `npm --prefix frontend install` |
| Build command    | `npm run build:web`             |
| Output directory | `./frontend/dist`               |

### SPA fallback

The app is a single-page application: React Router owns every path. Without a
fallback, `/login` returns 404 on a fresh visit even though it works when reached
by clicking. Set the fallback file to `index.html` in the site's settings.

---

## Environment variables

**Your site → Settings → Environment variables.** These are compiled into the
browser bundle by Vite, so **changing one needs a new build**, not a restart.

**On Appwrite Sites, none are required.**

Appwrite injects `APPWRITE_SITE_PROJECT_ID` and `APPWRITE_SITE_API_ENDPOINT` into
every deployment, and `vite.config.ts` falls back to them. A site hosted inside the
project therefore already knows which project it belongs to, and which region — the
part most easily got wrong by hand. There is nothing to type, and so nothing to
mistype.

Set these only to override that:

| Variable                   | When                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `VITE_APPWRITE_PROJECT_ID` | a site deployed from one project against another             |
| `VITE_APPWRITE_ENDPOINT`   | as above                                                     |
| `VITE_API_BASE_URL`        | `/api/v1` until the function exists, then the function's URL |

An explicit value wins over the injected one. An **empty** variable does not: a name
created in a dashboard without a value counts as unset, so it cannot shadow what
Appwrite already supplied. That case cost several failed deploys before the fallback
existed.

The six `VITE_FIREBASE_*` variables are gone — sign-in is Appwrite now. If they are
still set on your site you can delete them; nothing reads them.

Locally there is no injection, so `frontend/.env.local` still needs
`VITE_APPWRITE_PROJECT_ID`.

`frontend/scripts/check-build-env.mjs` fails the build if a required variable is
missing, saying which and _why_ — absent, present but empty, or misspelt. It imports
nothing, so it reports the problem even when the install step has not run.

### For the API (stage 2, not yet deployed)

The function will need these. `APPWRITE_API_KEY` is a **server** credential with
project-wide reach and must never be set on the site, only on the function.

| Variable                                    | Value                                                     |
| ------------------------------------------- | --------------------------------------------------------- |
| `APPWRITE_ENDPOINT`                         | `https://<region>.cloud.appwrite.io/v1` — region-specific |
| `APPWRITE_PROJECT_ID`                       | your project id                                           |
| `APPWRITE_API_KEY`                          | server key, Databases + Users scopes                      |
| `APPWRITE_DATABASE_ID`                      | `club`                                                    |
| `CLUB_NAME`, `APP_BASE_URL`, `CORS_ORIGINS` | as in `backend/.env.example`                              |

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

| Stage | What it covers                                                        | State       |
| ----- | --------------------------------------------------------------------- | ----------- |
| 1     | Appwrite data layer — `appwriteStore.ts`, provisioning script, config | **done**    |
| 2a    | Sign-in on Appwrite Auth; Firebase gone from the frontend             | **done**    |
| 2b    | The API as an Appwrite Function                                       | not started |
| 3     | Remove Firestore from the backend; finish the documentation           | not started |

The frontend no longer contains Firebase at all — no SDK, no `lib/firebase.ts`, no
`VITE_FIREBASE_*`. Sign-in, password reset and sign-out go through the Appwrite
Account API, and each request carries a fifteen-minute JWT minted from the session.

**Roles are Appwrite labels**, set only with a server API key
(`npm run user -- role --email … --role treasurer`). Deliberately not prefs: a
signed-in member can write their own prefs, so a role kept there could be
self-granted. The API reads the labels on every request, so a role change takes
effect immediately rather than waiting for a token to refresh.

The backend still holds Firestore as an alternative store, unused when the
`APPWRITE_*` variables are set — `container.ts` prefers Appwrite. That comes out in
stage 3.

**What does not work yet:** the officer area, because 2b has not been written — the
API is still an Express app with nowhere to run. A deployed site serves the public
pages, and sign-in will work as soon as the API is reachable. Expected, not a
misconfiguration.
