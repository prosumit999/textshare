import Stripe from "stripe";
import { getMongo } from "./mongo";
import { serverEnv } from "./env";
import { normalizeEmail, type User } from "./auth";

export type BillingPlan = "monthly" | "annual";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!serverEnv.STRIPE_SECRET_KEY)
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  stripeClient ||= new Stripe(serverEnv.STRIPE_SECRET_KEY);
  return stripeClient;
}

export function priceIdForPlan(plan: BillingPlan) {
  const priceId =
    plan === "annual"
      ? serverEnv.STRIPE_ANNUAL_PRICE_ID
      : serverEnv.STRIPE_MONTHLY_PRICE_ID;
  if (!priceId) throw new Error(`Stripe ${plan} price is not configured.`);
  return priceId;
}

export function planForPriceId(priceId?: string | null): BillingPlan | null {
  if (priceId && priceId === serverEnv.STRIPE_MONTHLY_PRICE_ID)
    return "monthly";
  if (priceId && priceId === serverEnv.STRIPE_ANNUAL_PRICE_ID) return "annual";
  return null;
}

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}

export async function createCheckout(
  user: User,
  plan: BillingPlan,
  origin: string,
) {
  const stripe = getStripe();
  const { db } = await getMongo();
  const current = await db
    .collection<User>("users")
    .findOne({ email: user.email });
  let customerId = current?.billing?.customerId || null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { textshareUserEmail: user.email },
    });
    customerId = customer.id;
    await db.collection("users").updateOne(
      { email: user.email },
      {
        $set: {
          "billing.provider": "stripe",
          "billing.customerId": customerId,
        },
      },
    );
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    success_url: `${serverEnv.APP_ORIGIN || origin}/profile?checkout=success`,
    cancel_url: `${serverEnv.APP_ORIGIN || origin}/?pricing=1&checkout=cancelled`,
    allow_promotion_codes: true,
    client_reference_id: user.email,
    metadata: { textshareUserEmail: user.email, textsharePlan: plan },
    subscription_data: {
      metadata: { textshareUserEmail: user.email, textsharePlan: plan },
    },
  });
}

export async function createPortal(user: User, origin: string) {
  const stripe = getStripe();
  const { db } = await getMongo();
  const stored = await db
    .collection<User>("users")
    .findOne({ email: user.email });
  const customerId = stored?.billing?.customerId;
  if (!customerId)
    throw new Error("No Stripe billing account exists for this user.");
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${serverEnv.APP_ORIGIN || origin}/profile?billing=updated`,
  });
}

export async function syncSubscription(subscription: Stripe.Subscription) {
  const { db } = await getMongo();
  const raw = subscription as Stripe.Subscription & {
    current_period_end?: number;
    current_period_start?: number;
  };
  const item = subscription.items.data[0];
  const itemRaw = item as typeof item & {
    current_period_end?: number;
    current_period_start?: number;
  };
  const periodEnd = raw.current_period_end || itemRaw.current_period_end;
  const periodStart = raw.current_period_start || itemRaw.current_period_start;
  const status = subscription.status;
  const active = status === "active" || status === "trialing";
  const customerId = stripeId(subscription.customer);
  const email = normalizeEmail(subscription.metadata.textshareUserEmail || "");
  const priceId = item?.price?.id;
  const plan = planForPriceId(priceId);
  if (!plan)
    throw new Error(
      `Stripe subscription ${subscription.id} uses an unrecognized price.`,
    );
  // Customer IDs remain stable when a user changes their TextShare email.
  const billingUpdate = {
    $set: {
      plan: active ? "pro" : "free",
      "billing.provider": "stripe",
      "billing.customerId": customerId,
      "billing.subscriptionId": subscription.id,
      "billing.priceId": priceId || null,
      "billing.interval": plan,
      "billing.status": status,
      "billing.currentPeriodStart": periodStart
        ? new Date(periodStart * 1000)
        : null,
      "billing.currentPeriodEnd": periodEnd ? new Date(periodEnd * 1000) : null,
      "billing.cancelAtPeriodEnd": subscription.cancel_at_period_end,
      "billing.updatedAt": new Date(),
    },
  };
  const lookup = customerId
    ? { "billing.customerId": customerId }
    : email
      ? { email }
      : { "billing.subscriptionId": subscription.id };
  const result = await db.collection("users").updateOne(lookup, billingUpdate);
  if (!result.matchedCount && customerId && email)
    await db.collection("users").updateOne({ email }, billingUpdate);
}

export async function processStripeEvent(event: Stripe.Event) {
  const stripe = getStripe();
  const { db } = await getMongo();
  const events = db.collection("stripeEvents");
  const previous = await events.findOne({ eventId: event.id, processed: true });
  if (previous) return { duplicate: true };
  await events.updateOne(
    { eventId: event.id },
    { $set: { type: event.type, processed: false, receivedAt: new Date() } },
    { upsert: true },
  );

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = stripeId(session.subscription);
      if (subscriptionId)
        await syncSubscription(
          await stripe.subscriptions.retrieve(subscriptionId),
        );
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      const legacySubscription = (
        invoice as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        }
      ).subscription;
      const subscriptionId = stripeId(
        invoice.parent?.subscription_details?.subscription ||
          legacySubscription,
      );
      if (subscriptionId)
        await syncSubscription(
          await stripe.subscriptions.retrieve(subscriptionId),
        );
    }
    await events.updateOne(
      { eventId: event.id },
      { $set: { processed: true, processedAt: new Date() } },
    );
    return { duplicate: false };
  } catch (error) {
    await events.deleteOne({ eventId: event.id, processed: false });
    throw error;
  }
}
