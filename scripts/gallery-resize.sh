#!/usr/bin/env bash
#
# Shrink the gallery photographs so the website stays quick.
#
#   npm run gallery:resize            # the whole gallery
#   npm run gallery:resize health-camp   # one album
#
# A photograph straight off a phone is 3–6 MB and 4000px wide. The gallery shows it at
# about 1000px, so all but a fraction of that file is downloaded, decoded and thrown
# away — on a member's mobile data, at the club's expense in patience. Five albums of
# five photographs like that is 100 MB of page.
#
# This resizes anything wider than 1600px down to 1600px and re-saves JPEGs at quality
# 80, in place. 1600px is twice the size the biggest view uses, so it still looks sharp
# on a high-density screen and has no more detail than that needs.
#
# Safe to re-run: a file already within the limit is left alone, and the original is
# copied to frontend/.gallery-originals/ the first time it is touched — outside the
# gallery folder, so the site never serves them and the build never scans them.
#
# Uses `sips`, which ships with macOS. Nothing to install.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GALLERY="$ROOT_DIR/frontend/src/assets/gallery"
KEEP="$ROOT_DIR/frontend/.gallery-originals"

MAX_WIDTH=1600
QUALITY=80

if [ ! -d "$GALLERY" ]; then
    echo "error: no gallery folder at $GALLERY" >&2
    exit 1
fi

# One album, or all of them.
if [ $# -ge 1 ]; then
    if [ ! -d "$GALLERY/$1" ]; then
        echo "error: no album folder named '$1'." >&2
        echo "       albums:" >&2
        find "$GALLERY" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sed 's/^/         /' >&2
        exit 1
    fi
    SCOPE="$GALLERY/$1"
else
    SCOPE="$GALLERY"
fi

touched=0
skipped=0
saved_bytes=0

# -print0 and read -d: a filename with a space in it is the normal case for a
# photograph somebody named by hand, not an edge case.
while IFS= read -r -d '' file; do
    width="$(sips -g pixelWidth "$file" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
    before="$(wc -c < "$file" | tr -d ' ')"

    if [ -z "$width" ]; then
        echo "  skipped  $(basename "$file")  — not an image sips can read"
        skipped=$((skipped + 1))
        continue
    fi

    if [ "$width" -le "$MAX_WIDTH" ] && [ "$before" -lt 600000 ]; then
        skipped=$((skipped + 1))
        continue
    fi

    # Keep the original once, before the first change to it.
    album="$(basename "$(dirname "$file")")"
    backup="$KEEP/$album/$(basename "$file")"
    if [ ! -f "$backup" ]; then
        mkdir -p "$(dirname "$backup")"
        cp "$file" "$backup"
    fi

    if [ "$width" -gt "$MAX_WIDTH" ]; then
        sips --resampleWidth "$MAX_WIDTH" "$file" >/dev/null
    fi

    case "$file" in
        *.jpg|*.JPG|*.jpeg|*.JPEG)
            sips -s format jpeg -s formatOptions "$QUALITY" "$file" >/dev/null
            ;;
    esac

    after="$(wc -c < "$file" | tr -d ' ')"
    saved_bytes=$((saved_bytes + before - after))
    touched=$((touched + 1))

    printf '  resized  %-44s %5s KB → %5s KB\n' \
        "$album/$(basename "$file")" "$((before / 1024))" "$((after / 1024))"
done < <(find "$SCOPE" -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0)

echo
echo "resized $touched, left alone $skipped, saved $((saved_bytes / 1024)) KB."

if [ "$touched" -gt 0 ]; then
    echo "originals kept in frontend/.gallery-originals/ (git-ignored, not published)."
fi

echo
echo "Then: git add frontend/src/assets/gallery && git commit && git push"
