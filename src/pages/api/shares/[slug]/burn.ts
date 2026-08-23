import type { APIRoute } from "astro";
import { consumeBurnShare } from "../../../../lib/share-store";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../../../lib/security";

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug || "";
  if (
    request.headers.get("x-textshare-burn") !== "1" ||
    !/^[a-z0-9]{6}$/.test(slug)
  ) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const limit = await checkRateLimit(
    "share:burn",
    `${getClientIp(request)}:${slug}`,
    10,
    60,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const consumed = await consumeBurnShare(slug);
  return new Response(null, {
    status: consumed ? 204 : 404,
    headers: { "Cache-Control": "no-store" },
  });
};
