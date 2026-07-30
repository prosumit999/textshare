# TextShare product and security roadmap

## Production blockers — build before public launch

1. **Complete persistent storage:** MongoDB now stores users, plans, signed-in share metadata, and encrypted GridFS payloads. Move blog posts, audit logs, IP blocks, traffic/security events, and remaining operational records out of process-memory Maps. Add migrations/versioning, indexes, retention jobs, and transactional cleanup.
2. **Durable sessions and OTP challenges:** move sessions and admin verification challenges to Redis/PostgreSQL so deployments and multiple replicas do not invalidate or disagree about access.
3. **Real billing and entitlements:** integrate a payment provider, signed webhook verification, subscription state, renewals, cancellations, failed-payment handling, invoices, and server-side Plus/Pro authorization. Current plans are application flags only.
4. **Background lifecycle worker:** expire shares, remove Cloudinary/object-storage assets, auto-kill oversized content, reconcile orphaned files, and record every action durably. The current request-time cleanup is only a safety net.
5. **Production email:** configure a reliable transactional provider, sender-domain authentication, delivery/error monitoring, admin OTP resend controls, and account verification/password-reset flows.
6. **Cloudflare/edge protection:** after purchasing a domain, enable Turnstile on signup, login risk events, guest creation, joining, password unlock, and abuse spikes. Configure WAF, bot rules, DDoS controls, and trusted proxy headers.

## Important product work

- Complete database-backed accounts with verified email, password reset, account deletion/export, and session/device management.
- Build a real user dashboard with pagination, search, filters, share status, manual deletion, storage usage, and plan limits sourced from the database.
- Finish room/share lifecycle UX: expired/removed distinctions for owners, recipient-safe generic errors, revoke links, ownership checks, and optional access analytics.
- Add durable blog publishing: scheduled publication, drafts, autosave, revisions, image-library cleanup, SEO metadata, canonical URLs, Open Graph images, sitemap, RSS, categories, and authors.
- Complete Cloudinary integration with signed uploads, deletion by public ID, transformations, quotas, and orphan cleanup.
- Implement payments and the final pricing/feature matrix; remove mock upgrade hooks.
- Build and publish the Chrome extension or remove inactive store links until it exists.
- Add real About, Contact, Privacy, Terms, abuse-reporting, and takedown workflows.
- Add accessible loading, empty, offline, error, and confirmation states; complete keyboard and screen-reader testing.
- Add product analytics with privacy controls and operational metrics for conversion, retention, share creation, failures, and storage.

## Important security work

- Apply MongoDB schema validation, unique indexes, least-privilege credentials, encrypted backups, and safe query construction. Keep share payload encryption keys outside the database.
- Store only hashed session identifiers, rotate sessions after authentication/privilege changes, add device/session revocation, and define absolute plus idle expiry.
- Add recovery codes or a second admin factor; require step-up authentication for destructive owner actions.
- Persist immutable/tamper-evident audit logs with retention, export, alerting, and actor/request correlation IDs.
- Add a scheduled malware scanner and quarantine workflow for uploads; keep strict decoding, metadata stripping, MIME verification, pixel and byte limits.
- Apply endpoint-specific body limits at the reverse proxy as well as the app. A 50 MB text allowance has meaningful memory/DoS cost and should be available only where required.
- Add distributed rate limits for share resolution/enumeration, account takeover, OTP sends/verification, password unlocks, uploads, and admin endpoints.
- Add breached-password screening, password-reset throttling, email verification, and security notifications.
- Configure CSP without `unsafe-inline` by moving scripts/styles to hashed or nonce-based assets; add reporting endpoints.
- Add SSRF controls for any server-fetched URLs, including strict Cloudinary/cover-image handling and DNS/IP validation if remote fetching is introduced.
- Add secrets rotation, least-privilege Coolify service credentials, separate production/staging secrets, dependency scanning, SBOM generation, and container image scanning.
- Configure encrypted off-site backups and regularly test restoration, incident response, breach notification, and disaster recovery.

## Testing and operations

- Unit tests for authorization, plan limits, slug generation, expiry, quick burn, password gates, sanitization, and size enforcement.
- Integration tests for signup/login/admin OTP, share creation/join/unlock, Cloudinary upload/delete, billing webhooks, and admin destructive actions.
- Browser tests for desktop/mobile navigation, themes, rich-text publishing, accessibility, and failure states.
- Load and abuse tests for 50 MB submissions, slug enumeration, concurrent room access, Redis failure, and storage cleanup.
- Centralized structured logs, error tracking, uptime checks, latency/error dashboards, disk/DB/Redis/storage alerts, and on-call notifications.

## Controls already implemented in the prototype

- Server-side `isAdmin` authorization plus email OTP and verified-admin sessions.
- bcrypt account/share passwords, random hashed session tokens, HttpOnly/SameSite cookies, origin checks, security headers, and generic protected-route fallbacks.
- Redis-backed rate-limit support with a development memory fallback and production fail-closed behavior.
- Image type verification, Sharp decoding, pixel/dimension limits, metadata stripping, and clean re-encoding.
- Six-character lowercase alphanumeric/numeric share slugs with enumeration rate limiting.
- Admin audit events, share/storage inspection, kill actions, IP blocks, traffic/security signals, user disable/session invalidation, and blog management.
- Rich blog HTML sanitization, protected Cloudinary upload endpoint, published-post filtering, and dynamic blog/footer links.
- 50 MB share ceiling with client feedback, server rejection, automatic oversized-share cleanup, and system audit entries.
- MongoDB-backed users/plans and signed-in share metadata, with AES-256-GCM encrypted share payloads stored in GridFS.
