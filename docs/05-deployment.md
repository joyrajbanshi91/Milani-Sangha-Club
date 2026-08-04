# Deployment — operating a release

**Setting Netlify up is [09-netlify.md](09-netlify.md).** This document is the other
half: what to do around a release once it is set up — how a deploy happens, how to
verify one, how to undo one, and what is *not* covered by it.

An earlier version of this file described a Firebase Hosting + Cloud Run topology. It
required the Blaze plan for the API, was never successfully deployed, and is no longer
configured anywhere in the repository. It has been replaced rather than annotated,
because a superseded page that still reads like instructions is worse than no page.

---

## Topology

| Component | Runs on | Notes |
| --- | --- | --- |
| PWA (`frontend/dist`) | Netlify CDN | SPA fallback and cache headers in `netlify.toml` |
| API (`backend/`) | Netlify Function (`netlify/functions/api.mts`) | Same origin as the site, so CORS is never exercised |
| Ledger | Appwrite Databases, or Firestore, or the embedded demo | Chosen by which credentials exist — `container.ts` |
| Sign-in | Appwrite Authentication, or demo accounts | Chosen the same way — `authService.ts` |

There is one deployment target. Nothing else needs to be deployed for the site to
work, which is the main practical difference from the arrangement this replaced.

---

## How a deploy happens

**Push to `main`.** Netlify builds both workspaces and publishes. There is no deploy
workflow in GitHub Actions and deliberately so: `ci.yml` gates the code (lint,
typecheck, tests, build) and Netlify publishes it, so the two concerns stay separate
and a red CI run does not also mean a broken site.

Branch pushes and pull requests get **deploy previews** on their own URLs — the
sensible way to look at a content change before it is on the club's address.

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
3. Confirm `/api/v1/health` is **not** answered by the SPA shell. HTML here means the
   `/api/*` redirect is wrong, and it is the one failure that makes every other check
   misleading.
4. Sign in as an officer; confirm the amber **Sample data** bar is *absent*.
5. Record an entry and try to approve it yourself — it must be refused. Then approve
   as a second officer and confirm the figures move.
6. **Reports → Download PDF** opens a real PDF. Binary responses from a function need
   base64 encoding, so this is where that goes wrong and nothing else looks broken.
7. Load the site, confirm the install prompt appears, install it, and confirm the
   installed app opens offline.
8. Check response headers: `index.html` and `sw.js` uncached, `/assets/*` immutable.

The full first-deploy table is in [09-netlify.md § 3](09-netlify.md#3-check-the-deploy-in-this-order).

---

## Rollback

**Deploys → pick the previous successful deploy → Publish deploy.** It is instant and
does not rebuild, because Netlify keeps every deploy's output.

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
