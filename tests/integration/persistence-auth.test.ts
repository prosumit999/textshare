import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { getMongo } from "../../src/lib/mongo";
import {
  deleteShare,
  getShare,
  hasShare,
  saveShare,
} from "../../src/lib/share-store";
import { runCleanupWorker } from "../../src/lib/cleanup";
import {
  createSession,
  hasRecentAdminStepUp,
  isAdminSessionVerified,
  type User,
} from "../../src/lib/auth";
import {
  completeAdminVerification,
  generateAdminRecoveryCodes,
} from "../../src/lib/admin-auth";

class CookieJar {
  values = new Map<string, string>();
  get(name: string) {
    const value = this.values.get(name);
    return value ? { value } : undefined;
  }
  has(name: string) {
    return this.values.has(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}
const baseShare = (overrides: Record<string, unknown> = {}) => ({
  contentType: "text" as const,
  textContent: "persisted secret text",
  imageSrc: null,
  imageSrcs: [],
  expiryDate: new Date(Date.now() + 3600_000),
  burnAfterReading: false,
  language: "plaintext",
  passwordHash: null,
  owner: null,
  guestIp: "127.0.0.1",
  sizeBytes: 21,
  createdAt: new Date(),
  viewCount: 0,
  ...overrides,
});

beforeAll(async () => {
  if (!process.env.MONGODB_URI?.includes("_test"))
    throw new Error("Integration tests require a _test database.");
  await getMongo();
});
beforeEach(async () => {
  const { db, bucket } = await getMongo();
  for (const name of [
    "shares",
    "sessions",
    "adminChallenges",
    "adminRecoveryCodes",
    "auditLogs",
    "systemAuditLogs",
    "workerLocks",
    "counters",
  ])
    await db.collection(name).deleteMany({});
  for (const file of await db
    .collection("sharePayloads.files")
    .find({})
    .toArray())
    await bucket.delete(file._id as any).catch(() => undefined);
});

describe("durable encrypted shares", () => {
  it("persists guest content encrypted in GridFS", async () => {
    await saveShare("abc123", baseShare());
    expect(await hasShare("abc123")).toBe(true);
    expect((await getShare("abc123"))?.textContent).toBe(
      "persisted secret text",
    );
    const { db, bucket } = await getMongo();
    const row = await db.collection("shares").findOne({ slug: "abc123" });
    const chunks: Buffer[] = [];
    for await (const chunk of bucket.openDownloadStream(row!.contentFileId))
      chunks.push(Buffer.from(chunk));
    expect(
      Buffer.concat(chunks).includes(Buffer.from("persisted secret text")),
    ).toBe(false);
  });
  it("decrypts existing payloads after key rotation", async () => {
    process.env.SHARE_ENCRYPTION_KEYS = "old-key";
    await saveShare("rotate1", baseShare());
    process.env.SHARE_ENCRYPTION_KEYS = "new-key,old-key";
    expect((await getShare("rotate1"))?.textContent).toBe(
      "persisted secret text",
    );
  });
  it("removes expired payloads in the cleanup worker", async () => {
    await saveShare(
      "expire1",
      baseShare({ expiryDate: new Date(Date.now() - 1000) }),
    );
    const report = await runCleanupWorker();
    expect(report.expiredShares).toBe(1);
    expect(await getShare("expire1")).toBeNull();
  });
});

describe("authorization and admin verification", () => {
  const admin: User = {
    name: "Admin",
    email: "admin-test@example.com",
    passwordHash: "unused",
    createdAt: new Date(),
    plan: "pro",
    isAdmin: true,
    disabled: false,
    emailVerified: true,
  };
  it("distinguishes normal and recently step-up verified sessions", async () => {
    const normal = new CookieJar();
    await createSession(normal as any, { ...admin, isAdmin: false });
    expect(await isAdminSessionVerified(normal as any)).toBe(false);
    const verified = new CookieJar();
    await createSession(verified as any, admin, { adminVerified: true });
    expect(await isAdminSessionVerified(verified as any)).toBe(true);
    expect(await hasRecentAdminStepUp(verified as any)).toBe(true);
  });
  it("accepts an OTP once and creates a verified admin session", async () => {
    const cookies = new CookieJar();
    const token = "challenge-token";
    const code = "123456";
    cookies.set("admin_challenge", token);
    const { db } = await getMongo();
    await db.collection("adminChallenges").insertOne({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      email: admin.email,
      codeHash: await bcrypt.hash(code, 4),
      expiresAt: Date.now() + 60_000,
      attempts: 0,
      createdAt: new Date(),
    });
    expect(
      await completeAdminVerification(cookies as any, code, async () => admin),
    ).toBe(true);
    expect(await isAdminSessionVerified(cookies as any)).toBe(true);
  });
  it("stores hashed, single-use recovery codes", async () => {
    const [code] = await generateAdminRecoveryCodes(admin.email);
    const { db } = await getMongo();
    expect(
      await db
        .collection("adminRecoveryCodes")
        .findOne({ email: admin.email, codeHash: code }),
    ).toBeNull();
    const token = "recovery-challenge";
    const cookies = new CookieJar();
    cookies.set("admin_challenge", token);
    await db.collection("adminChallenges").insertOne({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      email: admin.email,
      codeHash: await bcrypt.hash("000000", 4),
      expiresAt: Date.now() + 60_000,
      attempts: 0,
      createdAt: new Date(),
    });
    expect(
      await completeAdminVerification(cookies as any, code, async () => admin),
    ).toBe(true);
    const codeHash = createHash("sha256").update(code).digest("hex");
    expect(
      (
        await db
          .collection("adminRecoveryCodes")
          .findOne({ email: admin.email, codeHash })
      )?.usedAt,
    ).toBeInstanceOf(Date);
  });
});
