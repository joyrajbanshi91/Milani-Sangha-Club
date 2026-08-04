# Milani Sangha Club — Club Management Platform

A production-oriented Progressive Web App for managing club members, payments, events,
gallery, communications, reports and administration.

Full requirements: [Club_Management_Platform_SRS.md](Club_Management_Platform_SRS.md)

> **Build status:** Project setup, public website, and the member/finance area
> complete. Membership records, payments and receipts still need six club decisions.
> See [docs/04-development-phases.md](docs/04-development-phases.md).
>
> **To change what the website says, edit one file:**
> [frontend/src/content/site.ts](frontend/src/content/site.ts) — guided
> walkthrough in [docs/06-editing-the-website.md](docs/06-editing-the-website.md).
>
> **To put it online:** [docs/09-netlify.md](docs/09-netlify.md). Connect the
> repository to Netlify and push — there is nothing to configure and no database
> needed for a first deploy.

---

## Stack

| Layer      | Technology                                                          |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | React 19, Vite 8, TypeScript 6, Tailwind CSS v4, React Router v8     |
| Data layer | TanStack Query, React Hook Form + Zod                               |
| Backend    | Node.js, Express 5, TypeScript                                      |
| Hosting    | **Netlify** — static PWA + the Express API as a Netlify Function     |
| Database   | Appwrite Databases (recommended) · Firestore (alternative) · embedded demo ledger when neither is configured |
| Auth       | Appwrite Authentication, roles as account labels · demo accounts when unconfigured |
| Documents  | pdf-lib (receipts, membership cards), ExcelJS (reports)              |
| Email      | Nodemailer                                                          |
| Charts     | Recharts · Icons: Lucide                                            |
| CI         | GitHub Actions — lint, typecheck, tests, build, function smoke test  |

**Nothing in the Database or Auth row is required to run or deploy.** With no
credentials the API serves a sample ledger and demo sign-in, and says so on every
signed-in page. Connecting a real database is a dashboard step taken later.

---

## Repository layout

```
.
├── frontend/            React + Vite PWA (public site, member portal, officer area)
├── backend/             Express REST API (privileged operations, PDFs, email)
├── netlify/functions/   The API as a Netlify Function (the only deploy target)
├── firebase/            Firestore & Storage rules — used only if the club picks Firestore
├── data/                Chart-of-accounts templates and the demo ledger
├── docs/                Architecture, setup, deployment and phase documentation
├── scripts/             Developer utilities (dev runner, icons, function smoke test)
├── netlify.toml         The deployment configuration
└── package.json         Root task runner
```

---

## Prerequisites

- **Node.js 22 LTS or newer** and npm 10+ (developed and verified on Node 24; the
  version is pinned for hosted builds in `.nvmrc`).

That is the whole list. No global CLIs are needed — `firebase-tools` and
`netlify-cli` are both invoked through `npx` by the scripts that use them, and
neither is needed to run the app or to deploy it.

## Quick start

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Run frontend + backend together
npm run dev
```

No environment files are needed. Both apps run with none, and the officer area works
against the demo ledger — sign in at <http://localhost:5173/login> as
`treasurer@demo.club` (no password; the four demo accounts are listed on the page).

To point a local machine at a real database, copy the templates and fill in the block
you need:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
# see docs/03-environment-variables.md, and docs/10-appwrite.md for Appwrite setup
```

- Frontend: <http://localhost:5173>
- API health check: <http://localhost:5055/api/v1/health>

The API listens on **5055**, not 5000: macOS reserves port 5000 for the AirPlay
Receiver in Control Centre, which answers with an unhelpful `403`.

## Common tasks

| Command                   | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `npm run dev`             | Run frontend and backend concurrently                              |
| `npm run dev:web`         | Frontend only                                                      |
| `npm run dev:api`         | Backend only                                                       |
| `npm run build`           | Type-check and build both apps                                     |
| `npm run typecheck`       | TypeScript check, no emit                                          |
| `npm run lint`            | ESLint across both apps                                            |
| `npm run format`          | Prettier write                                                     |
| `npm test`                | Unit tests (Vitest) for both apps                                  |
| `npm run test:function`   | Invoke the API as a Netlify Function, with nothing configured       |
| `npm run verify`          | Everything above, in the order CI runs it                          |
| `npm run netlify:dev`     | Netlify's own runtime — the only way to test the `/api/*` redirect  |
| `npm run netlify:build`   | Exactly the build command `netlify.toml` runs                      |
| `npm run appwrite:provision` | Create the Appwrite database, tables and indexes                |
| `npm run appwrite:check`  | Diagnose an Appwrite deployment                                    |
| `npm run backup`          | Export the ledger and accounts to `backups/`                       |
| `npm run user -- list`    | Club accounts and their roles (needs a real database)              |
| `npm run seed:finance`    | Load funds and categories from CSV (needs a real database)         |

---

## Documentation

- [Project overview](docs/00-project-overview.md)
- [Architecture](docs/01-architecture.md)
- [Local setup](docs/02-local-setup.md)
- [Environment variables](docs/03-environment-variables.md)
- [Development phases](docs/04-development-phases.md)
- **[Publishing to Netlify](docs/09-netlify.md)** — **start here to put it online.** Free, via GitHub, no configuration
- [Operating a release](docs/05-deployment.md) — verifying a deploy, rollback, backups
- **[Editing the website](docs/06-editing-the-website.md)** — how to change each section
- **[Member area and club finances](docs/07-member-and-finance-area.md)** — the two-person rule, statements
- **[Running it for real](docs/08-going-live.md)** — real sign-in, creating officers
- [Appwrite — the database and sign-in](docs/10-appwrite.md) — optional; connect a real ledger

## Licence

Proprietary — internal to Milani Sangha Club. All rights reserved.
