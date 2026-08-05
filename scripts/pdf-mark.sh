#!/usr/bin/env bash
#
# Put the club's logo on the receipts and the statements.
#
#   npm run logo:pdf                                   # uses the site's logo
#   npm run logo:pdf frontend/public/brand/logo_1.png  # or any PNG you name
#
# Writes backend/src/lib/pdf/clubMark.ts — the logo as base64, compiled into the
# API.
#
# ## Why base64 in a source file, and not the PNG itself
#
# The PDFs are built by the API, which runs as a bundled serverless function. A
# function bundler follows `import`, not `fs.readFile`, so a PNG sitting beside the
# code is simply absent at runtime unless every deployment target is separately
# told to carry it — and this project has two (Netlify, Appwrite). The failure mode
# is a logo that works locally and is missing on the live site, which is the worst
# kind. Compiled in, it cannot go missing.
#
# The cost is a large-looking source file. That is the trade, made deliberately:
# roughly 30 KB of text in the API bundle, once, against a document the club puts
# in a member's hand.
#
# Uses `sips`, which ships with macOS, and `zopflipng` if it happens to be
# installed. Nothing to install.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$ROOT_DIR/frontend/public/brand/logo_web.png}"
TARGET="$ROOT_DIR/backend/src/lib/pdf/clubMark.ts"

# 120px square. The mark prints at about 40pt — half an inch — so 120px is over
# 200 dpi on paper, and every pixel beyond that is bundle weight nobody can see.
SIZE=120

if [ ! -f "$SOURCE" ]; then
    echo "error: no such file: $SOURCE" >&2
    echo "       pass the path to the club's logo, or put it at" >&2
    echo "       frontend/public/brand/logo_web.png" >&2
    exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

sips -s format png -Z "$SIZE" "$SOURCE" --out "$WORK/mark.png" >/dev/null

if command -v zopflipng >/dev/null 2>&1; then
    zopflipng -m "$WORK/mark.png" "$WORK/mark-opt.png" >/dev/null 2>&1 || true
    if [ -f "$WORK/mark-opt.png" ]; then
        mv "$WORK/mark-opt.png" "$WORK/mark.png"
    fi
fi

BYTES=$(wc -c < "$WORK/mark.png" | tr -d ' ')
BASE64=$(base64 < "$WORK/mark.png" | tr -d '\n')

{
    cat <<EOF
/**
 * The club's logo, for the receipts and the statements.
 *
 * GENERATED FILE — do not edit by hand. Regenerate it after changing the logo:
 *
 *     npm run logo:pdf
 *
 * A ${SIZE}px PNG of $(basename "$SOURCE"), $((BYTES / 1024)) KB, base64 encoded.
 *
 * Base64 in a source file rather than a PNG on disk because the API runs as a
 * bundled serverless function: a bundler follows imports, not \`fs.readFile\`, so a
 * file beside the code is missing at runtime unless every deployment target is
 * separately told to carry it — and this project has two. A logo that works
 * locally and is absent from the member's receipt is the failure this avoids.
 *
 * Set this to an empty string and the documents fall back to a drawn monogram, so
 * a club with no logo still gets a document that looks deliberate. See
 * \`drawClubMark\` in brand.ts.
 */
export const CLUB_MARK_PNG_BASE64 =
EOF
    # Wrapped so the file is diffable and no line is absurd. String concatenation
    # rather than a template literal: a newline inside base64 would break it.
    echo "$BASE64" | fold -w 96 | sed "s/^/  '/; s/\$/' +/" | sed '$ s/ +$//'
} > "$TARGET"

printf '\n' >> "$TARGET"

echo "→ wrote backend/src/lib/pdf/clubMark.ts"
echo "  source : $SOURCE"
echo "  mark   : ${SIZE}x${SIZE}px, $((BYTES / 1024)) KB PNG"
echo "  next   : npm --prefix backend run typecheck && npm --prefix backend test"
