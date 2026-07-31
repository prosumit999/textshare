#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_FILE:?Set BACKUP_FILE to an encrypted backup}"
: "${BACKUP_AGE_IDENTITY:?Set BACKUP_AGE_IDENTITY}"
: "${RESTORE_TEST_URI:?Set RESTORE_TEST_URI to a disposable database ending in _restore_test}"
database_name="${RESTORE_TEST_URI##*/}"; database_name="${database_name%%\?*}"
[[ "$database_name" == *_restore_test ]] || { echo "Refusing restore: database must end in _restore_test" >&2; exit 1; }
age -d -i "$BACKUP_AGE_IDENTITY" "$BACKUP_FILE" | mongorestore --uri="$RESTORE_TEST_URI" --archive --gzip --drop
mongosh "$RESTORE_TEST_URI" --quiet --eval 'const names=db.getCollectionNames(); if(!names.includes("users")||!names.includes("blogPosts")) throw new Error("Restore validation failed"); printjson({collections:names.length,users:db.users.countDocuments(),blogPosts:db.blogPosts.countDocuments()})'
