# Appwrite — the database and sign-in

Appwrite provides two things to this application: **Databases** for the ledger and
**Authentication** for member sign-in. Its free plan needs no card, which is why it is
the recommended backing store.

**Appwrite does not host the site.** Hosting is Netlify —
[09-netlify.md](09-netlify.md) — and this document assumes it. An earlier plan put the
website on Appwrite Sites and the API in an Appwrite Function; that arrangement was
abandoned, and everything specific to it (`appwrite.config.json`, the Appwrite
function entrypoint, the Sites build settings) has been removed from the repository.
What survives is the part that was always the valuable bit: the data layer, the
provisioning script and the backups.

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

For the deployed site, the same values go in the Netlify dashboard with the scopes set
out in [09-netlify.md § 5](09-netlify.md#5-optional-connect-a-real-database). The
`VITE_` pair must be scoped to **Builds**; the API key must be scoped to **Functions
only**, or it is compiled into the browser bundle where anyone can read it.

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
