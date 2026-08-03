# Firebase configuration

This folder holds the Firebase artefacts that are reviewed and versioned as code:

| File                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `firestore.rules`       | Firestore security rules                                   |
| `firestore.indexes.json`| Composite index definitions                                |
| `storage.rules`         | Cloud Storage security rules                               |

`firebase.json` and `.firebaserc` live at the **repository root**, because the
Firebase CLI treats the directory containing `firebase.json` as the project root
and resolves every other path (including `frontend/dist`) relative to it.

## Selecting a project

`.firebaserc` ships with a placeholder so that a stray `firebase deploy` cannot
target someone else's project. Point it at your own project once:

```bash
firebase login
firebase use --add          # pick the project, alias it "default"
```

## Deploying rules and indexes

Rules are deployed independently of application code, and should be deployed
**before** any feature that depends on them:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Current state (Phase 1)

Both rule files deny all client access. This is the intended baseline: the app
does not read Firestore or Storage from the browser yet. Access is granted
collection by collection in Phase 2 (data model) and Phase 3 (roles), each
addition accompanied by rules tests.

Note that the Firebase Admin SDK in `backend/` bypasses security rules
entirely. Privileged work — verifying payments, issuing receipt numbers,
writing audit logs — belongs there, never in a client write path.
