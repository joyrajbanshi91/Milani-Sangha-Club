#!/usr/bin/env bash
# Run the frontend and backend development servers together.
# Stopping this script (Ctrl-C) stops both children.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
    echo "error: Node.js is not installed or not on PATH." >&2
    echo "       Install Node.js 20 LTS or newer: https://nodejs.org/en/download" >&2
    exit 1
fi

for app in frontend backend; do
    if [ ! -d "$app/node_modules" ]; then
        echo "error: $app/node_modules is missing. Run 'npm run install:all' first." >&2
        exit 1
    fi
done

pids=()

cleanup() {
    trap - INT TERM EXIT
    for pid in "${pids[@]:-}"; do
        if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "→ starting backend  (http://localhost:5055/api/v1/health)"
npm --prefix backend run dev &
pids+=("$!")

echo "→ starting frontend (http://localhost:5173)"
# Extra arguments are handed to Vite, so `npm run dev:lan` can add --host and
# make the app reachable from a phone on the same Wi-Fi.
npm --prefix frontend run dev -- "$@" &
pids+=("$!")

if [[ " $* " == *" --host "* ]]; then
    echo ""
    echo "→ reachable on this network at:"
    for ip in $(ipconfig getifaddr en0 2>/dev/null) $(ipconfig getifaddr en1 2>/dev/null); do
        echo "     http://$ip:5173"
    done
    echo "  Open that on any device on the same Wi-Fi. The API is proxied through"
    echo "  the dev server, so sign-in and the finance area work too."
    echo ""
fi

# Exit as soon as either server dies, so a failure is visible immediately
# instead of leaving half the stack running. Polled rather than using `wait -n`,
# which macOS's bundled bash 3.2 does not support.
while true; do
    for pid in "${pids[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "" >&2
            echo "error: a dev server exited — stopping the other." >&2
            exit 1
        fi
    done
    sleep 1
done
