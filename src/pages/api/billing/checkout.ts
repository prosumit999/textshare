import type { APIRoute } from "astro";
import { getCurrentUser } from "../../../lib/auth";
import { createCheckout, type BillingPlan } from "../../../lib/billing";
import { checkRateLimit, rateLimitResponse } from "../../../lib/security";

export const POST: APIRoute = async ({ cookies, request, url }) => {
  const user = await getCurrentUser(cookies);
  if (!user)
    return Response.json(
      { error: "Sign in before upgrading." },
      { status: 401 },
    );
  if (!user.emailVerified)
    return Response.json(
      { error: "Verify your email before upgrading." },
      { status: 403 },
    );
  const limit = await checkRateLimit(
    "billing:checkout",
    user.email,
    10,
    10 * 60,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

  const body = (await request.json().catch(() => null)) as {
    plan?: string;
  } | null;
  const plan = body?.plan;
  if (plan !== "monthly" && plan !== "annual")
    return Response.json(
      { error: "Choose a valid billing plan." },
      { status: 400 },
    );
  try {
    const session = await createCheckout(user, plan as BillingPlan, url.origin);
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout creation failed", error);
    return Response.json(
      { error: "Checkout could not be started. Try again shortly." },
      { status: 503 },
    );
  }
};
