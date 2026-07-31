#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB_URI:?Set MONGODB_URI}"
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT}"
: "${BACKUP_REMOTE:?Set BACKUP_REMOTE, for example r2:textshare-backups}"
backup_name="textshare-$(date -u +%Y%m%dT%H%M%SZ).archive.gz.age"
temporary_path="$(mktemp)"; trap 'rm -f "$temporary_path"' EXIT
mongodump --uri="$MONGODB_URI" --archive --gzip | age -r "$BACKUP_AGE_RECIPIENT" -o "$temporary_path"
rclone copyto "$temporary_path" "$BACKUP_REMOTE/$backup_name"
echo "Encrypted backup uploaded: $BACKUP_REMOTE/$backup_name"
