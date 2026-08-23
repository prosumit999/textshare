# Stripe setup for TextShare

## 1. Create recurring prices

In Stripe test mode, create one `TextShare Pro` product with two USD recurring prices:

- `$3.00` every month
- `$20.00` every year

Copy both `price_...` identifiers into Coolify.

## 2. Configure secrets

Set these environment variables in Coolify and redeploy:

```env
APP_ORIGIN=https://your-domain.example
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_ANNUAL_PRICE_ID=price_...
```

Use `sk_live_...` and the live webhook secret only after the complete test-mode flow passes.
Never expose the secret key or webhook secret through public/client environment variables.

## 3. Register the webhook

Create a Stripe webhook endpoint pointing to:

```text
https://your-domain.example/api/webhooks/stripe
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy that endpoint's signing secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET`.

## 4. Enable the Customer Portal

Configure Stripe's Customer Portal with payment-method updates and subscription
cancellation. Pro users can then open it from their TextShare profile.

## 5. Test locally

With the Stripe CLI installed and authenticated:

```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
npm run dev
```

Use the webhook signing secret printed by `stripe listen` in the local `.env`.
Run automated billing tests with:

```bash
npm run test:integration
```

The browser success redirect does not grant Pro. Only a verified Stripe webhook
updates subscription access in MongoDB.
