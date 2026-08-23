# TextShare cleanup worker

The cleanup worker is exposed only through `POST /api/internal/cleanup` and requires a bearer secret. It uses a MongoDB lease, so overlapping schedules cannot clean the same records concurrently.

## Coolify configuration

1. Generate a secret:

   ```bash
   openssl rand -hex 32
   ```

2. Add the result to the application environment as `CLEANUP_CRON_SECRET`.
3. Ensure `APP_ORIGIN` is the public HTTPS origin without a trailing slash.
4. Redeploy the application.
5. Add a Coolify scheduled task with this command:

   ```bash
   npm run cleanup
   ```

6. Use the cron expression `0 0 * * *` to run it once daily at midnight in the Coolify scheduler's timezone.

The command returns a JSON report containing deletion counts and failures. A concurrent run returns HTTP 409 and performs no cleanup.

## Cleanup behavior

- Expired MongoDB shares and their encrypted GridFS payloads are removed.
- Shares above 50 MB are removed even if they have not expired.
- Expired and oversized guest shares are removed from the active application process.
- GridFS files without a matching share are removed after a one-hour grace period.
- Blog images without a referenced post are removed after a 24-hour grace period.
- Every deletion, failure, and completed run is written to `systemAuditLogs`.

The worker processes at most 2,000 records of each category per run to keep execution bounded.
