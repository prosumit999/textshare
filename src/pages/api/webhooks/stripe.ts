import type { APIRoute } from "astro";
import { getStripe, processStripeEvent } from "../../../lib/billing";
import { serverEnv } from "../../../lib/env";

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !serverEnv.STRIPE_WEBHOOK_SECRET)
    return new Response("Webhook signature is missing.", { status: 400 });
  try {
    const rawBody = await request.text();
    const event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      serverEnv.STRIPE_WEBHOOK_SECRET,
    );
    await processStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook rejected", error);
    return new Response("Webhook rejected.", { status: 400 });
  }
};
