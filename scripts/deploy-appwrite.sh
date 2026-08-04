#!/usr/bin/env bash
#
# Deploy the whole application to Appwrite: the API as a Function, the website as a
# Site.
#
#   npm run appwrite:deploy            # both
#   npm run appwrite:deploy -- api     # the API only
#   npm run appwrite:deploy -- web     # the website only
#
# Reads the endpoint, project and key from backend/.env and configures the CLI
# itself, so there is no separate `appwrite login` and no interactive prompt.
#
# ## Flags that are not optional
#
# `--activate true` and `--force`: without them the CLI asks "Do you want to activate
# the deployment after it is ready?" and, with no terminal to ask, dies with
# `ERR_USE_AFTER_CLOSE: readline was closed` after the upload has already happened —
# leaving a built deployment that is not serving. `--no-logs` keeps the output
# readable; the build log is on the deployment page either way.
#
# ## This is the fallback, not the usual way to deploy
#
# Normally a push to `main` deploys both, because the site and the function are
# connected to the GitHub repository. Use this when that is broken, when there is
# something to try before committing it, or on a first deploy before the connection
# exists.
#
# ## Why it repairs the GitHub connection afterwards
#
# `cli push site` sends `appwrite.config.json` as a **full replace** — Appwrite updates
# with PUT, not PATCH — and that file carries no VCS fields. So every CLI site deploy
# silently blanked `installationId`, `providerRepositoryId` and `providerBranch`, and
# push-to-deploy stopped working with nothing anywhere saying so. Seven CLI deploys
# went by before anyone noticed the website had stopped following the repository.
#
# The VCS fields are not put in appwrite.config.json instead, because they are ids
# belonging to one Appwrite project and one GitHub installation: committing them would
# make the file wrong for anybody else who ever runs this, and it is the CLI's own
# format rather than ours to extend.
#
set -euo pipefail

cd "$(dirname "$0")/.."

target="${1:-all}"

read_env() {
  grep "^$1=" backend/.env 2>/dev/null | head -1 | cut -d= -f2- || true
}

ENDPOINT="$(read_env APPWRITE_ENDPOINT)"
PROJECT="$(read_env APPWRITE_PROJECT_ID)"
KEY="$(read_env APPWRITE_API_KEY)"

if [ -z "$ENDPOINT" ] || [ -z "$PROJECT" ] || [ -z "$KEY" ]; then
  cat >&2 <<'MSG'

Cannot deploy: backend/.env needs APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and
APPWRITE_API_KEY.

The key must have Sites, Functions and Proxy scopes as well as Databases and
Users — a key made only for the database cannot deploy. Appwrite console →
your project → Overview → Integrations → API keys.

See docs/10-appwrite.md.

MSG
  exit 1
fi

echo
echo "Deploying to Appwrite"
echo "  endpoint  $ENDPOINT"
echo "  project   $PROJECT"
echo

cli() { npx --yes appwrite-cli "$@"; }

cli client --endpoint "$ENDPOINT" --project-id "$PROJECT" --key "$KEY" >/dev/null
echo "  CLI configured from backend/.env"
echo

if [ "$target" = "all" ] || [ "$target" = "api" ]; then
  echo "── API function ────────────────────────────────────────────"
  cli push function --function-id api --activate true --no-logs --force
  echo
fi

pushed_web=0

if [ "$target" = "all" ] || [ "$target" = "web" ]; then
  echo "── Website ─────────────────────────────────────────────────"
  # frontend/.gitignore matters here: the CLI packs the site's `path` and looks for a
  # .gitignore *inside* it, not at the repository root. Without one it tried to upload
  # 391 MB of node_modules and failed complaining about a size limit.
  cli push site --site-id milani-web --activate true --no-logs --force
  pushed_web=1
  echo
fi

# See the header: the site push above wipes the GitHub connection, so put it back.
# Run unconditionally rather than only on success — a failed push can still have
# replaced the settings before failing.
if [ "$pushed_web" = "1" ]; then
  echo "── Restoring push-to-deploy ────────────────────────────────"
  node scripts/connect-github.mjs --write || {
    echo
    echo "WARNING: the website deployed, but reconnecting it to GitHub failed." >&2
    echo "Pushes to main will NOT rebuild the site until this succeeds:" >&2
    echo "  npm run appwrite:github -- --write" >&2
    echo
  }
fi

echo "── Checking it ─────────────────────────────────────────────"
npm run appwrite:check
