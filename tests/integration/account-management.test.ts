import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { changeAccountName, changeAccountPassword, deleteAccount, exportAccountData } from "../../src/lib/account-management";
import { getMongo } from "../../src/lib/mongo";
import { getShare, saveShare } from "../../src/lib/share-store";
import type { User } from "../../src/lib/auth";

const email = "management-test@example.com";
let user: User;
beforeEach(async () => {
  const { db } = await getMongo();
  await Promise.all([db.collection("users").deleteMany({ email }), db.collection("sessions").deleteMany({ email })]);
  user = { name: "Management Test", email, passwordHash: await bcrypt.hash("CurrentPassword123", 12), createdAt: new Date(), plan: "free", isAdmin: false, disabled: false, emailVerified: true };
  await db.collection("users").insertOne(user);
});

describe("account management", () => {
  it("changes the name and changes password while revoking sessions", async () => {
    const { db } = await getMongo();
    expect(await changeAccountName(user, "New Name")).toBe(true);
    await db.collection("sessions").insertOne({ sessionId: "e".repeat(32), tokenHash: "f".repeat(64), email, expiresAt: new Date(Date.now()+60_000), lastSeenAt: new Date(), adminVerified: false, createdAt: new Date() });
    expect(await changeAccountPassword(user, "wrong", "NextPassword456")).toBe(false);
    expect(await changeAccountPassword(user, "CurrentPassword123", "NextPassword456")).toBe(true);
    expect(await db.collection("sessions").countDocuments({ email })).toBe(0);
    const stored = await db.collection("users").findOne({ email });
    expect(stored?.name).toBe("New Name");
    expect(await bcrypt.compare("NextPassword456", stored!.passwordHash)).toBe(true);
  });

  it("exports safe metadata without credentials", async () => {
    const exported = await exportAccountData(user);
    expect(exported.account.email).toBe(email);
    expect(JSON.stringify(exported)).not.toContain("passwordHash");
    expect(JSON.stringify(exported)).not.toContain("tokenHash");
  });

  it("deletes the user and their encrypted share payload", async () => {
    await saveShare("acct01", { contentType:"text", textContent:"delete me", imageSrc:null, expiryDate:new Date(Date.now()+60_000), burnAfterReading:false, language:"plaintext", passwordHash:null, owner:email, guestIp:null, sizeBytes:9, createdAt:new Date(), viewCount:0 });
    expect(await deleteAccount(user, "CurrentPassword123")).toBe(true);
    const { db } = await getMongo();
    expect(await db.collection("users").findOne({ email })).toBeNull();
    expect(await getShare("acct01")).toBeNull();
  });
});
