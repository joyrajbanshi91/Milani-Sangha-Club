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

if [ "$target" = "all" ] || [ "$target" = "web" ]; then
  echo "── Website ─────────────────────────────────────────────────"
  # frontend/.gitignore matters here: the CLI packs the site's `path` and looks for a
  # .gitignore *inside* it, not at the repository root. Without one it tried to upload
  # 391 MB of node_modules and failed complaining about a size limit.
  cli push site --site-id milani-web --activate true --no-logs --force
  echo
fi

echo "── Checking it ─────────────────────────────────────────────"
npm run appwrite:check
