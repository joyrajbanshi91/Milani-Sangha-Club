# Appwrite — the database and sign-in

Appwrite provides two things to this application: **Databases** for the ledger and
**Authentication** for member sign-in. Its free plan needs no card, which is why it is
the recommended backing store.

**Appwrite hosts everything.** The website is an Appwrite Site, the API is an
Appwrite Function, and the database and sign-in are in the same project — see
[Hosting the site and the API](#hosting-the-site-and-the-api) below. Netlify was the
host until the club's project there was deleted;
[09-netlify.md](09-netlify.md) is kept as a working recipe for a second host but
nothing in it is live.

**None of this is required to deploy.** With no Appwrite project configured the API
serves an embedded sample ledger and offers demo sign-in, and the site works. Set this
up when the club is ready to keep real records.

---

## 1. Create the project

1. [cloud.appwrite.io](https://cloud.appwrite.io) → create a project. **Choose the
   region deliberately** — it is fixed afterwards, and it decides your API endpoint.
2. Copy the endpoint and project id from **your project → Settings**. The endpoint is
   region-specific, e.g. `https://fra.cloud.appwrite.io/v1`. Copy it rather than
   guessing; a wrong region looks exactly like a wrong project id.
3. Create a **server API key** under **Overview → Integrations → API keys**, with
   scopes **Databases read/write** and **Users read/write**.

Neither the endpoint nor the project id is a secret. The API key is: it has
project-wide reach and bypasses every permission check.

Put all three in `backend/.env` for local work:

```ini
APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=<your project id>
APPWRITE_API_KEY=<your server key>
APPWRITE_DATABASE_ID=club
```

and in `frontend/.env.local` — the two public ones only:

```ini
VITE_APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=<your project id>
```

For the deployment, `npm run appwrite:deploy` sets these on the Function itself, read
from `backend/.env` — nothing to retype. The API key belongs on the **Function** and
never on the Site: a Site variable is available to the website's build, and a
project-wide server key has no business anywhere near the browser bundle.

The key also needs **Sites, Functions and Proxy** scopes to deploy, not only the
Databases and Users scopes listed above.

---

## 2. Create the officers' accounts

```bash
npm run user -- list                                          # who exists, and their roles
npm run user -- create --email … --name "…"                   # create an account
npm run user -- role --email … --role treasurer               # grant a role
```

**Roles are Appwrite labels**, which only a server key can set. Deliberately not
prefs: a signed-in member can write their own prefs, so a role kept there could be
self-granted. The API reads the labels on every request, so a role change takes effect
on the member's very next call rather than waiting for a token to refresh.

The roles the finance area recognises are `president`, `secretary` and `treasurer`;
anyone signed in without a role label is an ordinary `member`. The two-person approval
rule needs at least two of the three officer accounts to be real people with their own
passwords — sharing one account defeats it entirely.

---

## 3. Diagnose a deployment

```bash
npm run appwrite:check
```

Reports whether the credentials work, which tables exist, and what the schema in
`src/config/appwriteSchema.ts` expects but does not find. Run it before concluding
that something in the application is broken.

---

## Hosting the site and the API

One project holds all four pieces: the website as a **Site**, the Express API as a
**Function**, plus the database and authentication.

```
  browser ──► https://newmilanisanghaclub.appwrite.network   the website (static, SPA fallback)
                      │
                      └── fetch ──► https://milani-api.fra.appwrite.run/api/v1/**
                                            │                the API, as a Function
                                            └──► Appwrite Databases + Authentication
```

Both the website and the API keep a **named** domain, created deliberately, rather
than the generated one Appwrite assigns. The generated site domain
(`6a71ec2a0026821e494c.appwrite.network`) still resolves and is still allowed by CORS,
so an old link does not break.

To add another name for the site:

```bash
curl -X POST "$APPWRITE_ENDPOINT/proxy/rules/site" \
  -H "X-Appwrite-Project: $APPWRITE_PROJECT_ID" \
  -H "X-Appwrite-Key: $APPWRITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"newmilanisanghaclub.appwrite.network","siteId":"milani-web"}'
```

Then add it to `CORS_ORIGINS` on the **function** and redeploy the function, or every
call from the new domain fails with `403 cors_rejected`. `CORS_ORIGINS` is
comma-separated, so keep the old origin listed too.

### Deploy

```bash
npm run appwrite:deploy          # API function and website
npm run appwrite:deploy -- api   # just the API
npm run appwrite:deploy -- web   # just the website
```

It configures the CLI from `backend/.env`, so there is no separate `appwrite login`.
The API key needs **Sites, Functions and Proxy** scopes as well as Databases and
Users — a key created only for the database cannot deploy, and the error it gives does
not say so.

### Deploying on every push

```bash
npm run appwrite:github            # reports what it would connect
npm run appwrite:github -- --write # connects the website and the API
```

**The first time needs a browser.** Appwrite reaches GitHub through its own GitHub
App, and installing that is an OAuth grant with no API: console → your project →
**Settings → Git**, choose GitHub, and give it access to this repository. "Only select
repositories" is enough and better than granting everything you own. After that the
command above attaches the repository to both resources and a push to `main` rebuilds
them.

The two root directories differ and matter: the **website** builds from `frontend/`,
the **API** from the repository root, because its entrypoint imports `backend/dist`.
Swapped, the build fails on a missing package.json, which reads like a broken
repository rather than a wrong setting.

`providerSilentMode` is on, so Appwrite does not comment on every commit.

Note that a push rebuilds *both*, even when only one changed. `providerPaths` on each
resource narrows that if it becomes tiresome.

### The site and the API are on different domains

This is the one real difference from a single-origin host, and two things follow from
it that are easy to get wrong:

- **The website needs an absolute API URL.** `VITE_API_BASE_URL` is set as a *site*
  variable to `https://milani-api.fra.appwrite.run/api/v1`. It is compiled into the
  bundle, so changing it needs a rebuild — `npm run appwrite:deploy -- web`. Left
  unset, the app falls back to the relative `/api/v1`, which hits the website's own
  domain, finds no API, and reports *"Could not reach the club's server"*.
- **CORS is genuinely exercised.** `CORS_ORIGINS` on the *function* must contain the
  site's URL exactly. Wrong or missing, every call fails with
  `403 cors_rejected` — and the browser console blames CORS while the API looks
  perfectly healthy when you curl it directly.

### Use the named API domain, not the generated one

Appwrite gives a function a domain automatically, named after the deployment
(`6a71eb550029f8324d44.fra.appwrite.run`). **That domain changes when the function is
redeployed**, so a website built against it breaks on the next push.

A second, named rule was created deliberately — `milani-api.fra.appwrite.run` — and it
follows the active deployment. That is the one the website is built against, and
`npm run appwrite:check` prefers it when reporting, telling the two apart by whether
the label looks like a generated id.

To create one for a new project:

```bash
curl -X POST "$APPWRITE_ENDPOINT/proxy/rules/function" \
  -H "X-Appwrite-Project: $APPWRITE_PROJECT_ID" \
  -H "X-Appwrite-Key: $APPWRITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"milani-api.fra.appwrite.run","functionId":"api"}'
```

### frontend/.gitignore is load-bearing

`appwrite push site` packs the site's `path` — `frontend/` — and looks for a
`.gitignore` *inside that directory*, not at the repository root. Without one it
excluded nothing and tried to upload 391 MB of `node_modules`, failing with *"The file
size is either not valid or exceeds the maximum allowed size"* — a message about a
limit rather than about the dependencies that should never have been in the archive.

### Checking a deployment

```bash
npm run appwrite:check
```

Reports the credentials, the tables, the accounts, and probes the deployed API at the
domain it discovers from the project itself. No URL to paste, and nothing to go stale.

---

## Provisioning the database

Once the project exists and `backend/.env` has the three `APPWRITE_*` values:

```bash
npm --prefix backend run provision:appwrite            # prints the plan, writes nothing
npm --prefix backend run provision:appwrite -- --write
npm run seed:finance -- --dir ../data/demo --write     # chart of accounts
```

This creates the database, six tables, their columns and their indexes. It is safe to
re-run: anything already present is left alone.

**Re-run it after any change to the schema**, which includes upgrading the code. The
payments table gained a `securityCode` column and a unique index on it when receipts
started carrying a verification code; until provisioning has run, Appwrite rejects a write
carrying a column it does not know about, and a member declaring a payment gets an error.
The dry run above prints exactly what is missing, so it is a safe thing to check on a
Sunday afternoon.

`npm run appwrite:provision -- --write` from the repository root does the same thing.
That alias was broken for a while — it lacked a trailing `--`, so npm swallowed
`--write` as its own flag, printed a warning, ran the dry run and exited 0. It looked
like it had worked and created nothing.

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
bash scripts/backup-to-drive.sh                  # into Google Drive, with a readable copy
npm run backup                                   # or locally: backups/<timestamp>.json
npm run restore -- --file backups/<file>.json    # checks it; --write to restore
npm run export:book -- --file backups/<file>.json   # a spreadsheet from any backup
```

It uses only the ordinary Databases and Users APIs, so it costs nothing on any plan.

**The JSON is a restore file, not a readable one.** `export:book` turns any backup into an
.xlsx — one sheet per table, amounts in rupees, and a summary of every fund's balance
computed by the same domain code as the printed statement. That is what the club opens on
the evening the site is down; `scripts/backup-to-drive.sh` writes both files, so the Drive
folder always holds one of each. See
[11-running-the-club-office.md § 11](11-running-the-club-office.md) for the routine.
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

`backups/` is git-ignored and must stay that way — a dump contains every member's
name and email and the whole ledger, and a repository that is public today may have
been public when the file was committed.

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

Each of these shaped a decision, and each is worth re-checking as Appwrite changes:

- **Transactions are available.** The Transactions API arrived in October 2025 and
  gives ACID multi-row writes. Without it the gapless reference sequence and the
  two-person approval lock could not have been ported honestly — they are the two
  places where a partial write would corrupt the ledger rather than merely lose an
  entry.
- **Database backups are a paid feature.** Pro takes a daily backup kept for seven
  days; the free plan takes none. Hence the club's own backup script above, which uses
  only the ordinary APIs and so costs nothing on any plan.
- **The browser never gets a database handle.** `frontend/src/lib/appwrite.ts`
  imports `Account` and deliberately not `Databases`. Every figure comes through the
  Express API, because the rules that matter cannot be expressed as table
  permissions: two-person approval, gapless reference numbers, the audit trail. A
  client-side database handle would be a second, weaker path to the same data.
- **Sign-in is a JWT, minted per page-load and refreshed.** Appwrite JWTs last
  fifteen minutes. The browser mints one from the session on demand and re-mints it
  near expiry; minting per request would add a round trip to every call, and holding
  one for a whole visit would sign the treasurer out mid-entry.

Sources:
[Databases: transactions](https://appwrite.io/docs/products/databases/transactions) ·
[Databases: tables](https://appwrite.io/docs/products/databases/tables) ·
[Databases: backups](https://appwrite.io/docs/products/databases/backups) ·
[Authentication: JWT](https://appwrite.io/docs/products/auth/jwt) ·
[Pricing](https://appwrite.io/pricing)

---

## Where this stands

| Part                                                    | State                          |
| ------------------------------------------------------- | ------------------------------ |
| Appwrite data layer — `appwriteStore.ts`, provisioning   | **done**                       |
| Sign-in, roles and password reset on Appwrite Auth      | **done**                       |
| Profiles (`profileStore.ts`)                             | **done**                       |
| The API as a function                                    | **done** — on Netlify, not Appwrite |
| Firestore as an alternative store                        | kept, unused when `APPWRITE_*` is set |

`container.ts` prefers Appwrite whenever both are configured, so a deployment still
carrying stale `FIREBASE_*` variables cannot quietly keep writing the ledger to
Firestore.

Firestore is retained rather than removed: it is a working alternative for a club that
already has a Firebase project, and `firebase/firestore.rules` still describes the
access model for that case. Nothing selects it unless its credentials are the only
ones present.
