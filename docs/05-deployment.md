# Deployment — operating a release

**Setting Appwrite up is [10-appwrite.md](10-appwrite.md).** This document is the
other half: what to do around a release once it is set up — how a deploy happens, how
to verify one, how to undo one, and what is *not* covered by it.

Two earlier arrangements are gone rather than annotated, because a superseded page
that still reads like instructions is worse than no page: a Firebase Hosting + Cloud
Run topology that required the Blaze plan and was never successfully deployed, and a
fortnight on Netlify whose project no longer exists.

---

## Topology

| Component | Runs on | Notes |
| --- | --- | --- |
| PWA (`frontend/dist`) | Appwrite Site `milani-web` | Built from `frontend/`, SPA fallback to `index.html` |
| API (`backend/`) | Appwrite Function `api` (`functions/api/main.mjs`) | **Its own domain**, so CORS is load-bearing: `CORS_ORIGINS` must list the site's URL |
| Ledger | Appwrite Databases, or Firestore, or the embedded demo | Chosen by which credentials exist — `container.ts` |
| Sign-in | Appwrite Authentication, or demo accounts | Chosen the same way — `authService.ts` |

One project holds all four. The site and the API have separate domains, which is why
`CORS_ORIGINS` on the function and `VITE_API_BASE_URL` on the site both matter — get
either wrong and the browser refuses every answer the API gives.

---

## How a deploy happens

**Push to `main`.** Appwrite builds the site and the function and publishes them.
There is no deploy workflow in GitHub Actions and deliberately so: `ci.yml` gates the
code (lint, typecheck, tests, build) and Appwrite publishes it, so the two concerns
stay separate and a red CI run does not also mean a broken site.

A build takes a few minutes. **Appwrite console → the site → Deployments** shows each
one with the commit it came from, which is the first thing to check when a change
seems not to have arrived.

### What a deploy does not include

- **Firestore rules and indexes**, if the club uses Firestore. Pushed deliberately
  with `npm run rules:push`. Rules go first, so a page expecting new rules never
  reaches members before the rules exist.
- **The Appwrite schema**, if the club uses Appwrite. Created with
  `npm run appwrite:provision -- --write`, which is safe to re-run — anything already
  present is left alone. See [10-appwrite.md](10-appwrite.md).
- **Backups.** See below.

---

## Verifying a release

1. `GET https://<site>/api/v1/health` → `status: "ok"`, and the `version` you expect.
2. `GET https://<site>/api/v1/health/ready` → `status: "ready"` with the store you
   intended (`appwrite` or `firestore`). **`"store":"memory"` means the deploy has no
   database and is showing sample data** — expected before the club connects one, a
   fault afterwards.
3. Confirm the API answers JSON, not HTML. HTML means the request reached the site
   instead of the function — `VITE_API_BASE_URL` pointing at the wrong place — and it
   is the one failure that makes every other check misleading.
4. Sign in as an officer; confirm the amber **Sample data** bar is *absent*.
5. Record an entry and try to approve it yourself — it must be refused. Then approve
   as a second officer and confirm the figures move.
6. **Reports → Download PDF** opens a real PDF. Binary responses from a function need
   base64 encoding, so this is where that goes wrong and nothing else looks broken.
7. Load the site, confirm the install prompt appears, install it, and confirm the
   installed app opens offline.
8. Check response headers: `index.html` and `sw.js` uncached, `/assets/*` immutable.

The Appwrite side of this — provisioning, variables, domains — is in
[10-appwrite.md](10-appwrite.md).

---

## Rollback

**Appwrite console → the site → Deployments → the previous successful one →
Activate.** It is quick and does not rebuild, because every deployment's output is
kept. The same applies to the function.

Two things do not roll back with it, and both are reasons schema changes should ship
separately from feature code:

- **Firestore rules** — redeploy the previous revision from git with
  `npm run rules:push`. There is no one-command rules rollback.
- **Appwrite schema** — the provisioning script only adds. Removing a column is a
  deliberate manual act in the console.

A rollback also does not undo data written by the version being rolled back. For the
ledger that is correct: entries are records, not state to be reverted.

---

## Backups

Neither Appwrite's free plan nor Firestore backs itself up.

- **Appwrite:** `npm run backup`, and `bash scripts/backup-to-drive.sh` to put copies
  in Google Drive on a schedule. Full detail, including why passwords are excluded and
  how to verify a dump, is in [10-appwrite.md § Backups](10-appwrite.md#backups).
- **Firestore:** schedule exports to a Cloud Storage bucket with a retention policy,
  e.g. `gcloud firestore export gs://<project>-backups --async`.

**Check every backup you take.** `npm run restore -- --file …` without `--write`
validates a dump and reports what it would do, in seconds. An untested backup is a
guess, and a club's membership and payment history is not reconstructible from
anywhere else.
