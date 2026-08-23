import type { APIRoute } from "astro";
import { getCurrentUser } from "../../../lib/auth";
import { exportAccountData } from "../../../lib/account-management";
import { checkRateLimit, rateLimitResponse } from "../../../lib/security";
export const GET: APIRoute = async ({ cookies }) => {
  const user = await getCurrentUser(cookies);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const limit = await checkRateLimit("account:export", user.email, 5, 3600);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  return new Response(JSON.stringify(await exportAccountData(user), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="textshare-account-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
};
