#!/usr/bin/env bash
#
# Generate the Progressive Web App icons from the club's logo.
#
#   npm run icons:from-logo frontend/public/brand/logo.png
#
# Writes into frontend/public/icons/, replacing the generated placeholders. Uses
# `sips`, which ships with macOS, so there is nothing to install.
#
# Existing icons are backed up to frontend/.icon-backups/<timestamp>/ before
# anything is overwritten, so a bad source file is never destructive.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_DIR="$ROOT_DIR/frontend/public/icons"
# Deliberately outside public/: every file under public/ is published to the
# live site, so a folder of superseded icons there would be served to visitors.
BACKUP_ROOT="$ROOT_DIR/frontend/.icon-backups"

# Plate colour behind a transparent logo on the maskable icon. Matches
# --color-brand-900 in frontend/src/index.css.
PLATE_COLOUR="0f3d2e"

usage() {
    cat >&2 <<'EOF'
usage: npm run icons:from-logo <path-to-logo>

  <path-to-logo>   PNG or JPEG. Ideally square and at least 512x512.

example:
  npm run icons:from-logo frontend/public/brand/logo.png
EOF
    exit 2
}

[ $# -eq 1 ] || usage
SOURCE="$1"

if [ ! -f "$SOURCE" ]; then
    echo "error: no such file: $SOURCE" >&2
    exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
    echo "error: 'sips' not found. This script needs macOS." >&2
    echo "       On another platform, resize the logo by hand into:" >&2
    echo "       icon-192.png, icon-512.png, icon-maskable-512.png," >&2
    echo "       apple-touch-icon-180.png, favicon-32.png" >&2
    exit 1
fi

# sips reads PNG, JPEG, TIFF and HEIC — but not SVG.
case "${SOURCE##*.}" in
    svg | SVG)
        echo "error: sips cannot read SVG." >&2
        echo "       Export the logo as a PNG (512x512 or larger) and use that." >&2
        echo "       The SVG is still fine to use on the page itself." >&2
        exit 1
        ;;
esac

read -r WIDTH HEIGHT <<<"$(
    sips -g pixelWidth -g pixelHeight "$SOURCE" |
        awk '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} END {print w, h}'
)"

echo "source: $SOURCE (${WIDTH}x${HEIGHT})"

if [ "${WIDTH:-0}" -lt 512 ] || [ "${HEIGHT:-0}" -lt 512 ]; then
    echo "warning: smaller than 512x512 — the home-screen icon may look soft." >&2
    echo "         Supply a larger file if you have one." >&2
fi

mkdir -p "$ICON_DIR"

# Back up whatever is there now.
BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
if compgen -G "$ICON_DIR/*.png" >/dev/null; then
    mkdir -p "$BACKUP_DIR"
    cp "$ICON_DIR"/*.png "$BACKUP_DIR"/
    echo "backed up existing icons to ${BACKUP_DIR#"$ROOT_DIR"/}"
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Square the logo first by padding, not cropping: cropping a wide logo would cut
# the ends off, and a home-screen icon that loses half the club's name is worse
# than one with margins.
#
# Padded with the club colour rather than white, because sips cannot pad with
# transparency — white padding would turn a transparent logo into a white box
# floating on the coloured plate. A logo that is already square is untouched.
SQUARE="$WORK_DIR/square.png"
LONGEST=$((WIDTH > HEIGHT ? WIDTH : HEIGHT))
sips -s format png "$SOURCE" --out "$SQUARE" >/dev/null
if [ "$WIDTH" -ne "$HEIGHT" ]; then
    sips --padToHeightWidth "$LONGEST" "$LONGEST" --padColor "$PLATE_COLOUR" "$SQUARE" >/dev/null 2>&1
    echo "note: logo is not square — padded to ${LONGEST}x${LONGEST} on a #${PLATE_COLOUR} plate."
fi

generate() {
    local name="$1" size="$2"
    sips -s format png -z "$size" "$size" "$SQUARE" --out "$ICON_DIR/$name" >/dev/null
    echo "  wrote icons/$name (${size}x${size})"
}

echo "generating:"
generate "icon-192.png" 192
generate "icon-512.png" 512
generate "apple-touch-icon-180.png" 180
generate "favicon-32.png" 32

# The maskable icon is cropped to whatever shape the launcher uses — a circle, a
# squircle, a rounded square. The artwork therefore needs a safe margin, and a
# solid plate behind it so the crop never exposes a transparent corner.
MASKABLE="$WORK_DIR/maskable.png"
sips -s format png -z 328 328 "$SQUARE" --out "$MASKABLE" >/dev/null
sips --padToHeightWidth 512 512 --padColor "$PLATE_COLOUR" "$MASKABLE" >/dev/null 2>&1
cp "$MASKABLE" "$ICON_DIR/icon-maskable-512.png"
echo "  wrote icons/icon-maskable-512.png (512x512, with safe margin)"

ABS_SOURCE="$(cd "$(dirname "$SOURCE")" && pwd)/$(basename "$SOURCE")"
PUBLIC_DIR="$ROOT_DIR/frontend/public"

if [[ "$ABS_SOURCE" == "$PUBLIC_DIR"/* ]]; then
    SITE_PATH="${ABS_SOURCE#"$PUBLIC_DIR"}"
    LOGO_HINT="         logo: { src: '$SITE_PATH', … }"
else
    LOGO_HINT="         The logo is outside frontend/public/, so the website cannot serve it.
         Copy it in first, then use that path:
             cp '$SOURCE' frontend/public/brand/
             logo: { src: '/brand/$(basename "$SOURCE")', … }"
fi

cat <<EOF

Done. Next:
  1. Set the on-page logo in frontend/src/content/site.ts:
$LOGO_HINT
  2. Restart 'npm run dev' — icons are cached hard by the browser.
  3. To see the home-screen icon, reinstall the app from the browser menu.

If the result looks wrong, restore with:
  cp ${BACKUP_DIR#"$ROOT_DIR"/}/*.png frontend/public/icons/
EOF
