import bcrypt from "bcryptjs";
import { getMongo } from "./mongo";
import { getStripe } from "./billing";
import { deleteShare, listShares } from "./share-store";
import { invalidateUserSessions, normalizeEmail, type User } from "./auth";
import { sendSecurityAlert } from "./email";

export async function verifyUserPassword(user: User, password: string) {
  return bcrypt.compare(password, user.passwordHash);
}

export async function changeAccountName(user: User, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 80 || user.isAdmin) return false;
  const { db } = await getMongo();
  return (
    (
      await db
        .collection("users")
        .updateOne(
          { email: user.email, isAdmin: false },
          { $set: { name: clean } },
        )
    ).modifiedCount > 0
  );
}

export async function changeAccountPassword(
  user: User,
  currentPassword: string,
  newPassword: string,
) {
  if (user.isAdmin || !(await verifyUserPassword(user, currentPassword)))
    return false;
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const { db } = await getMongo();
  const result = await db
    .collection("users")
    .updateOne(
      { email: user.email, isAdmin: false },
      { $set: { passwordHash, passwordChangedAt: new Date() } },
    );
  if (!result.modifiedCount) return false;
  await invalidateUserSessions(user.email);
  await sendSecurityAlert(
    "Your password was changed",
    "Your TextShare password was changed from account settings and all devices were signed out.",
    user.email,
  ).catch(() => false);
  return true;
}

export async function deleteAccount(user: User, password: string) {
  if (user.isAdmin || !(await verifyUserPassword(user, password))) return false;
  if (
    user.billing?.subscriptionId &&
    !["canceled", "incomplete_expired"].includes(user.billing.status || "")
  ) {
    await getStripe().subscriptions.cancel(user.billing.subscriptionId);
  }
  // listShares is deliberately capped for UI safety, so delete in batches until
  // no owned metadata or encrypted GridFS payload remains.
  while (true) {
    const shares = await listShares(user.email);
    if (!shares.length) break;
    for (const share of shares)
      await deleteShare(String((share as { slug: string }).slug), user.email);
  }
  const { db } = await getMongo();
  await Promise.all([
    db.collection("sessions").deleteMany({ email: user.email }),
    db.collection("passwordResetTokens").deleteMany({ email: user.email }),
    db.collection("emailVerificationTokens").deleteMany({ email: user.email }),
    db
      .collection("emailChangeTokens")
      .deleteMany({
        $or: [{ oldEmail: user.email }, { newEmail: user.email }],
      }),
  ]);
  return (
    (
      await db
        .collection("users")
        .deleteOne({ email: user.email, isAdmin: false })
    ).deletedCount > 0
  );
}

export async function exportAccountData(user: User) {
  const { db } = await getMongo();
  const [shares, sessions] = await Promise.all([
    db
      .collection("shares")
      .find(
        { owner: user.email },
        {
          projection: { _id: 0, contentFileId: 0, passwordHash: 0, guestIp: 0 },
        },
      )
      .sort({ createdAt: -1 })
      .toArray(),
    db
      .collection("sessions")
      .find({ email: user.email }, { projection: { _id: 0, tokenHash: 0 } })
      .toArray(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      plan: user.plan,
      billing: user.billing
        ? {
            provider: user.billing.provider,
            interval: user.billing.interval,
            status: user.billing.status,
            currentPeriodEnd: user.billing.currentPeriodEnd,
            cancelAtPeriodEnd: user.billing.cancelAtPeriodEnd,
          }
        : null,
    },
    shares,
    sessions,
  };
}
