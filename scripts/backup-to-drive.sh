#!/usr/bin/env bash
#
# Back up Appwrite into a Google Drive folder, and prune old copies.
#
#   bash scripts/backup-to-drive.sh
#   BACKUP_DIR="/some/other/path" bash scripts/backup-to-drive.sh
#
# Google Drive for Desktop syncs a normal folder, so a backup reaches Drive by
# being written into it — no API key, no service account, no OAuth. That matters
# for a club: the fewer credentials this needs, the fewer there are to leak or to
# expire unnoticed.
#
# Run it from cron or launchd. It exits non-zero on any failure so the scheduler
# can tell, and it never reports success without a file to point at.
#
# Written for bash 3.2, the version macOS ships.
set -euo pipefail

KEEP="${KEEP:-30}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# --------------------------------------------------------------------------
# Find the destination.
# --------------------------------------------------------------------------
# Drive for Desktop mounts under ~/Library/CloudStorage on current macOS. The
# account email is in the folder name, so it is matched rather than assumed.
find_drive() {
  if [ -n "${BACKUP_DIR:-}" ]; then
    printf '%s' "$BACKUP_DIR"
    return 0
  fi

  for candidate in "$HOME"/Library/CloudStorage/GoogleDrive-*/My\ Drive; do
    if [ -d "$candidate" ]; then
      printf '%s/Milani Sangha Club backups' "$candidate"
      return 0
    fi
  done

  # Older Drive clients, and the Windows/Linux layout under a POSIX shell.
  if [ -d "$HOME/Google Drive" ]; then
    printf '%s' "$HOME/Google Drive/Milani Sangha Club backups"
    return 0
  fi

  return 1
}

if ! DEST="$(find_drive)"; then
  cat >&2 <<'MSG'
error: no Google Drive folder found.

Install Google Drive for Desktop and sign in:
  https://www.google.com/drive/download/

It mounts at ~/Library/CloudStorage/GoogleDrive-<your-email>/My Drive.

Or point this somewhere yourself — any synced folder, or an external disk:
  BACKUP_DIR="/Volumes/Backup/club" bash scripts/backup-to-drive.sh
MSG
  exit 1
fi

mkdir -p "$DEST"

# A folder that is not syncing is a folder that quietly holds the only copy.
if [ ! -w "$DEST" ]; then
  echo "error: $DEST is not writable." >&2
  exit 1
fi

echo "destination: $DEST"

# --------------------------------------------------------------------------
# Take the backup.
# --------------------------------------------------------------------------
# `find`, not `ls *.json`: with `set -o pipefail` a glob matching nothing makes
# the pipeline fail, which aborted this script before it ran anything — so the
# very first backup into an empty folder always failed. find reports zero matches
# as success, which is what "no backups yet" is.
count_backups() {
  find "$DEST" -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' '
}

before="$(count_backups)"

npm --prefix "$REPO/backend" run backup --silent -- --out "$DEST"

after="$(count_backups)"

# Belt and braces: the backup script exits non-zero on failure, but a scheduled
# job reporting success with no new file is the failure that goes unnoticed for
# months. Check that something actually arrived.
if [ "$after" -le "$before" ]; then
  echo "error: the backup command succeeded but no new file appeared in $DEST." >&2
  exit 1
fi

newest="$(find "$DEST" -maxdepth 1 -type f -name '*.json' | sort | tail -1)"
echo "wrote: $newest"

# --------------------------------------------------------------------------
# Prune, keeping the newest KEEP files.
# --------------------------------------------------------------------------
# By count rather than by age, deliberately: pruning by age can empty the folder
# entirely if backups stop running — exactly when the old ones become precious.
# Names are ISO timestamps, so a reverse lexical sort is chronological.
find "$DEST" -maxdepth 1 -type f -name '*.json' | sort -r | tail -n "+$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
  echo "pruned: $(basename "$old")"
done

echo "done. keeping at most $KEEP backups in Drive."
echo
echo "Verify this one before trusting it:"
echo "  npm run restore -- --file \"$newest\""
