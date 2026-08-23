# Production security operations

## Endpoint body limits

The application enforces limits itself. For defense in depth, create higher-priority Coolify/Traefik routers pointing to the same service:

- `Path(`/`) && Method(`POST`)`: `textshare-share-buffering@file` (52 MB).
- `Path(`/api/admin/blog-image`) && Method(`POST`)`: `textshare-image-buffering@file` (6 MB).
- `Path(`/login`, `/signup`, `/admin-verify`, `/join`) && Method(`POST`)`: `textshare-auth-buffering@file` (64 KB).
- Everything else: the existing `textshare-security@file` chain (8 MB).

The share router must have the highest priority. Never raise the default 8 MB middleware to accommodate shares.

## MongoDB least privilege and validation

Create a dedicated application user restricted to the `textshare` database with `readWrite`; do not use the MongoDB root account in `MONGODB_URI`. For one deployment only, use a separate migration credential with `dbAdmin` and set `APPLY_MONGO_VALIDATORS=true`. After startup succeeds, restore the application credential and set the flag to `false`.

Keep MongoDB on Coolify's private network and do not publish port 27017.

## Malware scanning

Deploy ClamAV on the private network, set `CLAMAV_HOST`, `CLAMAV_PORT=3310`, and after verifying connectivity set `CLAMAV_REQUIRED=true`. Detected files and scanner failures are rejected. Quarantine retains only a SHA-256 fingerprint and metadata for 30 days, never the malicious payload.

## Encrypted backups

Install `mongodb-database-tools`, `age`, and `rclone` in a dedicated Coolify scheduled-job image. Run `scripts/backup-mongodb.sh` daily with an `age` recipient and an off-site R2/S3 remote. Keep the age private identity offline.

At least monthly, download a backup and run `scripts/test-mongodb-restore.sh` against a disposable database whose name ends in `_restore_test`. Record the result and restoration time.

## Audit verification

Run `npm run audit:verify` regularly. Export with:

```bash
npm run audit:verify -- --out=audit-$(date -u +%Y%m%d).ndjson
```

Alert on a non-zero exit, sequence gaps, missing key IDs, or invalid signatures. Store exports in immutable/off-site storage.
