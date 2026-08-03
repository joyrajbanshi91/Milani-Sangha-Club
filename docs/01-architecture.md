# Architecture

## Shape of the system

```
                 ┌─────────────────────────────────────────┐
                 │  Browser / installed PWA                │
                 │  React 19 · Vite 8 · Tailwind · Router 8 │
                 │  TanStack Query · service worker        │
                 └───────┬──────────────────────┬──────────┘
                         │                      │
        Firebase Auth /  │                      │  HTTPS  /api/v1/*
        Firestore reads  │                      │  Bearer <Firebase ID token>
        Storage reads    │                      │
                         ▼                      ▼
        ┌────────────────────────┐   ┌───────────────────────────────┐
        │ Firebase              │   │ Express API (Node 20, TS)      │
        │  · Authentication     │◀──│  · verifies ID token           │
        │  · Firestore          │   │  · authorises by role claim    │
        │  · Storage            │   │  · Admin SDK (bypasses rules)  │
        │  · Hosting (PWA + CDN)│   │  · pdf-lib receipts and cards  │
        └────────────────────────┘   │  · Nodemailer · ExcelJS       │
                                     └───────────────────────────────┘
```

The client talks to Firebase directly for **reads it is entitled to** and for
authentication. It talks to the Express API for **everything that must be
trusted**.

## Why both a client SDK and a server API

Firestore's client SDK gives cheap real-time reads and offline caching, which is
exactly what a member's notice board or event list needs. What it cannot give is
a trustworthy write path for operations whose correctness depends on rules more
complex than a document shape — for example:

- allocating the next receipt number in an unbroken sequence;
- approving a payment only if the caller is the treasurer, and recording who did;
- generating a receipt PDF that must not exist until that approval happened;
- sending email;
- aggregating a year of finance data into a report.

Those live in the Express API. Security rules stay closed for those collections,
so there is no second, weaker path to the same data.

## Trust boundary

The browser is untrusted. Concretely:

- The client sends a **Firebase ID token**, never a role. The API verifies the
  token with the Admin SDK and reads the role from **custom claims**, which only
  the server can set.
- Firestore rules are the backstop for direct client reads. They deny by default;
  each collection is opened explicitly (Phase 2–3) with its own tests.
- The Admin SDK ignores security rules. Every API handler therefore performs its
  own authorisation check before touching data — the SDK's power is the reason,
  not an excuse.

## Request flow: membership renewal (SRS §8)

```
member clicks Renew
  → POST /api/v1/payments                 API creates payment {status: initiated}
                                          and allocates a reference number
  → client shows club UPI QR + UPI ID     (from settings, not hard-coded)
  → member pays in any UPI app
  → POST /api/v1/payments/:id/reference   member submits UPI transaction id
                                          status → pending_verification
  → treasurer opens the verification queue
  → POST /api/v1/payments/:id/approve     role check: treasurer
       ├── membership validity extended
       ├── receipt number allocated (transaction)
       ├── receipt PDF written to Storage
       ├── confirmation email queued
       └── audit_logs entry written
```

Rejection is symmetrical and equally recorded. Nothing in this flow issues a
receipt before the approval step, and the approval step is a single Firestore
transaction so a crash cannot leave a membership extended without a receipt or a
receipt number consumed without a payment.

## Frontend structure

```
frontend/src/
├── app/         router, providers, query client, mount, boot error screen
├── components/  layout shells and reusable UI primitives
├── config/      validated environment, domain constants
├── features/    one folder per domain area (added from Phase 5 onwards):
│                api calls, hooks, components and schemas that belong together
├── lib/         firebase client, API client, helpers
├── pages/       route components, grouped public / portal / admin
└── test/        test setup
```

Feature-first, not layer-first: everything about payments — its queries, its
forms, its schemas, its components — sits in `features/payments/`, so a change
to the payment flow touches one directory.

## Backend structure

```
backend/src/
├── config/      validated environment, lazy Firebase Admin, domain constants
├── lib/         logger, error types, PDF and email helpers (later phases)
├── middleware/  request logging, rate limits, auth guards, error handler
├── routes/      one router per domain area, mounted under /api/v1
└── services/    business logic (added from Phase 5): the layer that owns
                 transactions, sequences and audit writes
```

Routes validate and delegate; services decide. Firestore transactions belong in
services so that "approve a payment" is one function with one test, callable from
an HTTP route today and a scheduled job later.

## Cross-cutting decisions

**Environment validation at boot.** Both apps parse their environment with Zod
and refuse to start on a missing key, with a message naming it. The web app
renders that message instead of a blank page.

**Error contract.** Every API error is
`{ error: { code, message, details? }, requestId? }`. The client's `ApiError`
reads exactly that shape, and 4xx responses are never retried.

**Correlation ids.** An inbound `X-Request-Id` is honoured, otherwise generated,
attached to every log line for the request, echoed on the response, and included
in error bodies — so a member's screenshot of an error can be traced to its logs.

**Shared domain constants are duplicated, deliberately.** Roles, membership
types, payment statuses, identifier formats and collection names exist in both
`frontend/src/config/constants.ts` and `backend/src/config/constants.ts` inside a
marked region. The two apps are separate packages with different module systems,
so importing across them would complicate both builds and the Functions deploy.
`scripts/check_domain_constants.py` fails CI if the regions differ.

**Logging redacts by default.** Authorisation headers, cookies, passwords and UPI
transaction ids never reach the logs.

## Deployment topology

Firebase Hosting serves the built PWA from its CDN. The Express API is deployed
as a container (Cloud Run) or a 2nd-generation Cloud Function, and Hosting
rewrites `/api/**` to it, so the browser sees one origin and needs no CORS
exception in production. Both require the Firebase **Blaze** plan; see
[05-deployment.md](05-deployment.md).
