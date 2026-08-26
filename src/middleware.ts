import { randomBytes } from 'node:crypto';
import { defineMiddleware } from 'astro:middleware';
import { logSecurityEvent } from './lib/security';
import { getClientIp } from './lib/security';
import { getCurrentUser, isAdminSessionVerified } from './lib/auth';
import { isIpBlocked, recordTraffic } from './lib/admin';
import { ADMIN_BASE_PATH } from './lib/admin-path';
import { MAX_SHARE_BYTES, pruneOversizedShares } from './lib/shares';

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_SHARE_REQUEST_BYTES = MAX_SHARE_BYTES + 2 * 1024 * 1024;

// Internal liveness endpoint used by the Docker HEALTHCHECK and Coolify.
// Requests originate inside the container with no proxy headers, so the
// resolved client IP is "unknown"; it must not be subject to IP blocking.
const HEALTH_CHECK_PATH = '/api/health';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const contentLength = Number(request.headers.get('content-length') || '0');
  const clientIp = getClientIp(request);

  await pruneOversizedShares();

  const renderUnavailable = async () => {
    const fallback = await context.rewrite('/expired');
    const headers = new Headers(fallback.headers);

    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(fallback.body, {
      status: 404,
      statusText: 'Not Found',
      headers
    });
  };

  if (
    url.pathname !== HEALTH_CHECK_PATH &&
    (await isIpBlocked(clientIp))
  ) {
    logSecurityEvent('blocked_ip_rejected', request, {
      path: url.pathname
    });

    return new Response(
      JSON.stringify({ error: 'Access denied.' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  const isOwnerRoute =
    url.pathname === ADMIN_BASE_PATH ||
    url.pathname.startsWith(`${ADMIN_BASE_PATH}/`);

  if (isOwnerRoute) {
    const user = await getCurrentUser(context.cookies);

    if (
      !user?.isAdmin ||
      user.disabled ||
      !isAdminSessionVerified(context.cookies)
    ) {
      logSecurityEvent('admin_access_rejected', request, {
        path: url.pathname
      });

      return renderUnavailable();
    }
  }

  if (
    url.pathname === '/admin' ||
    url.pathname.startsWith('/admin/')
  ) {
    return renderUnavailable();
  }

  const requestLimit =
    request.method === 'POST' && url.pathname === '/'
      ? MAX_SHARE_REQUEST_BYTES
      : MAX_REQUEST_BYTES;

  if (contentLength > requestLimit) {
    logSecurityEvent('request_body_rejected', request, {
      bytes: contentLength,
      path: url.pathname
    });

    return new Response(
      JSON.stringify({
        error:
          url.pathname === '/'
            ? 'Share content cannot exceed 50 MB.'
            : 'Request body is too large.'
      }),
      {
        status: 413,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');

    const configuredOrigin =
      import.meta.env.APP_ORIGIN || process.env.APP_ORIGIN;

    const expectedOrigin = configuredOrigin || url.origin;

    if (
      (!origin && import.meta.env.PROD) ||
      (origin && origin !== expectedOrigin)
    ) {
      logSecurityEvent('csrf_origin_rejected', request, {
        path: url.pathname
      });

      return new Response(
        JSON.stringify({
          error: 'Request origin was rejected.'
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        }
      );
    }
  }

  const response = await next();

  recordTraffic({
    ip: clientIp,
    method: request.method,
    path: url.pathname,
    status: response.status
  });

  response.headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  response.headers.set(
    'X-Frame-Options',
    'DENY'
  );

  response.headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  response.headers.set(
    'Cross-Origin-Opener-Policy',
    'same-origin'
  );

  response.headers.set(
    'Cross-Origin-Resource-Policy',
    'same-origin'
  );

  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );

  // Content-Security-Policy is the single security policy for the app
  // (Astro's built-in security.csp is disabled in astro.config.mjs). A
  // per-request nonce covers first-party inline scripts, which the middleware
  // injects into the HTML below, and Cloudflare's edge-injected inline scripts
  // (JS Detections): Cloudflare parses the CSP response header and copies the
  // nonce onto the scripts it injects. This is the mechanism Cloudflare
  // documents for inline scripts and avoids a blanket 'unsafe-inline'.
  const nonce = randomBytes(18).toString('base64url');

  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://www.google-analytics.com https://www.googletagmanager.com; frame-src https://challenges.cloudflare.com; report-uri /api/csp-report; upgrade-insecure-requests`
  );

  if (url.pathname.match(/^\/(?:[A-Za-z0-9_-]{3,64})$/)) {
    response.headers.set(
      'Cache-Control',
      'private, no-store, max-age=0'
    );
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/html')) {
    // Buffer the page and add the nonce to every script element so Astro's
    // inlined module scripts keep executing under the nonce-based policy.
    const html = await response.text();
    const nonced = html.replace(
      /<script(?![^>]*\bnonce=)/gi,
      (tag) => `${tag} nonce="${nonce}"`
    );

    response.headers.delete('content-length');

    return new Response(nonced, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  return response;
});