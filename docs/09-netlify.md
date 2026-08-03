# Publishing to Netlify through GitHub

Netlify hosts **the whole application** — the website *and* the API — on its free
tier, so member sign-in works from any device with no Blaze plan and no card.

That is the difference from Firebase Hosting, which serves static files only and
therefore needs Cloud Functions (and so Blaze) for the API.

Everything in this guide has been tested locally through Netlify's own runtime
(`netlify dev`), which is what actually runs the function in production.

---

## How it fits together

```
  browser ──► https://your-site.netlify.app
                      │
                      ├── /                    frontend/dist        (static)
                      ├── /login, /portal …    index.html           (SPA fallback)
                      └── /api/**  ──► netlify/functions/api.mts    (the Express app)
                                                    │
                                                    └──► Firestore + Firebase Auth
```

One origin, so CORS is never exercised. `netlify.toml` holds the redirects and the
cache headers; `netlify/functions/api.mts` wraps `createApp()` with
`serverless-http`, unchanged from the app that runs locally.

---

## 1. Put the repository on GitHub

```bash
git remote add origin https://github.com/<you>/milani-sangha-club.git
git branch -M main
git push -u origin main
```

**Check what you are publishing first.** The repository is clean —
`.env`, `.env.local` and the service account key are all git-ignored, and there is
a scan in the section below. A **private** repository is still the sensible default
for a club's system.

---

## 2. Connect Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing
   project** → GitHub → pick the repository.
2. Netlify reads `netlify.toml`, so **leave the build settings alone**. It already
   specifies the build command, the publish directory and the functions directory.
3. Do **not** deploy yet — add the environment variables first, or the first build
   will produce a site whose API cannot reach Firebase.

---

## 3. Environment variables

**Site configuration → Environment variables.** These are secrets: they belong here,
never in a file in the repository.

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `club-app-8ce22` |
| `FIREBASE_CLIENT_EMAIL` | from the service account JSON, the `client_email` field |
| `FIREBASE_PRIVATE_KEY` | from the same file, the `private_key` field — **see below** |
| `CLUB_NAME` | `New Milani Sangha Club` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGINS` | your Netlify URL, e.g. `https://your-site.netlify.app` |
| `APP_BASE_URL` | the same URL |
| `VITE_FIREBASE_API_KEY` | from `frontend/.env.local` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `club-app-8ce22.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `club-app-8ce22` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `club-app-8ce22.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `5690789841` |
| `VITE_FIREBASE_APP_ID` | `1:5690789841:web:e61dc9e50c74fe1ae5daf0` |

There is no `GOOGLE_APPLICATION_CREDENTIALS`: a function has no filesystem to mount
a key file onto, which is why the three `FIREBASE_*` fields are used instead.

### The private key is the fiddly one

Copy the `private_key` value from the JSON **exactly as it appears there**, including
the literal `\n` sequences and the `-----BEGIN PRIVATE KEY-----` header:

```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg…\n-----END PRIVATE KEY-----\n
```

Do not let an editor turn those `\n` into real line breaks. The application converts
them back itself. If this is wrong you get
`Failed to parse private key` on `/api/v1/health/ready` — and note the site still
*starts*, because a bad key must not take the whole service down.

### The `VITE_` ones are build-time

Those are compiled into the browser bundle, so **changing one needs a redeploy**, not
just a restart. They are public by design.

---

## 4. Deploy, then check it in this order

**Deploys → Trigger deploy.** Then, on the live URL:

| Check | Expected |
| --- | --- |
| `/api/v1/health` | `{"status":"ok"…}` — **JSON, not HTML.** HTML means the redirect is wrong |
| `/api/v1/health/ready` | `{"status":"ready","checks":{"firestore":"ok"}}` |
| `/login` | An **email and password form**. The demo account picker means the credentials did not reach the function |
| Sign in as the treasurer | Lands on `/office`, figures load |
| Record an entry, try to approve it yourself | Refused, 409 |
| Approve as the secretary | Posts; the figures move |
| **Reports → Download PDF** | A real PDF opens |

The PDF is worth checking specifically: function responses carry a text body, so
binary content has to be base64-encoded. That is what the `binary` option in
`netlify/functions/api.mts` does, and a mangled download is the symptom of it being
wrong.

---

## 5. Add the Netlify URL to Firebase

**Firebase console → Authentication → Settings → Authorised domains** → add your
Netlify hostname. Without it, sign-in fails in the browser with
`auth/unauthorized-domain` even though everything else is correct.

---

## Testing it locally before you push

```bash
npm run netlify:dev
```

Runs the real function runtime and the redirects on <http://localhost:8899>, using
`backend/.env` for credentials. This is how the configuration in this repository was
verified, and it catches things a plain `npm run dev` cannot — bundling problems,
the binary-response handling, and the redirect path.

Build the backend first (`npm run build:api`), because the function imports
`backend/dist`.

---

## Things that went wrong while setting this up

Recorded because each one is a plausible failure for anyone repeating it:

**`unable to determine transport target for "pino-pretty"` — every request 500.**
The logger loaded pino-pretty as a worker thread by module name, which cannot be
resolved inside a bundled function, and it is a devDependency that would not be
installed anyway. Fixed: pretty output is now skipped whenever the code is running
as a function, where single-line JSON is what the log viewer wants.

**`Cannot find module 'firebase-admin/app'`.**
`firebase-admin` is deliberately excluded from the esbuild bundle — dynamic requires
and optional native dependencies make it a poor bundling candidate — so it has to be
resolvable at runtime from the function's own tree. It is therefore declared in the
**root** `package.json` as well as the backend's.

**The PDF downloaded as 500 or as corrupt bytes.**
Binary responses need base64 encoding, configured through `binary` in the function.
The Netlify CLI also crashed on the first attempt (`Cannot set headers after they
are sent`, inside its own proxy) — a CLI bug, not the function.

**A cancelled entry made the balance go *up*.**
Found by reversing a test entry against the real database: ₹62,000 became ₹63,250.75
after cancelling a ₹1,250.75 expense. Marking the original `reversed` removed it from
the balance *and* the reversal posted, applying the correction twice. Fixed in
`domain/ledger.ts`, with two regression tests. Worth knowing that this was only
caught by exercising it end to end — the arithmetic tests all passed.

---

## Netlify or Firebase Hosting?

Both configurations are in the repository and neither excludes the other.

| | Netlify | Firebase Hosting |
| --- | --- | --- |
| Website | free | free |
| The API | **free** (Functions) | needs **Blaze** |
| Cold start | a second or two after idle | similar |
| Deploys on git push | yes, by default | needs a GitHub Action |
| Firestore and Auth | still Firebase either way | same |

Netlify is the pragmatic choice while the club is not paying for anything. If it
later moves to Blaze, `firebase.json` is already set up for the function and the
`/api` rewrite, and the same code deploys with no changes.
