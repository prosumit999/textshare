import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { getMongo } from "../../src/lib/mongo";
import {
  planForPriceId,
  priceIdForPlan,
  processStripeEvent,
  syncSubscription,
} from "../../src/lib/billing";
import { POST as stripeWebhook } from "../../src/pages/api/webhooks/stripe";

const email = "billing-test@example.com";

function subscription(status: Stripe.Subscription.Status, id = "sub_textshare") {
  return {
    id,
    object: "subscription",
    customer: "cus_textshare",
    status,
    cancel_at_period_end: false,
    metadata: { textshareUserEmail: email, textsharePlan: "annual" },
    items: {
      data: [{ price: { id: process.env.STRIPE_ANNUAL_PRICE_ID }, current_period_end: 1893456000 }],
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(async () => {
  if (!process.env.MONGODB_URI?.includes("_test"))
    throw new Error("Billing tests require an isolated _test database.");
  const { db } = await getMongo();
  await Promise.all([
    db.collection("users").deleteMany({ email }),
    db.collection("stripeEvents").deleteMany({}),
  ]);
  await db.collection("users").insertOne({
    name: "Billing Test",
    email,
    passwordHash: "test-only",
    createdAt: new Date(),
    plan: "free",
    isAdmin: false,
    disabled: false,
  });
});

describe("Stripe billing persistence", () => {
  it("maps only configured price IDs", () => {
    expect(priceIdForPlan("monthly")).toBe("price_textshare_monthly");
    expect(priceIdForPlan("annual")).toBe("price_textshare_annual");
    expect(planForPriceId("price_textshare_annual")).toBe("annual");
    expect(planForPriceId("price_attacker_controlled")).toBeNull();
  });

  it("grants and revokes Pro from subscription state", async () => {
    const { db } = await getMongo();
    await syncSubscription(subscription("active"));
    let user = await db.collection("users").findOne({ email });
    expect(user?.plan).toBe("pro");
    expect(user?.billing.subscriptionId).toBe("sub_textshare");
    expect(user?.billing.interval).toBe("annual");

    await syncSubscription(subscription("canceled"));
    user = await db.collection("users").findOne({ email });
    expect(user?.plan).toBe("free");
    expect(user?.billing.status).toBe("canceled");
  });

  it("never grants Pro for an unrecognized client-controlled price", async () => {
    const unknown = subscription("active", "sub_unknown_price") as unknown as {
      items: { data: Array<{ price: { id: string } }> };
    };
    unknown.items.data[0].price.id = "price_attacker_controlled";
    await expect(syncSubscription(unknown as unknown as Stripe.Subscription)).rejects.toThrow(
      "unrecognized price",
    );
    const { db } = await getMongo();
    expect((await db.collection("users").findOne({ email }))?.plan).toBe("free");
  });

  it("processes a webhook event idempotently", async () => {
    const event = {
      id: "evt_duplicate_test",
      object: "event",
      type: "test_helpers.test_clock.created",
      data: { object: {} },
    } as unknown as Stripe.Event;
    expect(await processStripeEvent(event)).toEqual({ duplicate: false });
    expect(await processStripeEvent(event)).toEqual({ duplicate: true });
  });

  it("rejects invalid signatures and accepts a valid signed event", async () => {
    const payload = JSON.stringify({
      id: "evt_signed_test",
      object: "event",
      type: "test_helpers.test_clock.created",
      data: { object: {} },
    });
    const invalid = await stripeWebhook!({
      request: new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": "invalid" },
      }),
    } as never);
    expect(invalid.status).toBe(400);

    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const valid = await stripeWebhook!({
      request: new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": signature },
      }),
    } as never);
    expect(valid.status).toBe(200);
  });
});
