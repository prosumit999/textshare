import { getMongo } from "./mongo";
import { randomUUID } from "node:crypto";
import { slugify } from "./admin";

export type CustomPage = {
  id: string;
  title: string;
  slug: string;
  eyebrow: string;
  summary: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

const defaultSeedPages: Omit<CustomPage, 'createdAt' | 'updatedAt'>[] = [
  {
    id: "privacy",
    title: "Privacy Policy",
    slug: "privacy",
    eyebrow: "Privacy",
    summary: "How TextShare handles account and shared data.",
    content: `<section><h2>Information we process</h2><p>We process account name, email, password hash, subscription status, security/session records, share metadata and encrypted share payloads. We also record limited IP, request and abuse signals needed for security and rate limiting.</p></section>
<section><h2>Why we process it</h2><p>Data is used to provide sharing, authenticate users, process subscriptions, prevent abuse, deliver support and meet legal obligations. We do not sell personal information.</p></section>
<section><h2>Storage and retention</h2><p>Share payloads are encrypted at rest and removed after expiry, burn-after-view, user deletion or administrative abuse action. Account and billing records remain while the account exists and as required for fraud, tax, dispute and legal records. Security logs have limited retention.</p></section>
<section><h2>Service providers</h2><p>MongoDB stores application records, Stripe processes payments, email infrastructure delivers account messages, and hosting/network providers deliver the service. Each receives only the information required for its role.</p></section>
<section><h2>Your choices</h2><p>Account Settings lets you correct your name or email, export account metadata and delete your account. You may also contact us to request access, correction or deletion where applicable.</p></section>
<section><h2>International processing and security</h2><p>Providers may process information in other countries under their safeguards. No system is perfectly secure, but TextShare uses encryption, hashed credentials, short-lived tokens, access controls and monitoring to reduce risk.</p></section>
<section><h2>Contact</h2><p>Use the <a href="/contact">contact page</a> for privacy requests. We may need to verify your identity before acting.</p></section>`
  },
  {
    id: "terms",
    title: "Terms of Service",
    slug: "terms",
    eyebrow: "Legal",
    summary: "The rules that keep TextShare useful, temporary, and safe for everyone.",
    content: `<section><h2>1. Agreement and eligibility</h2><p>By using TextShare, you agree to these Terms and our Acceptable Use and Privacy policies. You must be legally able to enter this agreement and provide accurate account information.</p></section>
<section><h2>2. The service</h2><p>TextShare provides temporary links for text, code and supported images. Expiry and burn-after-view reduce availability but do not guarantee that a recipient has not copied content. Keep your own backups of anything important.</p></section>
<section><h2>3. Accounts and security</h2><p>You are responsible for your credentials, activity and recipients. Notify us through the contact page if you suspect unauthorized access. We may suspend accounts that threaten the service or other users.</p></section>
<section><h2>4. Paid subscriptions</h2><p>Pro subscriptions renew monthly or annually until cancelled. Prices and the billing interval are shown before checkout. Stripe processes payments; TextShare does not store complete card details. Cancellation and refund rules are described in our Refund Policy.</p></section>
<section><h2>5. Your content</h2><p>You retain ownership of your content and grant TextShare the limited rights required to encrypt, store, transmit and delete it as requested. You confirm that you have permission to share it.</p></section>
<section><h2>6. Availability and liability</h2><p>The service is provided on an “as available” basis. To the extent permitted by law, TextShare is not liable for indirect or consequential loss, lost copies, recipient actions or interruption. Nothing here excludes rights that cannot legally be excluded.</p></section>
<section><h2>7. Changes and contact</h2><p>Material changes will be posted with a new effective date. Continued use after changes means acceptance. Questions can be sent through our <a href="/contact">support page</a>.</p></section>`
  },
  {
    id: "refund-policy",
    title: "Refund & cancellation",
    slug: "refund-policy",
    eyebrow: "Billing",
    summary: "Simple subscription terms with clear control over renewal.",
    content: `<section><h2>Cancel anytime</h2><p>You can cancel from Profile → Billing & invoices. Cancellation normally takes effect at the end of the paid billing period, and Pro remains available until that date.</p></section>
<section><h2>Refund requests</h2><p>Subscription charges are generally non-refundable once a billing period begins. If you were charged because of a technical error, duplicate payment, or service failure, contact us within 7 days. We review eligible requests individually and do not limit mandatory consumer rights.</p></section>
<section><h2>Renewals and failed payments</h2><p>Subscriptions renew automatically using the payment method held by Stripe. Failed payments may place the subscription into a pending or past-due state and restrict Pro access until payment succeeds.</p></section>
<section><h2>Account deletion</h2><p>Deleting an account cancels an active Stripe subscription before application data is removed. Deletion does not itself create a refund for the current period.</p></section>
<section><h2>How to request help</h2><p>Use our <a href="/contact">support form</a> and include the account email, charge date and a short explanation. Never send full card details.</p></section>`
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use Policy",
    slug: "acceptable-use",
    eyebrow: "Trust & safety",
    summary: "Share useful things—not harm, exploitation, malware or abuse.",
    content: `<section><h2>Prohibited content and conduct</h2><p>Do not use TextShare for illegal material, sexual exploitation, credible threats, harassment, non-consensual intimate material, stolen credentials, doxxing, fraud, phishing, spam, malware, command-and-control infrastructure, or content that infringes another person’s rights.</p></section>
<section><h2>Security boundaries</h2><p>Do not probe, scrape, overload, enumerate links, bypass access controls or interfere with other users. Authorized security research requires prior written permission.</p></section>
<section><h2>Enforcement</h2><p>We may remove shares, rate-limit traffic, block addresses, suspend accounts, preserve evidence or report activity when reasonably necessary to protect users, comply with law or enforce this policy.</p></section>
<section><h2>Reporting abuse</h2><p>Report a room through the <a href="/contact">contact page</a> with the link and reason. Do not include passwords or reproduce harmful content in the report.</p></section>`
  }
];

let pagesSeededPromise: Promise<void> | null = null;
async function ensurePagesSeeded() {
  if (!pagesSeededPromise) {
    pagesSeededPromise = (async () => {
      const { db } = await getMongo();
      const count = await db.collection("pages").countDocuments();
      if (count === 0) {
        const now = new Date();
        const docs = defaultSeedPages.map(page => ({
          ...page,
          createdAt: now,
          updatedAt: now
        }));
        await db.collection("pages").insertMany(docs);
      }
    })();
  }
  return pagesSeededPromise;
}

export async function getPage(id: string): Promise<CustomPage | null> {
  await ensurePagesSeeded();
  const { db } = await getMongo();
  return db.collection<CustomPage>("pages").findOne({ id });
}

export async function getPageBySlug(slug: string): Promise<CustomPage | null> {
  await ensurePagesSeeded();
  const { db } = await getMongo();
  return db.collection<CustomPage>("pages").findOne({ slug });
}

export async function listPages(): Promise<CustomPage[]> {
  await ensurePagesSeeded();
  const { db } = await getMongo();
  return db.collection<CustomPage>("pages").find({}).sort({ updatedAt: -1 }).toArray();
}

export async function savePage(input: Omit<CustomPage, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const now = new Date();
  await ensurePagesSeeded();
  const { db } = await getMongo();
  const collection = db.collection<CustomPage>("pages");
  const existing = input.id ? await collection.findOne({ id: input.id }) : null;
  const page: CustomPage = {
    ...input,
    id: existing?.id || randomUUID(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await collection.replaceOne({ id: page.id }, page, { upsert: true });
  return page;
}

export async function deletePage(id: string): Promise<boolean> {
  await ensurePagesSeeded();
  const { db } = await getMongo();
  return (await db.collection("pages").deleteOne({ id })).deletedCount > 0;
}
