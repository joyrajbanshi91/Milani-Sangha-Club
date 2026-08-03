# Project overview

## What this system is

A single Progressive Web App and REST API that runs the administration of
Milani Sangha Club:

- a **public website** — who the club is, what it does, what is coming up;
- a **member portal** — profile, membership validity, renewals, receipts,
  event registration, documents, support tickets;
- an **admin portal** — members, applications, payments, events, gallery, news,
  documents, finance, help desk, reports, audit logs and settings, with
  permissions that follow the club's office bearers.

The requirements it implements are in
[../Club_Management_Platform_SRS.md](../Club_Management_Platform_SRS.md).

## Design commitments

These decisions shape everything that follows, so they are stated once here.

**Money is verified by a person, never by the software.**
Membership payment (SRS §8) is a manual-verification flow: the member pays over
UPI and submits a transaction reference; the treasurer checks it against the
club's bank or UPI statement and approves or rejects it. The system never
confirms a payment on its own, and **no receipt exists before approval** — the
receipt number sequence is only touched at the moment of approval.

**Privileged writes happen on the server.**
Firestore security rules deny by default. Anything that allocates an identifier,
changes money, changes a role or records an audit entry runs in the Express API
through the Admin SDK, where the caller's identity is verified from their
Firebase ID token and their role from custom claims — never from a value the
browser supplied.

**Every consequential action is attributable.**
Payment approvals, role changes, member record edits and deletions write to
`audit_logs` with actor, action, target, before/after and timestamp. A club
committee must be able to answer "who approved this and when" years later.

**Members are on modest phones and patchy connections.**
Hence the PWA: installable, offline-capable for read paths, small initial
bundle, and an update prompt that never reloads the app underneath someone
who is part-way through a form.

**Personal data stays inside the system.**
Member names, phone numbers, addresses, photographs and payment references are
personal data. They are not written to logs (the logger redacts them), not put
into filenames, and not exported except through the reports module by a role
entitled to see them.

## Scale target

10,000 members. That figure mainly constrains reads: member and payment lists
must be paginated and index-backed, reports must aggregate server-side, and no
screen may load an entire collection to count or filter it in the browser.

## Where things live

| Path        | Contents                                                          |
| ----------- | ----------------------------------------------------------------- |
| `frontend/` | React PWA — public site, member portal, admin portal              |
| `backend/`  | Express API — privileged operations, PDFs, email, reports          |
| `firebase/` | Firestore and Storage security rules, composite indexes            |
| `docs/`     | This documentation set                                             |
| `scripts/`  | Developer utilities (dev runner, icons, constants drift check)      |

## Documentation map

1. [Architecture](01-architecture.md) — how the pieces fit together
2. [Local setup](02-local-setup.md) — getting it running on a machine
3. [Environment variables](03-environment-variables.md) — every key, and which are secret
4. [Development phases](04-development-phases.md) — the build order and current status
5. [Deployment](05-deployment.md) — how it reaches production
