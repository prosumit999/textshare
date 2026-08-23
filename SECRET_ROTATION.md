# Secret rotation

Configure secrets only in Coolify, never in the repository. Generate random values with `openssl rand -base64 48`.

## Share encryption

Set `SHARE_ENCRYPTION_KEYS` to a comma-separated keyring. The first key encrypts new payloads; every configured key can decrypt existing payloads.

1. Prepend the new key: `new,current,old` and redeploy.
2. Keep previous keys until every share created with them has expired (or has been rewritten).
3. Remove retired keys and redeploy.

`SHARE_ENCRYPTION_KEY` remains a single-key compatibility fallback.

## Audit signing

Set `AUDIT_LOG_KEYS` to a strong, comma-separated keyring. The first key signs new audit entries. Retain old keys for as long as audit entries signed by them must remain verifiable. Back up this keyring separately from MongoDB so a database-only attacker cannot forge valid entries.

## Cleanup endpoint

Set `CLEANUP_CRON_SECRETS` to a comma-separated overlap set during rotation. Update the Coolify scheduled job to the new first value, verify one successful run, then remove the old value. `CLEANUP_CRON_SECRET` remains a compatibility fallback.

## Admin and mail credentials

- Rotate `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`, redeploy, then force-delete existing admin sessions from MongoDB.
- Rotate `GMAIL_APP_PASSWORD` in Google and Coolify together.
- Generate a new recovery-code set from **Admin → Security** after any suspected compromise.

Never remove an encryption key before its data expires; doing so makes those encrypted shares unrecoverable.
