# Publishing to Netlify

Netlify hosts **the whole application** — the website *and* the API — on its free
plan. One origin, so a member's browser never makes a cross-origin request and CORS
is never exercised.

**A first deploy needs no environment variables and no database.** Connect the
repository, and the site comes up: all eleven public pages real and complete, and the
member and finance areas working against a built-in sample ledger. Connecting a real
database is [step 5](#5-optional-connect-a-real-database), done later, in the
dashboard, without touching the code.

That is a deliberate change. An earlier arrangement required six variables to be
entered correctly before anything worked at all, and when one was wrong the only
symptom was `500` from every route — including the health endpoint whose job is to
explain the problem. Nothing in this repository can now turn a missing variable into
a site that will not start.

---

## How it fits together

```
  browser ──► https://your-site.netlify.app
                      │
                      ├── /                    frontend/dist        (static, on the CDN)
                      ├── /login, /portal …    index.html           (SPA fallback)
                      └── /api/**  ──► netlify/functions/api.mts    (the Express app)
                                                    │
                                    ┌───────────────┴───────────────┐
                                    │                               │
                          no credentials set              credentials set
                          embedded demo ledger           Appwrite or Firestore
                          (sample data, not kept)        (the club's real ledger)
```

`netlify.toml` holds the build command, the redirects and the cache headers.
`netlify/functions/api.mts` wraps `createApp()` with `serverless-http`, unchanged
from the app that runs locally and that the backend's 151 tests exercise.

---

## 1. Put the repository on GitHub

```bash
git remote add origin https://github.com/<you>/milani-sangha-club.git
git branch -M main
git push -u origin main
```

**A private repository is the sensible default** for a club's system.

`.env`, `.env.local`, service account keys and `backups/` are all git-ignored. To
confirm nothing sensitive is staged before your first push:

```bash
git ls-files | grep -E '\.env$|\.env\.local|serviceAccount|service-account|\.pem$|\.key$'
```

That should print nothing. (`.env.example` files are safe and *should* be committed —
they are templates with no values.)

---

## 2. Connect Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new project → Import an
   existing project** → GitHub → pick the repository.
2. Netlify reads `netlify.toml`, so **leave the build settings alone.** It already
   specifies the build command, the publish directory and the functions directory.
   Anything typed into those dashboard fields *overrides* the file, which is a
   common way to end up with a broken build that looks correctly configured.
3. **Deploy.** There is nothing to configure first.

The Node version comes from `.nvmrc` (24). Netlify gives `.nvmrc` in the base
directory the highest precedence of all the ways of choosing a version, above both
the `NODE_VERSION` variable and the dashboard setting, which is why `netlify.toml`
does not also name a version — two copies of a version number drift.

---

## 3. Check the deploy, in this order

On the live URL:

| Check | Expected |
| --- | --- |
| `/` | The home page, with the club's real content |
| `/api/v1/health` | `{"status":"ok"…}` — **JSON, not HTML** |
| `/api/v1/health/ready` | `503` with `"store":"memory"` — correct at this stage, see below |
| `/login` | The demo account picker, listing four fixed accounts |
| Sign in as the treasurer | Lands on `/office`; an amber **Sample data** bar across the top; figures load |
| Record an entry, try to approve it yourself | Refused — the two-person rule |
| Approve as the secretary | Posts; the figures move |
| **Reports → Download PDF** | A real PDF opens |

**HTML from `/api/v1/health` means the redirect is wrong,** not the function. The
`/api/*` rule in `netlify.toml` must come before the SPA catch-all, because the first
matching rule wins — a catch-all above it answers every API call with `index.html`.

**The PDF is worth checking specifically.** A function response carries a text body,
so anything that is not text has to be base64-encoded and flagged; that is what the
`binary` option in `netlify/functions/api.mts` does. A download that will not open is
the symptom of that being wrong, and nothing else looks broken when it is.

`/api/v1/health/ready` answering `503` here is correct and not a fault. The API is
*running* — `/api/v1/health` is the liveness check and answers `200` — but "ready"
means ready to hold the club's accounts, and memory is not. It becomes
`{"status":"ready","checks":{"database":"ok","store":"appwrite"}}` after step 5.

---

## 4. What "sample data" means

With no database configured, the API serves the demo ledger embedded in
`backend/src/services/demoSeed.ts` and offers demo sign-in: four fixed accounts
(president, secretary, treasurer, member) with **no passwords**.

This is safe to leave running while the club reviews the site, because there is no
real data behind it and nothing to guess a password for. Two things make it
impossible to mistake for the real thing:

- Every signed-in page carries an amber **Sample data** bar. It cannot be
  dismissed — a treasurer who dismissed it in the morning and recorded twenty
  entries in the afternoon would have lost twenty entries.
- `/api/v1/health/ready` reports `503` with the variables to set.

Entries recorded in this state survive only until the function goes cold, which on a
quiet site is a matter of minutes.

**Do not collect real membership fees or member details in this state.**

---

## 5. Optional: connect a real database

Both backing stores are supported. **Appwrite** is the one the application is built
around most completely — sign-in, roles, the ledger and profiles all have Appwrite
implementations, and its free plan needs no card. Firestore works equally well if the
club already has a Firebase project.

Set these under **Project configuration → Environment variables**, then redeploy.
(Netlify renamed "sites" to "projects", so older guides say *Site configuration*.)

Or set them from the command line, which avoids getting a scope wrong by clicking —
`--scope` is the flag that matters, and `--secret` on the API key means it cannot be
read back afterwards:

```bash
npx netlify-cli login && npx netlify-cli link
npx netlify-cli env:set APPWRITE_ENDPOINT "https://<region>.cloud.appwrite.io/v1" --scope functions
npx netlify-cli env:set VITE_APPWRITE_PROJECT_ID "<project id>" --scope builds
```
Secrets belong there and never in `netlify.toml`, which is committed to the
repository.

### Appwrite

Full setup — creating the project, the database, the tables and the officer
accounts — is [10-appwrite.md](10-appwrite.md). `npm run appwrite:provision` creates
the schema; `npm run appwrite:check` diagnoses a deployment.

| Variable | Scope | Value |
| --- | --- | --- |
| `APPWRITE_ENDPOINT` | Functions | e.g. `https://fra.cloud.appwrite.io/v1` — **region-specific**, copy it from the console |
| `APPWRITE_PROJECT_ID` | Functions | Appwrite console → your project → Settings |
| `APPWRITE_API_KEY` | Functions | A **server** key. Scopes: Databases read/write, Users read/write |
| `APPWRITE_DATABASE_ID` | Functions | `club`, unless you named it otherwise |
| `VITE_APPWRITE_ENDPOINT` | **Builds** | The same endpoint as above |
| `VITE_APPWRITE_PROJECT_ID` | **Builds** | The same project id as above |

`APPWRITE_API_KEY` is a server credential with project-wide reach. It must be scoped
to **Functions only** — never Builds, which would compile it into the browser bundle
where anyone can read it. The two `VITE_` values are the opposite: they are public by
design and must be scoped to Builds to reach the bundle at all.

### Firestore instead

| Variable | Scope | Value |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Functions | From the Firebase console |
| `FIREBASE_CLIENT_EMAIL` | Functions | The `client_email` field of the service account JSON |
| `FIREBASE_PRIVATE_KEY` | Functions | The `private_key` field — see the warning below |

There is no `GOOGLE_APPLICATION_CREDENTIALS`: a function has no filesystem to mount a
key file onto, which is why the three fields are given individually.

**The private key is the fiddly one.** Paste it exactly as it appears in the JSON,
including the literal `\n` sequences and the header:

```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg…\n-----END PRIVATE KEY-----\n
```

Do not let an editor turn those `\n` into real line breaks. The application converts
them back itself. A wrong key shows up as `Failed to parse private key` on
`/api/v1/health/ready` — and the site still *starts*, deliberately, because a bad
credential must not take down the endpoint that reports it.

Firestore also needs the Netlify hostname added under **Firebase console →
Authentication → Settings → Authorised domains**, or sign-in fails in the browser
with `auth/unauthorized-domain` while everything else looks correct.

### Worth setting either way

| Variable | Scope | Value |
| --- | --- | --- |
| `NODE_ENV` | **Functions only** | `production` — see the warning below |
| `TRUST_PROXY` | Functions | `1` — one proxy hop, so rate limiting sees the real client IP |
| `CORS_ORIGINS` | Functions | Your Netlify URL. Same-origin already, so this is defence in depth |
| `APP_BASE_URL` | Functions | The same URL — used in receipts and QR verification links |
| `CLUB_NAME` | Both | The club's name as it should appear on generated PDFs |

> **Scope `NODE_ENV` to Functions, not to Builds.** The variable editor defaults to
> *all* scopes, and with `NODE_ENV=production` in the **build** environment npm omits
> devDependencies — so `tsc` and `vite` are not installed and the build dies at
> `sh: tsc: command not found`, which says nothing about the cause.
>
> `npm run install:all` passes `--include=dev` specifically to survive this, so it
> should not bite. But scoping it correctly costs nothing and the failure is an
> expensive one to diagnose.

### After adding them

**Deploys → Trigger deploy → Clear cache and deploy site.**

A plain retry can reuse the previous bundle. The `VITE_` values are compiled into the
browser bundle at build time, so editing one changes nothing until a build runs after
it exists — this is the single most common reason a variable "did not take effect".

Then re-check `/api/v1/health/ready`: it should report `ready`, the **Sample data**
bar should be gone, and `/login` should show an **email and password form** instead of
the demo account picker. Still seeing the picker means the credentials reached the
build but not the function — check the variable's scope.

---

## Two things about the environment variable editor

Both default to something wider than you need, and a variable that exists but is out
of scope behaves *exactly* like one that was never set:

- **Scopes.** Netlify's four are Builds, Functions, Runtime and Post processing. As
  above: `VITE_*` needs Builds, everything else needs Functions, and the API key must
  not have Builds.
- **Deploy contexts.** Use **All deploy contexts** unless production is deliberately
  meant to differ. Set for production only, every branch deploy and deploy preview
  builds a site that behaves differently from the one you tested.

---

## Free plan limits

Netlify's free plan currently allows 100 GB bandwidth, 300 build minutes, 125,000
function invocations and 1 million edge function invocations a month, with
notifications at 50%, 75%, 90% and 100% of each. A site that exceeds a limit is
suspended for the rest of that calendar month.

For a club of this size none of these is a realistic constraint — but note that
**build minutes**, not traffic, are what a busy month of content edits consumes, since
every push rebuilds both workspaces. Check the current figures before relying on
them; the linked pages are authoritative and this one is not.

---

## Running Netlify's own runtime locally

`netlify.toml`, the redirects and the function bundling can all be exercised before
pushing:

```bash
npm run netlify:dev      # Netlify's dev server: static site + function + redirects
npm run netlify:build    # exactly the build command netlify.toml runs
```

`npm run netlify:dev` is the only way to test the `/api/*` redirect and the function
adapter locally — `npm run dev` uses Vite's proxy instead, which is a different code
path and will not catch a redirect mistake.

---

## Sources

- [Introducing Netlify's Free plan](https://www.netlify.com/blog/introducing-netlify-free-plan/) — plan limits
- [Netlify Docs: Manage dependencies](https://docs.netlify.com/build/configure-builds/manage-dependencies/) — Node version precedence, `.nvmrc`
- [Netlify Docs: Environment variables overview](https://docs.netlify.com/build/environment-variables/overview/) — scopes and deploy contexts
- [Netlify Docs: Functions overview](https://docs.netlify.com/build/functions/overview/)
- [Netlify Docs: Functions usage and billing](https://docs.netlify.com/build/functions/usage-and-billing/)

Netlify changes its dashboard wording and its plan limits from time to time. Open
these and confirm anything above that matters before you rely on it.
