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

---

## Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 19, Vite 8, TypeScript 6, Tailwind CSS v4, React Router v8   |
| Data layer | TanStack Query, React Hook Form + Zod                             |
| Backend    | Node.js, Express, TypeScript, Firebase Admin SDK                  |
| Database   | Firebase Firestore                                                |
| Auth       | Firebase Authentication                                           |
| Files      | Firebase Storage                                                  |
| Hosting    | Firebase Hosting (PWA) + Cloud Functions / Cloud Run (API)        |
| Documents  | pdf-lib (receipts, membership cards), ExcelJS (reports)           |
| Email      | Nodemailer                                                        |
| Charts     | Recharts · Icons: Lucide                                          |
| CI/CD      | GitHub Actions                                                    |

---

## Repository layout

```
.
├── frontend/          React + Vite PWA (public site, member portal, admin portal)
├── backend/           Express REST API (privileged operations, PDFs, email)
├── firebase/          Firestore & Storage security rules, composite indexes
├── docs/              Architecture, setup, environment and phase documentation
├── scripts/           Developer utilities (dev runner, icon generation)
├── firebase.json      Firebase CLI configuration (hosting, rules, emulators)
└── package.json       Root task runner (no dependencies of its own)
```

---

## Prerequisites

- **Node.js 22 LTS or newer** and npm 10+ (developed and verified on Node 24).
- **Firebase CLI** — `npm install -g firebase-tools`. Needed only to deploy or to
  run the emulator suite, not to run the app locally.
- A Firebase project with Firestore, Authentication, Storage and Hosting enabled —
  needed from Phase 3 (authentication) onwards.

## Quick start

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Create local environment files from the templates
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
#    …then fill in your Firebase values (see docs/03-environment-variables.md)

# 3. Run frontend + backend together
npm run dev
```

- Frontend: <http://localhost:5173>
- API health check: <http://localhost:5055/api/v1/health>

The API listens on **5055**, not 5000: macOS reserves port 5000 for the AirPlay
Receiver in Control Centre, which answers with an unhelpful `403`.

## Common tasks

| Command              | Description                                     |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Run frontend and backend concurrently           |
| `npm run dev:web`    | Frontend only                                   |
| `npm run dev:api`    | Backend only                                    |
| `npm run build`      | Type-check and build both apps                  |
| `npm run typecheck`  | TypeScript check, no emit                       |
| `npm run lint`       | ESLint across both apps                         |
| `npm run format`     | Prettier write                                  |
| `npm test`           | Unit tests (Vitest) for both apps               |
| `npm run emulators`  | Firebase emulator suite                         |
| `npm run user -- list` | Club accounts and their roles (needs Firebase) |
| `npm run seed:finance` | Load funds and categories from CSV (needs Firebase) |

---

## Documentation

- [Project overview](docs/00-project-overview.md)
- [Architecture](docs/01-architecture.md)
- [Local setup](docs/02-local-setup.md)
- [Environment variables](docs/03-environment-variables.md)
- [Development phases](docs/04-development-phases.md)
- [Deployment](docs/05-deployment.md)
- **[Editing the website](docs/06-editing-the-website.md)** — how to change each section
- **[Member area and club finances](docs/07-member-and-finance-area.md)** — the two-person rule, statements
- **[Running it for real](docs/08-going-live.md)** — Firebase project, real sign-in, creating officers
- **[Publishing to Netlify](docs/09-netlify.md)** — the whole app online, free, via GitHub

## Licence

Proprietary — internal to Milani Sangha Club. All rights reserved.
