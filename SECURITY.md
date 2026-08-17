# TextShare production security

## Coolify deployment

1. Deploy this directory with the included `Dockerfile`.
2. Set the application port to `4321` and health check path to `/api/health`.
3. Set every variable from `.env.example`. Production requests fail closed when Redis is unavailable.
4. Add Redis and MongoDB as private Coolify services. Use long random passwords, do not publish ports `6379` or `27017`, and use their internal service hostnames in `REDIS_URL` and `MONGODB_URI`. `localhost` works only for local development, not from the application container.
5. Set the application domain with `https://` in Coolify. Set `APP_ORIGIN` to that exact origin.
6. Mount `deploy/traefik/textshare-security.yml` in Coolify's Traefik dynamic configuration and attach `textshare-security@file` to the application's router. Application-level limits remain authoritative and endpoint-specific.

## Admin owner account

The owner console is served from `/8010952940-admin`. The requested raw `%` character was not used because `%a` begins URL percent-encoding and makes the route invalid or inconsistently handled by proxies. The old `/admin` route returns a generic 404.

Every owner-console request requires both a server-side user with `isAdmin: true` and a session marked as email-verified. After the password is accepted, TextShare sends a single-use six-digit code to the configured owner email. The code expires after 10 minutes and permits no more than five attempts. Normal signup can never create an admin.

Create a bcrypt cost-12 hash locally:

```bash
node -e "import('bcryptjs').then(async b => console.log(await b.default.hash('USE-A-LONG-RANDOM-PASSWORD', 12)))"
```

Set `ADMIN_EMAIL` (defaults to `prosumit999@gmail.com`) and either `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH` in Coolify, then redeploy. For easy setup, `ADMIN_PASSWORD` is bcrypt-hashed with cost 12 in memory at process startup. Keep it only in Coolify secrets or an ignored local `.env`; never commit it. A precomputed `ADMIN_PASSWORD_HASH` is preferred and takes precedence when both are configured. Admin mutations are written to the audit log store.

Enable Google 2-Step Verification, create a Gmail App Password, and set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in Coolify. The normal Gmail password must never be used. Every sign-in requires a short-lived email OTP after password verification, and login fails closed if the message cannot be sent. Admin OTPs are always delivered to `GMAIL_USER`; the challenged admin identity remains the account configured through `ADMIN_EMAIL`. Admin accounts continue to support the separate recovery-code flow.

## Implemented controls

- Redis-backed per-IP/per-account limits with expiring keys. Development uses an in-memory fallback; production fails closed.
- Limits for guest/account share creation, signup, failed login, join attempts, image uploads, protected-share unlocks, and public share resolution.
- Eight MB global request-body limit and five MB decoded/re-encoded image limit.
- PNG/JPEG/WEBP magic-byte verification, full Sharp decode, pixel limit, maximum dimensions, rotation, metadata stripping, and clean re-encoding. SVG and GIF are rejected.
- bcrypt cost 12 for account and protected-share passwords.
- Random 256-bit session tokens stored only as SHA-256 hashes in MongoDB. Session records have TTL expiry and work across restarts and replicas. Cookies are HttpOnly, Secure in production, and SameSite=Lax.
- Origin validation for state-changing requests.
- CSP, HSTS, anti-sniffing, anti-framing, referrer, permissions, and cross-origin isolation headers.
- Public slugs use six random lowercase alphanumeric characters, or six random digits when numeric links are selected. Because these shorter links have reduced entropy, rate limiting and monitoring are required to mitigate enumeration attempts.
- Generic expired response for missing, deleted, and expired rooms; no-store caching on room URLs.
- Non-root production container and health check.
- Structured security-event logs that exclude passwords, tokens, and shared content.

## Required external controls

- Turnstile is intentionally deferred until a production domain exists. It must protect signup, guest creation, and room joining with server-side Siteverify enforcement.
- Configure the VPS/provider firewall. Publish only 80/443 and restricted SSH; do not expose Redis or application port 4321.
- Keep Coolify, the host OS, Docker, Node, and dependencies patched. Run `npm audit` in CI and before deployment.
- Configure encrypted off-server backups and uptime/error monitoring.
- Optional but recommended: deploy ClamAV privately and connect upload scanning before accepting public image traffic.

## Persistence model

Users, subscription plans, authentication sessions, admin OTP challenges, recovery codes, blog posts, signed audit records, IP blocks, traffic/security events, and all share metadata use MongoDB. Both guest and signed-in share payloads are encrypted with AES-256-GCM and stored in GridFS so content can exceed MongoDB's 16 MB document limit. Passwords and protected-share passwords remain one-way bcrypt hashes. These records survive deployments and work across application replicas.
