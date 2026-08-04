# Firebase configuration

**Firebase is the alternative backing store, not the default.** The club's ledger is
expected to live in Appwrite ([docs/10-appwrite.md](../docs/10-appwrite.md)), and the
site is hosted on Netlify ([docs/09-netlify.md](../docs/09-netlify.md)). Nothing in
this folder is used unless `FIREBASE_*` credentials are the only ones the API has.

It is kept rather than deleted because Firestore is a working choice for a club that
already has a Firebase project, and these rules are what make that choice safe.

| File                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `firestore.rules`       | Firestore security rules                                   |
| `firestore.indexes.json`| Composite index definitions                                |
| `storage.rules`         | Cloud Storage security rules                               |

`firebase.json` at the repository root points at these three files and configures the
emulator ports. It no longer configures hosting: Firebase Hosting was replaced by
Netlify, which serves the site *and* the API from one origin on its free plan, where
Firebase Hosting would have needed the Blaze plan to run the API at all.

## Selecting a project

There is no `.firebaserc`. It held a real project id, so it was removed along with the
other committed identifiers — a file in the repository that silently decides which
project a `deploy` targets is worth being explicit about instead.

The project comes from `FIREBASE_PROJECT_ID` in `backend/.env`, which is also what the
API authenticates with, so there is one answer rather than two that can disagree:

```bash
npm run rules:push          # reads FIREBASE_PROJECT_ID, uploads and releases the rules
```

For the Firebase CLI directly, name the project on the command line:

```bash
npm run firebase -- login
npm run firebase -- deploy --only firestore:rules,firestore:indexes,storage \
  --project "$FIREBASE_PROJECT_ID"
```

`npm run firebase` goes through `npx`, so no global install is needed.

## Deploying rules and indexes

Rules are deployed independently of application code, and should be deployed
**before** any feature that depends on them — a page that expects new rules must never
reach members before the rules exist. Indexes first, because they take time to build.

## Current state

Both rule files deny all client access. This is the intended baseline and matches how
the application works: the browser is never given a database handle in either store.
Every figure comes through the Express API, because the rules that matter cannot be
expressed as security rules at all — two-person approval, gapless reference numbers,
the audit trail.

The Firebase Admin SDK in `backend/` bypasses security rules entirely. Privileged
work — verifying payments, issuing receipt numbers, writing audit logs — belongs
there, never in a client write path.
