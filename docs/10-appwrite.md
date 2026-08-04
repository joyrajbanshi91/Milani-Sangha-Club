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

## The API function

The whole Express API runs as **one** Appwrite Function. Appwrite hands a function
`{ req, res, log, error }` rather than Node's request and response, so Express cannot
be mounted directly — `serverless-http` bridges that, and `createApp()` is reused
completely unchanged. Helmet, CORS, the rate limiter, request logging and body
parsing all keep working, and the backend's 148 tests exercise the same code.

One function rather than one per route, because the free plan allows two per project
and because `req.path` carries the full path, which is all the routing needs.

### Deploy it

```bash
npx --yes appwrite-cli login
npx --yes appwrite-cli push functions
```

`appwrite.config.json` holds the settings. If you configure it in the console
instead, these are the ones that matter:

| Setting        | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Root directory | `.` — the repo root, so the function can reach `backend/`                       |
| Entrypoint     | `functions/api/main.mjs`                                                        |
| Build commands | `npm install && npm --prefix backend install && npm --prefix backend run build` |
| Runtime        | `node-22`                                                                       |
| Timeout        | `30` — the cap for a synchronous execution anyway                               |
| Execute access | **Any**                                                                         |

### Why execute access is "Any"

A function reached through its own domain treats every caller as a guest, so Appwrite
requires `any` (or `guests`) or the domain does not work at all. That is not the
boundary being relied on: every privileged route verifies an Appwrite JWT through
`AuthService` and reads the caller's role from their account **labels**, which only a
server API key can set. The open door leads directly to a locked one.

### Environment variables for the function

Set these on the **function**, not the site. `APPWRITE_API_KEY` especially — it is a
server credential and must never be given to a browser.

| Variable               | Value                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `APPWRITE_ENDPOINT`    | `https://fra.cloud.appwrite.io/v1`                                                        |
| `APPWRITE_PROJECT_ID`  | `6a71561d000b4f4a06cb`                                                                    |
| `APPWRITE_API_KEY`     | the server key, Databases + Users scopes                                                  |
| `APPWRITE_DATABASE_ID` | `6a7187ed001ca816b1aa`                                                                    |
| `NODE_ENV`             | `production`                                                                              |
| `TRUST_PROXY`          | `1` — behind Appwrite's proxy, or the rate limiter throttles the whole club as one caller |
| `CLUB_NAME`            | `New Milani Sangha Club`                                                                  |
| `CORS_ORIGINS`         | the site's URL                                                                            |
| `APP_BASE_URL`         | the site's URL                                                                            |

### Then connect the site to it

The function has **its own domain**, separate from the site's, and Appwrite Sites has
no documented path rewrite to hide that. So unlike the single-origin arrangement
Netlify allowed, this is genuinely cross-origin:

1. Copy the function's domain from its **Domains** tab.
2. On the **site**, set `VITE_API_BASE_URL` to `https://<function-domain>/api/v1` and
   redeploy — it is compiled into the bundle, so a redeploy is required.
3. On the **function**, set `CORS_ORIGINS` to the site's URL. Miss this and the
   browser discards every response the API sends, which looks like the API being
   down rather than a header being absent.

### Check it

```
/api/v1/health         → {"status":"ok"…}   JSON, not HTML
/api/v1/health/ready   → {"status":"ready","checks":{...}}
```

HTML means the request never reached Express. Then sign in on the site.

### Testing the adapter without deploying

```bash
npm run test:function
```

Runs the real Express app through the real adapter with a faked Appwrite context, and
checks the things an adapter gets quietly wrong: that requests arrive, that the app's
own 404 comes back rather than Appwrite's HTML, that the query string and a JSON body
survive, and that helmet's headers are still on the response. Included in
`npm run verify`, after the build, because it drives `backend/dist`.

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

## Backups

Appwrite Cloud's own [database backups](https://appwrite.io/docs/products/databases/backups)
are a **paid feature** — Pro takes a daily backup kept for seven days, the free plan
takes none. So the club's backup is its own:

```bash
npm run backup                                   # writes backups/<timestamp>.json
npm run restore -- --file backups/<file>.json    # checks it; --write to restore
```

It uses only the ordinary Databases and Users APIs, so it costs nothing on any plan.
Every row of every table in `src/config/appwriteSchema.ts`, plus every account and
its role labels — the schema is shared with the provisioning script precisely so a
table added there cannot go unbacked-up.

**Check every backup you take.** `npm run restore -- --file …` without `--write`
validates the file and reports what it would do, in seconds. It refuses a file whose
recorded counts disagree with its contents, which is what a truncated or edited dump
looks like. An untested backup is a guess.

### Passwords are left out by default

Appwrite can return password hashes, and this does not take them. With them the file
becomes a credential store: whoever obtains it can attack the hashes at leisure.
Without them, a restore means each member uses "Reset password" once — a small
inconvenience against a standing risk. `--include-credentials` overrides it; if you
use that flag, treat the file as you would the cash box.

### Sending them to Google Drive

Google Drive for Desktop syncs an ordinary folder, so a backup reaches Drive simply
by being written into it. No API key, no service account, no OAuth — which for a
club is the point: fewer credentials to leak, and none to expire unnoticed.

1. Install [Google Drive for Desktop](https://www.google.com/drive/download/) and
   sign in. It mounts at
   `~/Library/CloudStorage/GoogleDrive-<your-email>/My Drive`.
2. Run it:

   ```bash
   bash scripts/backup-to-drive.sh
   ```

   The folder is found automatically and created on first use as
   **Milani Sangha Club backups**. Override with `BACKUP_DIR=…` for a different
   folder or an external disk. `KEEP=30` sets how many copies to retain.

3. **Check the Drive folder is not shared with anyone who should not see member
   data.** Right-click → Share. A backup carries every member's name, email and
   the whole ledger.

Pruning is by count, not by age — deliberately. Pruning by age empties the folder
entirely if backups stop running, which is exactly when the old ones become
precious.

To run it weekly, put this in `~/Library/LaunchAgents/club.backup.plist` and load it
with `launchctl load ~/Library/LaunchAgents/club.backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>club.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/CHANGEME/Documents/Milani_Sangha_Club/scripts/backup-to-drive.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>20</integer></dict>
  <key>StandardOutPath</key><string>/tmp/club-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/club-backup.log</string>
</dict></plist>
```

Read `/tmp/club-backup.log` occasionally. The script exits non-zero on failure and
refuses to report success unless a new file actually appeared — a scheduled job that
claims to work while writing nothing is the failure that goes unnoticed for months.

### Where to keep them

`backups/` is git-ignored and must stay that way — **this repository is public**, and
a dump contains member data.

Keep copies **off Appwrite**: a backup inside the thing that failed is no backup.
Google Drive is the club's own storage and is a sensible home. Running it on a
schedule is a shell one-liner in `cron` or a launchd job on whichever machine the
treasurer uses; the script exits non-zero on failure so a scheduler can tell.

GitHub Actions would be the obvious free scheduler and is **not** suitable here:
artifacts and commits on a public repository are readable by anyone. It becomes an
option only if this repository is made private.

### What a restore does and does not do

Rows are upserted by their original id, so a restore is idempotent and can be re-run
after an interruption. **Nothing is ever deleted** — it reinstates, it does not
mirror, because asking a script to delete a club's financial records is a different
and much more dangerous thing. For an exact copy of a moment, restore into a fresh
database with `--database`.

Reference-number counters live in the `settings` table and so are included. Without
them a restored ledger would reissue reference numbers that already exist, which is
the sort of thing an audit notices years later.

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
