import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AstroCookies } from "astro";
import { createSession, type User } from "./auth";
import { sendAdminVerificationCode } from "./email";
import { secureCookieOptions } from "./security";
import { getMongo } from "./mongo";

type Challenge = {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
};
function challengeKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function beginAdminVerification(
  cookies: AstroCookies,
  user: User,
) {
  if (!user.isAdmin || user.disabled) throw new Error("Admin access denied.");
  const token = randomBytes(32).toString("base64url");
  const code = randomInt(100000, 1000000).toString();
  const key = challengeKey(token);
  const { db } = await getMongo();
  await db
    .collection<Challenge & { tokenHash: string; createdAt: Date }>(
      "adminChallenges",
    )
    .insertOne({
      tokenHash: key,
      email: user.email,
      codeHash: await bcrypt.hash(code, 12),
      expiresAt: Date.now() + 10 * 60_000,
      attempts: 0,
      createdAt: new Date(),
    });
  try {
    await sendAdminVerificationCode(user.email, code);
    cookies.set("admin_challenge", token, secureCookieOptions(10 * 60));
  } catch (error) {
    await db.collection("adminChallenges").deleteOne({ tokenHash: key });
    throw error;
  }
}

export async function completeAdminVerification(
  cookies: AstroCookies,
  code: string,
  userLookup: (email: string) => Promise<User | null>,
  request?: Request,
) {
  const token = cookies.get("admin_challenge")?.value;
  if (!token) return false;
  const key = challengeKey(token);
  const { db } = await getMongo();
  const challenge = await db
    .collection<Challenge & { tokenHash: string }>("adminChallenges")
    .findOne({ tokenHash: key });
  if (
    !challenge ||
    challenge.expiresAt <= Date.now() ||
    challenge.attempts >= 5
  ) {
    await db.collection("adminChallenges").deleteOne({ tokenHash: key });
    cookies.delete("admin_challenge", { path: "/" });
    return false;
  }
  await db
    .collection("adminChallenges")
    .updateOne({ tokenHash: key }, { $inc: { attempts: 1 } });
  const normalizedCode = code.trim().toLowerCase();
  let verified =
    /^\d{6}$/.test(normalizedCode) &&
    (await bcrypt.compare(normalizedCode, challenge.codeHash));
  if (!verified && /^[a-z0-9]{5}-[a-z0-9]{5}$/.test(normalizedCode)) {
    const codeHash = createHash("sha256").update(normalizedCode).digest("hex");
    const used = await db
      .collection("adminRecoveryCodes")
      .findOneAndUpdate(
        { email: challenge.email, codeHash, usedAt: null },
        { $set: { usedAt: new Date() } },
        { returnDocument: "after" },
      );
    verified = Boolean(used);
  }
  if (!verified) return false;
  const user = await userLookup(challenge.email);
  if (!user?.isAdmin || user.disabled) return false;
  await db.collection("adminChallenges").deleteOne({ tokenHash: key });
  cookies.delete("admin_challenge", { path: "/" });
  await createSession(cookies, user, { adminVerified: true, request });
  return true;
}

export async function generateAdminRecoveryCodes(email: string) {
  const codes = Array.from(
    { length: 10 },
    () =>
      `${randomBytes(4).toString("hex").slice(0, 5)}-${randomBytes(4).toString("hex").slice(0, 5)}`,
  );
  const { db } = await getMongo();
  await db.collection("adminRecoveryCodes").deleteMany({ email });
  await db.collection("adminRecoveryCodes").insertMany(
    codes.map((code) => ({
      email,
      codeHash: createHash("sha256").update(code).digest("hex"),
      createdAt: new Date(),
      usedAt: null,
    })),
  );
  return codes;
}
