# Local setup

## 1. Install the toolchain

**Node.js 22 LTS or newer is required.** Avoid Node 20 — its maintenance window
ended in April 2026, so it no longer receives security patches (current status:
<https://nodejs.org/en/about/previous-releases>). This project was verified on
**Node 24**, which `.nvmrc` pins.

Install it one of these ways:

- Download the macOS **arm64** `.pkg` installer from
  <https://nodejs.org/en/download> and run it — simplest, no prerequisites; or
- use a version manager, which respects the `.nvmrc` in this repository:

  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew install node@24
  ```

Open a **new** terminal afterwards so the PATH change takes effect, then verify:

```bash
node --version    # v24.x (v22.x also fine)
npm --version     # 10.x or newer
```

**No global CLIs are needed.** Nothing else has to be installed to run the app, to
test it, or to deploy it — Appwrite builds from a push, and `firebase-tools` is
invoked through `npx` by the scripts that use it:

```bash
npm run firebase -- --version     # nothing installed globally
```

The Firebase CLI is only relevant at all if the club chooses Firestore over Appwrite
as its database.

## 2. Install project dependencies

```bash
cd /Users/joy/Documents/Milani_Sangha_Club
npm run install:all
```

This installs `frontend/` and `backend/` separately — they are independent
packages, not a workspace, so that the backend's `node_modules` can be shipped
as-is to Cloud Functions.

Both `package-lock.json` files are committed, and CI installs with `npm ci`, so
every build resolves exactly the versions verified here.

## 3. Create a Firebase project

**Steps 3 to 5 are only needed from Phase 3 (authentication) onwards.** To simply
run and browse the app, skip to step 6 — the placeholder values already in
`frontend/.env.local` are sufficient, because nothing in Phase 1 calls Firebase.

In the [Firebase console](https://console.firebase.google.com):

1. Create a project (suggested id: `milani-sangha-club`).
2. **Build → Authentication → Get started.** Enable *Email/Password*. Phone
   sign-in is enabled in Phase 3 if mobile login is wanted.
3. **Build → Firestore Database → Create database.** Start in *production mode*
   (the rules in this repository are the authority). Choose the
   `asia-south1` (Mumbai) region for lowest latency to Indian members —
   **this cannot be changed later**.
4. **Build → Storage → Get started.** Same region.
5. **Project settings → General → Your apps → Web app.** Register an app and
   copy the config values.

Then point the CLI at it:

```bash
firebase use --add        # select the project, alias it "default"
```

## 4. Configure the environment

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Fill both in — every key is documented in
[03-environment-variables.md](03-environment-variables.md).

For the backend you also need a service account key:
**Project settings → Service accounts → Generate new private key.** Save the
JSON **outside this repository** (for example `~/.config/milani/service-account.json`)
and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. It grants full
access to your project's data — treat it like the club's bank password.

## 5. Deploy the security rules once

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

The current rules deny all client access, which is correct for Phase 1.

## 6. Run it

```bash
npm run dev
```

- Web app: <http://localhost:5173>
- API health: <http://localhost:5055/api/v1/health>
- API readiness (checks Firestore): <http://localhost:5055/api/v1/health/ready>

`/api` requests from the web app are proxied to the API by the Vite dev server,
so the browser sees a single origin in development just as it will in production.

## Working against the emulator suite

Preferred once real data exists — it costs nothing and cannot corrupt production:

```bash
npm run emulators                      # Auth 9099 · Firestore 8080 · Storage 9199 · UI 4000
```

Then set `VITE_USE_FIREBASE_EMULATORS=true` in `frontend/.env.local`, and
uncomment the `*_EMULATOR_HOST` lines in `backend/.env`.

## Everyday commands

```bash
npm run dev              # both servers
npm run dev:web          # frontend only
npm run dev:api          # backend only
npm run lint             # ESLint, both apps
npm run typecheck        # TypeScript, both apps
npm test                 # Vitest, both apps
npm run build            # production build of both
npm run verify           # constants check + lint + typecheck + test + build
npm run check:constants  # shared domain constants drift check
npm run icons            # regenerate placeholder PWA icons
```

## Troubleshooting

**"The application could not start" with a list of variables.**
`frontend/.env.local` is missing keys. The message names each one. Restart the
dev server after editing — Vite reads env files at startup.

**API starts with a warning about Firebase credentials.**
Expected until step 4 is done. The health route still answers; anything touching
Firestore will fail with a message naming the missing variables.

**`/api/v1/health/ready` returns 503 `unreachable`.**
The credentials are present but wrong, or the Firestore database has not been
created in the console, or the service account lacks Firestore access.

**Port already in use.**
Change `PORT` in `backend/.env` and `DEV_API_PROXY` in
`frontend/.env.local` to match.

**Anything on port 5000 returns `403` with an empty body.**
That is not this API. macOS reserves 5000 for the AirPlay Receiver
(`ControlCenter`), which is why the API listens on **5055**. Confirm with
`lsof -nP -iTCP:5000 -sTCP:LISTEN`. You can free the port under
System Settings → General → AirDrop & Handoff → AirPlay Receiver, but changing
our port is the safer fix and is already done.

**`npm run dev` exits with `wait: -n: invalid option`.**
An old copy of `scripts/dev.sh`. macOS ships bash 3.2, which has no `wait -n`;
the current script polls instead. Re-pull the file.

**Service worker serving stale code.**
Development runs with the service worker disabled. If you enabled
`devOptions` in `vite.config.ts`, clear it in DevTools →
Application → Service workers → Unregister.
