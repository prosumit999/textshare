import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { getMongo } from "../../src/lib/mongo";
import {
  consumeEmailVerification,
  consumeEmailChange,
  hashAccountToken,
  resetPasswordWithToken,
} from "../../src/lib/account-tokens";

const email = "recovery-test@example.com";

async function insertToken(collection: string, token: string, expiresAt: Date) {
  const { db } = await getMongo();
  await db.collection(collection).insertOne({
    email,
    tokenHash: hashAccountToken(token),
    createdAt: new Date(),
    expiresAt,
    usedAt: null,
  });
}

beforeEach(async () => {
  if (!process.env.MONGODB_URI?.includes("_test"))
    throw new Error("Recovery tests require an isolated _test database.");
  const { db } = await getMongo();
  await Promise.all([
    db.collection("users").deleteMany({ email }),
    db.collection("sessions").deleteMany({ email }),
    db.collection("emailVerificationTokens").deleteMany({ email }),
    db.collection("passwordResetTokens").deleteMany({ email }),
  ]);
  await db.collection("users").insertOne({
    name: "Recovery Test",
    email,
    passwordHash: await bcrypt.hash("OldPassword123", 12),
    createdAt: new Date(),
    plan: "free",
    isAdmin: false,
    disabled: false,
    emailVerified: false,
  });
});

describe("account email verification", () => {
  it("verifies a valid token exactly once", async () => {
    const token = "v".repeat(43);
    await insertToken(
      "emailVerificationTokens",
      token,
      new Date(Date.now() + 60_000),
    );
    expect(await consumeEmailVerification(token)).toBe(email);
    expect(await consumeEmailVerification(token)).toBeNull();
    const { db } = await getMongo();
    expect(
      (await db.collection("users").findOne({ email }))?.emailVerified,
    ).toBe(true);
  });

  it("rejects expired verification tokens", async () => {
    const token = "x".repeat(43);
    await insertToken(
      "emailVerificationTokens",
      token,
      new Date(Date.now() - 1_000),
    );
    expect(await consumeEmailVerification(token)).toBeNull();
  });
});

describe("account email changes", () => {
  it("moves account ownership and sessions using a single-use confirmation", async () => {
    const token = "c".repeat(43);
    const nextEmail = "recovery-new@example.com";
    const { db } = await getMongo();
    await db
      .collection("emailChangeTokens")
      .deleteMany({ $or: [{ oldEmail: email }, { newEmail: nextEmail }] });
    await db
      .collection("emailChangeTokens")
      .insertOne({
        oldEmail: email,
        newEmail: nextEmail,
        tokenHash: hashAccountToken(token),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });
    await db
      .collection("sessions")
      .insertOne({
        sessionId: "c".repeat(32),
        tokenHash: "d".repeat(64),
        email,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        adminVerified: false,
        createdAt: new Date(),
      });
    await db
      .collection("shares")
      .insertOne({
        slug: "mail01",
        contentType: "text",
        expiryDate: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        sizeBytes: 1,
        owner: email,
      });
    expect((await consumeEmailChange(token))?.newEmail).toBe(nextEmail);
    expect(await consumeEmailChange(token)).toBeNull();
    expect(
      await db.collection("users").findOne({ email: nextEmail }),
    ).toBeTruthy();
    expect(
      await db.collection("sessions").findOne({ email: nextEmail }),
    ).toBeTruthy();
    expect(
      await db
        .collection("shares")
        .findOne({ slug: "mail01", owner: nextEmail }),
    ).toBeTruthy();
    await Promise.all([
      db.collection("users").deleteMany({ email: nextEmail }),
      db.collection("sessions").deleteMany({ email: nextEmail }),
      db.collection("shares").deleteMany({ slug: "mail01" }),
    ]);
  });
});

describe("password reset", () => {
  it("changes the password, consumes the token, and revokes all sessions", async () => {
    const token = "r".repeat(43);
    const { db } = await getMongo();
    await db
      .collection("users")
      .updateOne({ email }, { $set: { emailVerified: true } });
    await insertToken(
      "passwordResetTokens",
      token,
      new Date(Date.now() + 60_000),
    );
    await db.collection("sessions").insertOne({
      sessionId: "a".repeat(32),
      tokenHash: "b".repeat(64),
      email,
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      adminVerified: false,
      createdAt: new Date(),
    });

    expect(await resetPasswordWithToken(token, "NewPassword456")).toBe(email);
    expect(
      await resetPasswordWithToken(token, "AnotherPassword789"),
    ).toBeNull();
    const user = await db.collection("users").findOne({ email });
    expect(await bcrypt.compare("NewPassword456", user!.passwordHash)).toBe(
      true,
    );
    expect(await db.collection("sessions").countDocuments({ email })).toBe(0);
  });

  it("rejects expired reset tokens without changing the password", async () => {
    const token = "e".repeat(43);
    await insertToken(
      "passwordResetTokens",
      token,
      new Date(Date.now() - 1_000),
    );
    expect(await resetPasswordWithToken(token, "NewPassword456")).toBeNull();
    const { db } = await getMongo();
    const user = await db.collection("users").findOne({ email });
    expect(await bcrypt.compare("OldPassword123", user!.passwordHash)).toBe(
      true,
    );
  });
});
