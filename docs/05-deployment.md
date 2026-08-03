# Deployment

> **Superseded — read [09-netlify.md](09-netlify.md) instead.**
>
> This document describes a Firebase Hosting + Cloud Run topology that is no longer
> configured in the repository. It required the Blaze plan to host the API, was
> never successfully deployed, and its `deploy.yml` workflow has been removed. The
> live deployment path is Netlify: the PWA on its CDN, the same Express app as a
> Netlify Function, on the free tier.
>
> Kept because the operational sections below — deploy order, verifying a release,
> rollback, backups — still describe what the club should do, and because Firestore,
> Auth and the security rules are unchanged by the change of host.

## Topology

| Component | Runs on | Notes |
| --- | --- | --- |
| PWA (`frontend/dist`) | Firebase Hosting | Global CDN, SPA rewrite, cache headers already set in `firebase.json` |
| API (`backend/`) | Cloud Run (recommended) or 2nd-gen Cloud Functions | Reached via a Hosting rewrite, so the browser sees one origin |
| Data | Firestore (`asia-south1`) | Rules in `firebase/firestore.rules` |
| Files | Cloud Storage | Rules in `firebase/storage.rules` |
| Auth | Firebase Authentication | Roles as custom claims |

**The Blaze (pay-as-you-go) plan is required** for Cloud Run or Cloud Functions,
and for outbound email. Hosting, Firestore and Storage alone work on Spark, but
the API does not — worth knowing before committing to a launch date. For a club
of this size the expected cost is small, but set a **budget alert** on the
project as the first act after upgrading.

## Serving the API on the same origin

Once the API is deployed, add its rewrite to the `hosting` block in
`firebase.json`, **before** the SPA catch-all (order matters — the first match
wins):

```jsonc
"rewrites": [
  { "source": "/api/**", "run": { "serviceId": "milani-api", "region": "asia-south1" } },
  { "source": "**", "destination": "/index.html" }
]
```

For a 2nd-generation Cloud Function use `{ "function": "api", "region": "asia-south1" }`
instead. This is left out of `firebase.json` today because a rewrite to a service
that does not exist yet returns errors to real visitors.

With the rewrite in place, `VITE_API_BASE_URL=/api/v1` needs no change and CORS
is not exercised in production at all — the allowlist stays as defence in depth.

## Deploy order

Always in this order. Rules that lag behind the code they protect are an open door:

1. `firebase deploy --only firestore:indexes` — indexes take time to build
2. `firebase deploy --only firestore:rules,storage`
3. Deploy the API (Cloud Run / Functions)
4. `firebase deploy --only hosting`

## Manual deploy

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only hosting
```

## Automated deploy

There is no longer a deployment workflow in GitHub Actions. `deploy.yml` deployed
to Firebase Hosting, needed a service account secret that was never configured, and
failed on every run; it has been removed.

**Netlify deploys on push to `main` instead**, building both the site and the API
function — see [09-netlify.md](09-netlify.md). Actions now runs only `ci.yml`
(lint, typecheck, tests, a placeholder build), which gates the code rather than
publishing it.

Rules and indexes are not part of that deploy and are still pushed deliberately,
with `npm run rules:deploy`. That is the one step where the order matters: rules
first, so a page expecting new rules never reaches members before the rules exist.

## Verifying a release

1. `GET https://<site>/api/v1/health` → `status: "ok"`, expected `version`.
2. `GET https://<site>/api/v1/health/ready` → `status: "ready"`.
3. Load the site, confirm the install prompt appears, install it, and confirm the
   installed app opens offline (shell only, until Phase 14).
4. Confirm `/api/v1/health` is **not** answered by the SPA shell — a
   navigate-fallback misconfiguration shows up exactly here.
5. Check Hosting response headers: `index.html` and `sw.js` uncached,
   `/assets/*` immutable.
6. Rules: attempt an unauthenticated read in the console's rules playground; it
   must be denied.

## Rollback

```bash
firebase hosting:releases:list
firebase hosting:rollback              # previous release, instantly
```

Rules must be rolled back by redeploying the previous revision from git — there is
no one-command rules rollback, which is another reason rules changes ship
separately from feature code.

## Backups

Firestore does not back itself up. Before launch, schedule daily exports to a
Cloud Storage bucket with a retention policy:

```bash
gcloud firestore export gs://<project>-backups --async
```

A club's membership and payment history is not reconstructible from anywhere else.
Test a restore into a scratch project at least once, before it matters.
