# Development phases

The SRS (§26) prescribes sixteen phases, built one at a time, each explained and
approved before the next begins. This file is the running record.

| # | Phase | Status |
| --- | --- | --- |
| 1 | Project setup | ✅ Complete |
| 2 | Database & data model | ⬜ Not started — **blocked on six decisions, see below** |
| 3 | Authentication & roles | ⬜ Not started |
| 4 | Public website | ✅ Complete |
| 5 | Admin portal | ⬜ Not started |
| 6 | Member portal | ⬜ Not started |
| 7 | Payment (UPI, manual verification) | ⬜ Not started |
| 8 | Receipts | ⬜ Not started |
| 9 | Events | ⬜ Not started |
| 10 | Gallery | ⬜ Not started |
| 11 | Finance | ⬜ Not started |
| 12 | Reports | ⬜ Not started |
| 13 | Notifications | ⬜ Not started |
| 14 | PWA hardening | ⬜ Not started |
| 15 | Testing | ⬜ Not started |
| 16 | Deployment | ⬜ Not started |

---

## Phase 1 — Project setup ✅

**Delivered**

- Repository layout per SRS §22: `frontend/`, `backend/`, `firebase/`, `docs/`,
  `scripts/`.
- Frontend: Vite 8 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`),
  Tailwind CSS v4 with club design tokens, React Router v8, TanStack Query with a
  retry policy that ignores 4xx, PWA manifest and service worker with a
  non-destructive update prompt, ESLint + Prettier, Vitest + Testing Library.
- Backend: Express + TypeScript, Helmet, CORS allowlist, compression, structured
  request logging with correlation ids and redaction, rate limiting, a typed error
  contract, lazy Firebase Admin initialisation, health and readiness endpoints,
  Vitest + Supertest.
- Hosting: `appwrite.config.json` declaring the site and the API function,
  PWA-correct cache headers and security headers. `firebase.json` retains the
  emulator ports and the paths to the Firestore and Storage rules, which **deny all
  client access** as the baseline; empty index manifest.
- Boot-time environment validation in both apps, with a readable failure screen in
  the browser instead of a blank page.
- Shared domain constants (roles, membership types, payment statuses, identifier
  formats, collection names) with a CI check that they have not drifted between
  the two apps.
- CI: lint, type-check, test and build for both apps, constants check, and a rules
  compile check. Gated production deploy workflow.
- Documentation: overview, architecture, local setup, environment reference, this
  phase plan, deployment guide.

**Deliberately not done yet** — these belong to later phases and would be guesswork now:

- No Firestore collections, converters or seed data (Phase 2).
- No login, no route guards, no role claims (Phase 3).
- Only the home page and 404 exist; the remaining public pages come in Phase 4.
- Security rules are closed rather than "roughly right" — each collection is
  opened deliberately, with tests, in Phases 2–3.

**Verified on Node 24 / npm 11**

Everything below was executed, not assumed:

| Check | Result |
| --- | --- |
| `npm run install:all` | 667 + 601 packages, **0 vulnerabilities** in both apps |
| `npm run check:constants` | shared region identical (114 lines) |
| `npm run lint` | clean, both apps |
| `npm run typecheck` | clean, both apps |
| `npm test` | 11 tests passed (6 frontend, 5 backend) |
| `npm run build` | both apps built; PWA precache 17 entries |
| `npm run dev` | both servers up; API on 5055, web on 5173 |
| `GET /api/v1/health` | `200` `{"status":"ok",…}` |
| `GET /api/v1/health/ready` | `503` `{"firestore":"not_configured"}` — correct without credentials |
| `GET /api/v1/nope` | `404` `{"error":{"code":"route_not_found"}}` |
| malformed JSON body | `400` `{"error":{"code":"malformed_json"}}` with `requestId` |
| response headers | `X-Request-Id`, Helmet set, `RateLimit-Policy: 300;w=900`, no `X-Powered-By` |
| `GET :5173/api/v1/health` | `200` — Vite proxy reaches the API on one origin |
| SIGTERM | graceful shutdown, both ports released |

**Decisions taken during that verification**

1. **API port is 5055, not 5000.** macOS reserves 5000 for the AirPlay Receiver
   (`ControlCenter`), which answers with a bare `403` — a confusing failure worth
   designing out rather than documenting around.
2. **`scripts/dev.sh` polls instead of using `wait -n`.** macOS ships bash 3.2,
   which does not support it; the original script exited immediately.
3. **React Router v8 (`react-router`), not `react-router-dom` v7.** A high-severity
   advisory (GHSA-qwww-vcr4-c8h2) covers react-router 7.12.0–8.2.0, and the only
   patched release is 8.3.0. In v8 `react-router-dom` is folded into `react-router`,
   so imports moved. Downgrading seven minor versions was the alternative.
4. **`uuid` pinned via `overrides` in the backend.** GHSA-w5hq-g745-h8pq reaches us
   only through exceljs and firebase-admin's storage client, neither of which passes
   the affected `buf` argument; forcing the patched `uuid` beats downgrading exceljs
   by a major version.
5. **TypeScript 6, not 7.** `typescript-eslint` supports `typescript <6.1.0`; TS 7
   would mean no lint rules that need type information.
6. **Firebase moved out of the initial bundle.** `ApiError` lives in its own module
   and the Firebase SDK is imported lazily inside the auth-header helper, so a
   visitor reading the public site never downloads it: 881 kB → 404 kB
   (266 kB → 125 kB gzipped).
7. **Probe routes excluded from request logging, and `err.body` redacted.** A
   readiness 503 was being logged as an ERROR with a fabricated stack trace, and
   body-parser attaches the raw payload to its `SyntaxError` — which on a payment
   endpoint would put member data in the log.

**Known gaps to resolve before the next phase**

1. ~~`.firebaserc` holds a placeholder project id.~~ Resolved: the file is gone, and
   the project comes from `FIREBASE_PROJECT_ID` — see `firebase/README.md`.
2. The PWA icons are generated placeholders (a white **M** on club green).
   Replace them with the club's logo, keeping the filenames.
3. ~~`frontend/.env.local` and `backend/.env` contain placeholder values so the app
   boots.~~ Resolved: neither app needs any environment variable to boot. With none
   set the API serves the embedded demo ledger and demo sign-in, and says so on
   every signed-in page. Real credentials are needed before the club keeps real
   records, not before the site runs.
4. The initial bundle is 125 kB gzipped (React + Router + Query) with no features
   yet. Route-level lazy loading and manual chunk splitting are Phase 14 work,
   after the real weight is measurable.
5. Nothing has been deployed. `firebase deploy` has never run against a project.

---

## Phase 4 — Public website ✅

Built ahead of Phases 2 and 3 because it depends on neither the data model nor
authentication, and because it is what the club can actually show people now.

**Delivered** — every item in SRS §4:

| Page | Route |
| --- | --- |
| Home | `/` |
| About | `/about` |
| Mission & vision | `/mission-vision` |
| History | `/history` |
| Executive committee | `/committee` |
| Membership | `/membership` |
| Events | `/events` |
| Gallery | `/gallery` |
| News | `/news` |
| Documents | `/documents` |
| Contact (with map) | `/contact` |

Sponsors and testimonials are bands on the home page. Google Map is on the
contact page.

**How it is built**

- **All copy in one file** — `frontend/src/content/site.ts`. Sixteen numbered
  sections, one per part of the site, so changing wording never means editing a
  component. Walkthrough in [06-editing-the-website.md](06-editing-the-website.md).
- **A design system, not per-page styling.** Colours, the serif display face,
  shadows, gradients and animations are tokens in `index.css`; changing
  `--color-brand-900` restyles the header, footer, hero and buttons together.
  Both typefaces are already on the reader's device — no webfont request, so it
  works offline.
- **Light, colourful surfaces built from CSS, not images.** The `bg-aurora`
  washes behind the hero and page banners are layered gradients, so they add
  nothing to page weight and render offline. Sections pick a background through a
  `tone` prop rather than hard-coding one.
- **Categories are colour-coded deterministically.** `lib/hues.ts` derives a hue
  from the category name, so "Sport" is the same green on the home page, the
  events list and every card, and a new category needs no styling work. Class
  names are written out in full because Tailwind scans source text — an
  interpolated `bg-${hue}-100` would silently produce no CSS.
- **Motion with an off switch.** Scroll reveals, counting statistics, a
  continuous supporters ticker, hover lifts, a scroll-aware header and a
  back-to-top button. Everything stops under `prefers-reduced-motion`, and
  revealed content is then shown immediately — an animation preference must never
  hide information. Reveals and scroll state are driven through DOM attributes
  rather than React state, so scrolling does not re-render the page.
- **An accessible gallery viewer.** Built on the native `<dialog>` element, which
  supplies the focus trap, the inert background and Escape handling; arrow keys
  move between albums and wrap around at both ends. Where `showModal` is
  unavailable it degrades to a non-modal dialog rather than showing nothing.
- **Every page code-split.** The main chunk is 238 kB (74 kB gzipped); a visitor
  who reads only the home page never downloads the contact form's validation code.
- **Empty states everywhere a list can be empty**, so a club with no published
  events looks considered rather than broken.
- **A working contact form.** React Hook Form with Zod validation, which hands the
  message to the visitor's own email application. Not a silent POST: there is no
  enquiry endpoint yet, and a form that appears to send while discarding the
  message is worse than no form. The help-desk phase replaces it with a tracked
  ticket.
- **Accessibility**: one `h1` per page (asserted by test), skip link, labelled
  form controls with `role="alert"` validation messages, `aria-expanded` on both
  menus, Escape and outside-click dismissal, and `prefers-reduced-motion` honoured.

**Decisions worth recording**

1. **Placeholder content is labelled as such.** Committee names read `Full name`,
   testimonial quotes say to replace them, and fees are `null` rendering as "To be
   confirmed". Inventing a club's fees, history or member quotes would be worse
   than showing them as pending. A `contentStatus` flag shows a reminder in
   development until a human has reviewed every word.
2. **The Google Maps embed is off by default.** It loads Google's scripts and
   cookies for every visitor; that is the club's decision to make, not one to
   inherit. Until an embed URL is set, the page shows a panel with a link out.
3. **Social platforms are named links, not logos.** lucide 1.x removed its brand
   glyphs; reproducing trademarked marks from memory is both a legal and an
   accuracy risk, and a named link reads better on a screen reader.
4. **No state-resetting effects.** Menus close from the link that was clicked
   rather than from an effect watching the path — `react-hooks` v7 enforces the
   React Compiler rules, and the effect version caused a second render on every
   navigation.

**Caught by the tests, not by a member**

The page smoke tests found that required form fields showed a visual `*` but
carried no `required` attribute, so assistive technology never announced it. Fixed
in the controls; the test now guards it.

**Verified**: 42 frontend tests + 5 backend, lint and type-check clean, builds
clean. 12 of those tests assert content invariants — unique slugs, ISO dates, menu
links resolving to real routes, at most one pinned notice, membership categories
matching the system's list, and that the join steps still say a receipt is issued
only after verification.

---

## Phase 2 — Database & data model (next)

**Scope**

- A documented schema for all sixteen collections in SRS §21: fields, types,
  required/optional, defaults, relationships.
- Zod schemas as the single definition of each document shape, used for API
  validation and for typed Firestore converters.
- Composite indexes for the queries the app will actually run (member lists by
  status and expiry, payment queues by status and date, events by date).
- Denormalisation decisions, stated explicitly — e.g. whether a payment carries a
  copy of the member's name and number so a receipt reprint years later is not
  affected by a later profile edit.
- Identifier allocation design: `CLB-YYYY-000001` and `RCT-YYYY-000001` must be
  gapless and unique under concurrency, which means a counter document read and
  written inside a transaction, never a count of existing documents.
- Seed script for a development dataset (settings, membership types and fees,
  committee roles) containing no real member data.
- Firestore rules opened for read paths the client genuinely needs, with tests
  against the emulator.

**Open questions for the club** — these change the schema, so they are worth
settling before Phase 2 rather than migrating afterwards:

1. **Membership year.** Financial year (1 April – 31 March), calendar year, or a
   rolling 12 months from the date of payment?
2. **Fees.** Amount per membership type; whether Life members pay once; whether
   Honorary members pay at all; whether there is a pro-rata rule for joining
   mid-year.
3. **Family membership.** One record with dependants, or linked individual
   records each with their own member number and login?
4. **Member numbers.** Does `CLB-YYYY` use the joining year (fixed for life) or
   the current year? Do existing members have numbers that must be preserved?
5. **Grace period.** How long after expiry does a member keep portal access
   before the status becomes `expired`?
6. **Data retention.** How long are records of former members kept, and what is
   deleted when someone asks to be removed?
