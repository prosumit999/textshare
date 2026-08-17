import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getMongo } from "./mongo";
import { invalidateUserSessions, normalizeEmail, type User } from "./auth";
import {
  sendEmailChangeVerification,
  sendEmailVerification,
  sendPasswordReset,
  sendSecurityAlert,
} from "./email";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

type AccountToken = {
  email: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export function hashAccountToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicToken() {
  return randomBytes(32).toString("base64url");
}

function appOrigin(origin: string) {
  return (process.env.APP_ORIGIN || origin).replace(/\/$/, "");
}

export async function issueEmailVerification(rawEmail: string, origin: string) {
  const email = normalizeEmail(rawEmail);
  const { db } = await getMongo();
  const user = await db
    .collection<User>("users")
    .findOne({ email, disabled: false });
  if (!user || user.emailVerified) return false;
  const token = publicToken();
  const now = new Date();
  await db
    .collection("emailVerificationTokens")
    .deleteMany({ email, usedAt: null });
  await db.collection<AccountToken>("emailVerificationTokens").insertOne({
    email,
    tokenHash: hashAccountToken(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
    usedAt: null,
  });
  try {
    await sendEmailVerification(
      email,
      `${appOrigin(origin)}/verify-email?token=${encodeURIComponent(token)}`,
    );
    return true;
  } catch (error) {
    await db
      .collection("emailVerificationTokens")
      .deleteOne({ tokenHash: hashAccountToken(token) });
    throw error;
  }
}

export async function consumeEmailVerification(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const { db } = await getMongo();
  const now = new Date();
  const claimed = await db
    .collection<AccountToken>("emailVerificationTokens")
    .findOneAndUpdate(
      {
        tokenHash: hashAccountToken(token),
        usedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
      { returnDocument: "after" },
    );
  if (!claimed) return null;
  const result = await db
    .collection<User>("users")
    .updateOne(
      { email: claimed.email, disabled: false },
      { $set: { emailVerified: true } },
    );
  return result.matchedCount ? claimed.email : null;
}

export async function issuePasswordReset(rawEmail: string, origin: string) {
  const email = normalizeEmail(rawEmail);
  const { db } = await getMongo();
  const user = await db.collection<User>("users").findOne({
    email,
    disabled: false,
    // Accounts created before verification was introduced are treated as
    // verified; every newly-created account explicitly stores false.
    emailVerified: { $ne: false },
    isAdmin: false,
  });
  if (!user) return false;
  const token = publicToken();
  const now = new Date();
  await db
    .collection("passwordResetTokens")
    .deleteMany({ email, usedAt: null });
  await db.collection<AccountToken>("passwordResetTokens").insertOne({
    email,
    tokenHash: hashAccountToken(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
    usedAt: null,
  });
  try {
    await sendPasswordReset(
      email,
      `${appOrigin(origin)}/reset-password?token=${encodeURIComponent(token)}`,
    );
    return true;
  } catch (error) {
    await db
      .collection("passwordResetTokens")
      .deleteOne({ tokenHash: hashAccountToken(token) });
    throw error;
  }
}

export async function resetPasswordWithToken(token: string, password: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const { db } = await getMongo();
  const now = new Date();
  const claimed = await db
    .collection<AccountToken>("passwordResetTokens")
    .findOneAndUpdate(
      {
        tokenHash: hashAccountToken(token),
        usedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
      { returnDocument: "after" },
    );
  if (!claimed) return null;
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db
    .collection<User>("users")
    .updateOne(
      { email: claimed.email, disabled: false, isAdmin: false },
      { $set: { passwordHash, passwordChangedAt: now } },
    );
  if (!result.matchedCount) return null;
  await invalidateUserSessions(claimed.email);
  await sendSecurityAlert(
    "Your password was changed",
    "Your TextShare password was reset and all signed-in devices were logged out. If this was not you, contact support immediately.",
    claimed.email,
  ).catch(() => false);
  return claimed.email;
}

export async function issueEmailChange(
  oldRawEmail: string,
  newRawEmail: string,
  origin: string,
) {
  const oldEmail = normalizeEmail(oldRawEmail);
  const newEmail = normalizeEmail(newRawEmail);
  if (oldEmail === newEmail) return false;
  const { db } = await getMongo();
  if (await db.collection("users").findOne({ email: newEmail })) return false;
  const token = publicToken();
  const now = new Date();
  await db
    .collection("emailChangeTokens")
    .deleteMany({ oldEmail, usedAt: null });
  await db.collection("emailChangeTokens").insertOne({
    oldEmail,
    newEmail,
    tokenHash: hashAccountToken(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
    usedAt: null,
  });
  try {
    await sendEmailChangeVerification(
      newEmail,
      `${appOrigin(origin)}/confirm-email-change?token=${encodeURIComponent(token)}`,
    );
    return true;
  } catch (error) {
    await db
      .collection("emailChangeTokens")
      .deleteOne({ tokenHash: hashAccountToken(token) });
    throw error;
  }
}

export async function consumeEmailChange(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const { db } = await getMongo();
  const now = new Date();
  const claimed = await db.collection("emailChangeTokens").findOneAndUpdate(
    {
      tokenHash: hashAccountToken(token),
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { returnDocument: "after" },
  );
  if (!claimed) return null;
  if (await db.collection("users").findOne({ email: claimed.newEmail }))
    return null;
  const existing = await db
    .collection<User>("users")
    .findOne({ email: claimed.oldEmail });
  const result = await db.collection("users").updateOne(
    { email: claimed.oldEmail, disabled: false, isAdmin: false },
    {
      $set: {
        email: claimed.newEmail,
        emailVerified: true,
        emailChangedAt: now,
      },
    },
  );
  if (!result.modifiedCount) return null;
  await Promise.all([
    db
      .collection("sessions")
      .updateMany(
        { email: claimed.oldEmail },
        { $set: { email: claimed.newEmail } },
      ),
    db
      .collection("shares")
      .updateMany(
        { owner: claimed.oldEmail },
        { $set: { owner: claimed.newEmail } },
      ),
    db
      .collection("passwordResetTokens")
      .deleteMany({ email: claimed.oldEmail }),
    db
      .collection("emailVerificationTokens")
      .deleteMany({ email: claimed.oldEmail }),
  ]);
  if (existing?.billing?.customerId) {
    const { getStripe } = await import("./billing");
    await getStripe()
      .customers.update(existing.billing.customerId, {
        email: claimed.newEmail,
      })
      .catch(() => undefined);
  }
  await sendSecurityAlert(
    "Account email changed",
    `Your TextShare account email was changed to ${claimed.newEmail}. If this was not you, contact support immediately.`,
    claimed.oldEmail,
  ).catch(() => false);
  return {
    oldEmail: claimed.oldEmail as string,
    newEmail: claimed.newEmail as string,
  };
}
