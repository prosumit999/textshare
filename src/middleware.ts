import { defineMiddleware } from "astro:middleware";
import { checkRateLimit, logSecurityEvent, rateLimitResponse } from "./lib/security";
import { getClientIp } from "./lib/security";
import { getCurrentUser, isAdminSessionVerified } from "./lib/auth";
import { isIpBlocked, recordTraffic } from "./lib/admin";
import { ADMIN_BASE_PATH } from "./lib/admin-path";
import { MAX_SHARE_BYTES, pruneOversizedShares } from "./lib/shares";

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_SHARE_REQUEST_BYTES = MAX_SHARE_BYTES + 2 * 1024 * 1024;

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const contentLength = Number(request.headers.get("content-length") || "0");
  const clientIp = getClientIp(request);
  await pruneOversizedShares();

  const renderUnavailable = async () => {
    const fallback = await context.rewrite("/expired");
    const headers = new Headers(fallback.headers);
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(fallback.body, {
      status: 404,
      statusText: "Not Found",
      headers,
    });
  };

  if (await isIpBlocked(clientIp)) {
    await logSecurityEvent("blocked_ip_rejected", request, { path: url.pathname });
    return new Response(JSON.stringify({ error: "Access denied." }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const isOwnerRoute =
    url.pathname === ADMIN_BASE_PATH ||
    url.pathname.startsWith(`${ADMIN_BASE_PATH}/`);
  if (isOwnerRoute) {
    const adminLimit = await checkRateLimit(
      request.method === "POST" ? "admin:mutation" : "admin:request",
      clientIp,
      request.method === "POST" ? 20 : 120,
      60,
    );
    if (!adminLimit.allowed) {
      await logSecurityEvent("admin_rate_limit_exceeded", request, { path: url.pathname });
      return rateLimitResponse(adminLimit.retryAfter);
    }
    const user = await getCurrentUser(context.cookies);
    if (
      !user?.isAdmin ||
      user.disabled ||
      !(await isAdminSessionVerified(context.cookies))
    ) {
      await logSecurityEvent("admin_access_rejected", request, {
        path: url.pathname,
      });
      return renderUnavailable();
    }
  }

  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    return renderUnavailable();
  }

  const requestLimit = request.method !== "POST" ? MAX_REQUEST_BYTES
    : url.pathname === "/" ? MAX_SHARE_REQUEST_BYTES
    : ["/login", "/signup", "/admin-verify", "/join"].includes(url.pathname) ? 64 * 1024
    : url.pathname === "/api/csp-report" ? 64 * 1024
    : url.pathname === "/api/admin/blog-image" ? 6 * 1024 * 1024
    : isOwnerRoute ? 1024 * 1024
    : MAX_REQUEST_BYTES;
  if (contentLength > requestLimit) {
    await logSecurityEvent("request_body_rejected", request, {
      bytes: contentLength,
      path: url.pathname,
    });
    return new Response(
      JSON.stringify({
        error:
          url.pathname === "/"
            ? "Share content cannot exceed 50 MB."
            : "Request body is too large.",
      }),
      {
        status: 413,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    url.pathname !== "/api/internal/cleanup" &&
    url.pathname !== "/api/csp-report"
  ) {
    const origin = request.headers.get("origin");
    const configuredOrigin =
      import.meta.env.APP_ORIGIN || process.env.APP_ORIGIN;
    const expectedOrigin = configuredOrigin || url.origin;
    if (
      (!origin && import.meta.env.PROD) ||
      (origin && origin !== expectedOrigin)
    ) {
      await logSecurityEvent("csrf_origin_rejected", request, { path: url.pathname });
      return new Response(
        JSON.stringify({ error: "Request origin was rejected." }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  const response = await next();
  await recordTraffic({
    ip: clientIp,
    method: request.method,
    path: url.pathname,
    status: response.status,
  });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  if (url.pathname.match(/^\/(?:[A-Za-z0-9_-]{3,64})$/)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  return response;
});
