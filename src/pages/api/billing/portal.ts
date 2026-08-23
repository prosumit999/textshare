import type { APIRoute } from "astro";
import { getCurrentUser } from "../../../lib/auth";
import { createPortal } from "../../../lib/billing";
import { checkRateLimit, rateLimitResponse } from "../../../lib/security";

export const POST: APIRoute = async ({ cookies, url, redirect }) => {
  const user = await getCurrentUser(cookies);
  if (!user) return redirect("/login", 303);
  const limit = await checkRateLimit("billing:portal", user.email, 10, 10 * 60);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  try {
    const session = await createPortal(user, url.origin);
    return redirect(session.url, 303);
  } catch (error) {
    console.error("Stripe portal creation failed", error);
    return redirect("/profile?billing=unavailable", 303);
  }
};
