# Publishing to Netlify — no longer the deployment path

> **The application is deployed on Appwrite.** Site, API function, database and
> sign-in all live in one Appwrite project — see
> [10-appwrite.md § Hosting](10-appwrite.md#hosting-the-site-and-the-api). The Netlify
> project was deleted, so nothing here is live.
>
> Kept because `netlify.toml` is still in the repository and still correct, and
> because two of the traps below are not Netlify-specific: environment variables that
> only take effect on a new deploy, and the difference between a variable that is
> absent and one that is out of scope. If the club ever wants a second host, this is
> a working recipe.
>
> What made Netlify awkward for this project, for the record: variable *scoping* is a
> paid feature, so a free-plan site grants every variable all four scopes; and new
> sites are private by default, which answered 401 to the site's own API calls and
> looked exactly like the API being down.

---

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

### Do it with one command

Once Appwrite is set up locally and `backend/.env` holds the values
([10-appwrite.md](10-appwrite.md)):

```bash
npx netlify-cli login
npx netlify-cli link            # per directory — a new Netlify project needs this again

npm run netlify:setup           # shows exactly what it would set, changes nothing
npm run netlify:setup -- --write
```

That reads `backend/.env`, sets every variable in the **Functions** scope, and passes
the API key with `--secret` so Netlify stores it write-only. Nothing to retype and no
scope to tick.

### Or by hand

**Project configuration → Environment variables.** (Netlify renamed "sites" to
"projects", so older guides say *Site configuration*.) Secrets belong there and never
in `netlify.toml`, which is committed.

| Variable | Scope | Value |
| --- | --- | --- |
| `APPWRITE_ENDPOINT` | Functions | e.g. `https://fra.cloud.appwrite.io/v1` — **region-specific**, copy it from the console |
| `APPWRITE_PROJECT_ID` | Functions | Appwrite console → your project → Settings |
| `APPWRITE_API_KEY` | Functions | A **server** key. Scopes: Databases read/write, Users read/write |
| `APPWRITE_DATABASE_ID` | Functions | The database id, or `club` if you named it that |

**Four variables, all one scope.** There used to be six across two scopes, and that was
the single biggest source of failed deployments here. Two of them —
`VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID` — were build-time values
compiled into the browser bundle, which meant they had to go in a *different* scope
from the API's own credentials, they were invisible to the running function so nothing
could detect a mismatch, and editing one did nothing until a cache-clearing rebuild.
Set all six and you could still get the demo account picker with no way to tell which
half was wrong.

Neither value was ever a secret, so the API now simply reports them from
`/api/v1/auth/config` and the browser reads them at runtime. **They are no longer used
— you can delete them if a previous attempt left them set.** Nothing about the backing
service is compiled into the bundle any more, which is why nothing here needs the
Builds scope.

`APPWRITE_API_KEY` remains a server credential with project-wide reach. Functions scope
only: Builds scope would compile it into the browser bundle, where anyone can read it.

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
| `CLUB_NAME` | Functions | The club's name as it should appear on generated PDFs |

> **Scope `NODE_ENV` to Functions, not to Builds.** The variable editor defaults to
> *all* scopes, and with `NODE_ENV=production` in the **build** environment npm omits
> devDependencies — so `tsc` and `vite` are not installed and the build dies at
> `sh: tsc: command not found`, which says nothing about the cause.
>
> `npm run install:all` passes `--include=dev` specifically to survive this, so it
> should not bite. But scoping it correctly costs nothing and the failure is an
> expensive one to diagnose.

### After adding them

Environment variables only take effect on a new deploy, so trigger one:

```bash
npx netlify-cli deploy --build --prod
```

or **Deploys → Trigger deploy → Deploy site** in the dashboard. **Clear cache** is no
longer necessary — nothing about the backing service is compiled into the bundle any
more, so there is no stale bundle to discard.

Then confirm it, from the repository rather than by eye:

```bash
API_PROBE_URL=https://<your-site>.netlify.app npm run appwrite:check
```

You want `6 of 6 expected tables exist` and `store "appwrite"`. On the site itself: the
amber **Sample data** bar gone, and `/login` showing an **email and password form**
instead of the demo account picker.

Still seeing the demo picker means the function has no Appwrite credentials — it is
reporting `mode: "demo"`, which is a variable scope or a typo, not a browser problem.
`GET /api/v1/auth/config` on the live site answers this directly: it should say
`"mode":"appwrite"` and carry an `"appwrite"` block with your endpoint and project id.

---

## One thing about the environment variable editor

**Scopes.** Netlify's four are Builds, Functions, Runtime and Post processing, and the
editor defaults to all of them. A variable that exists but is out of scope behaves
*exactly* like one that was never set, with no error anywhere.

Everything this application needs is **Functions**. There is deliberately nothing left
in the Builds scope — see the note in step 5 about why the two `VITE_APPWRITE_*`
variables were removed. The only scope mistake still available to you is putting
`APPWRITE_API_KEY` or `NODE_ENV` in Builds, and `npm run netlify:setup` avoids both.
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
