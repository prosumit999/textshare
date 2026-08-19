import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AstroCookies } from "astro";
import { createSession, getUserByEmail, type User } from "./auth";
import { sendLoginVerificationCode } from "./email";
import { getMongo } from "./mongo";
import { secureCookieOptions } from "./security";

const CHALLENGE_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

type LoginChallenge = {
  tokenHash: string;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createCode() {
  return randomInt(100000, 1000000).toString();
}

export async function beginLoginVerification(
  cookies: AstroCookies,
  user: User,
) {
  // This challenge verifies a new account's email during its first sign-in.
  // Established accounts sign in directly; administrators use admin-auth.ts.
  if (user.disabled || user.emailVerified || user.isAdmin)
    throw new Error("Login verification unavailable.");
  const token = randomBytes(32).toString("base64url");
  const code = createCode();
  const { db } = await getMongo();
  await db
    .collection<LoginChallenge>("loginChallenges")
    .deleteMany({ email: user.email });
  await db.collection<LoginChallenge>("loginChallenges").insertOne({
    tokenHash: tokenHash(token),
    email: user.email,
    codeHash: await bcrypt.hash(code, 12),
    attempts: 0,
    expiresAt: new Date(Date.now() + CHALLENGE_SECONDS * 1000),
    createdAt: new Date(),
  });
  try {
    await sendLoginVerificationCode(user.email, code);
    cookies.set(
      "login_challenge",
      token,
      secureCookieOptions(CHALLENGE_SECONDS),
    );
  } catch (error) {
    await db
      .collection("loginChallenges")
      .deleteOne({ tokenHash: tokenHash(token) });
    throw error;
  }
}

async function pendingChallenge(cookies: AstroCookies) {
  const token = cookies.get("login_challenge")?.value;
  if (!token) return null;
  const { db } = await getMongo();
  return db.collection<LoginChallenge>("loginChallenges").findOne({
    tokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  });
}

export async function pendingLoginEmail(cookies: AstroCookies) {
  return (await pendingChallenge(cookies))?.email || null;
}

export async function resendLoginVerification(cookies: AstroCookies) {
  const challenge = await pendingChallenge(cookies);
  if (!challenge) return false;
  const user = await getUserByEmail(challenge.email);
  if (!user || user.disabled || user.emailVerified || user.isAdmin) return false;
  const code = createCode();
  const { db } = await getMongo();
  await sendLoginVerificationCode(user.email, code);
  await db.collection<LoginChallenge>("loginChallenges").updateOne(
    { tokenHash: challenge.tokenHash },
    {
      $set: {
        codeHash: await bcrypt.hash(code, 12),
        attempts: 0,
        expiresAt: new Date(Date.now() + CHALLENGE_SECONDS * 1000),
        createdAt: new Date(),
      },
    },
  );
  cookies.set(
    "login_challenge",
    cookies.get("login_challenge")!.value,
    secureCookieOptions(CHALLENGE_SECONDS),
  );
  return true;
}

export async function completeLoginVerification(
  cookies: AstroCookies,
  code: string,
  request: Request,
) {
  const token = cookies.get("login_challenge")?.value;
  if (!token || !/^\d{6}$/.test(code.trim())) return false;
  const key = tokenHash(token);
  const { db } = await getMongo();
  const challenge = await db
    .collection<LoginChallenge>("loginChallenges")
    .findOne({ tokenHash: key });
  if (
    !challenge ||
    challenge.expiresAt <= new Date() ||
    challenge.attempts >= MAX_ATTEMPTS
  ) {
    await db.collection("loginChallenges").deleteOne({ tokenHash: key });
    cookies.delete("login_challenge", { path: "/" });
    return false;
  }
  await db
    .collection("loginChallenges")
    .updateOne({ tokenHash: key }, { $inc: { attempts: 1 } });
  if (!(await bcrypt.compare(code.trim(), challenge.codeHash))) return false;
  const user = await getUserByEmail(challenge.email);
  if (!user || user.disabled || user.emailVerified || user.isAdmin)
    return false;
  await db.collection<User>("users").updateOne(
    { email: user.email, disabled: false, emailVerified: { $ne: true }, isAdmin: false },
    { $set: { emailVerified: true } },
  );
  await db.collection("loginChallenges").deleteOne({ tokenHash: key });
  cookies.delete("login_challenge", { path: "/" });
  await createSession(cookies, user, { request });
  return true;
}
