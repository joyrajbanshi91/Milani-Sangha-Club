# Scripts

Developer utilities. All are dependency-light on purpose — `dev.sh` needs only
bash, and the checks need only Python 3, so they run before `npm install` has
ever happened.

| Script | Run with | Purpose |
| --- | --- | --- |
| `dev.sh` | `npm run dev` | Starts the backend and frontend dev servers together and stops both on Ctrl-C |
| `generate_icons.py` | `npm run icons` | Regenerates the placeholder PWA icons in `frontend/public/icons/` |
| `check_domain_constants.py` | `npm run check:constants` | Fails if the shared domain constants have drifted between frontend and backend |

## `generate_icons.py`

Writes `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and
`apple-touch-icon-180.png` — a white **M** monogram on club green, encoded with
nothing but `zlib` and `struct`.

These are placeholders. Replace them with the club's real logo, keeping the same
filenames and pixel sizes so the manifest in `vite.config.ts` needs no change.
The maskable variant carries extra padding because Android crops it to whatever
shape the launcher uses; artwork that fills the square will lose its edges.

## `check_domain_constants.py`

`frontend/src/config/constants.ts` and `backend/src/config/constants.ts` each
contain a region marked `// #region shared-domain`. The two must be identical.
This script diffs them and exits non-zero on any difference, and runs in CI.

The duplication is intentional — the apps are separate packages with different
module systems — but a member number format or payment status that means one
thing in the browser and another on the server is a defect that surfaces only
after real records exist. Hence the check.

Later phases will add a database seed script here.
