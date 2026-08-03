import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AstroCookies } from "astro";
import { secureCookieOptions } from "./security";
import { getMongo } from "./mongo";
import { serverEnv } from "./env";

export type User = {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  plan: "free" | "plus" | "pro";
  isAdmin: boolean;
  disabled: boolean;
  emailVerified: boolean;
  billing?: {
    provider?: "stripe";
    customerId?: string | null;
    subscriptionId?: string | null;
    priceId?: string | null;
    interval?: "monthly" | "annual";
    status?: string;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    updatedAt?: Date;
  };
};
type Session = {
  sessionId: string;
  tokenHash: string;
  email: string;
  expiresAt: Date;
  lastSeenAt: Date;
  adminVerified: boolean;
  adminVerifiedAt?: Date;
  createdAt: Date;
  userAgent?: string;
  ipHash?: string;
};
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const SESSION_IDLE_SECONDS = 60 * 30;
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwerty123",
  "letmein123",
  "admin123",
  "welcome1",
  "iloveyou",
  "abc12345",
]);

const bootstrapAdminEmail = normalizeEmail(
  serverEnv.ADMIN_EMAIL || "prosumit999@gmail.com",
);
const configuredAdminHash = serverEnv.ADMIN_PASSWORD_HASH;
const configuredAdminPassword = serverEnv.ADMIN_PASSWORD;
// The plaintext environment value is used only to derive the in-memory bcrypt hash.
// A precomputed hash is preferred and takes precedence when both are configured.
const bootstrapAdminHash =
  configuredAdminHash ||
  (configuredAdminPassword
    ? bcrypt.hashSync(configuredAdminPassword, 12)
    : undefined);
let adminReady: Promise<void> | null = null;

function ensureBootstrapAdmin() {
  if (!adminReady)
    adminReady = (async () => {
      if (!bootstrapAdminEmail || !bootstrapAdminHash) return;
      const { db } = await getMongo();
      await db
        .collection<User>("users")
        .updateMany(
          { emailVerified: { $exists: false } },
          { $set: { emailVerified: true } },
        );
      await db.collection<User>("users").updateOne(
        { email: bootstrapAdminEmail },
        {
          $set: {
            name: "TextShare Admin",
            passwordHash: bootstrapAdminHash,
            plan: "pro",
            isAdmin: true,
            disabled: false,
            emailVerified: true,
          },
          $setOnInsert: { email: bootstrapAdminEmail, createdAt: new Date() },
        },
        { upsert: true },
      );
    })().catch((error) => {
      adminReady = null;
      throw error;
    });
  return adminReady;
}

function sessionKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must not exceed 128 characters.";
  if (COMMON_PASSWORDS.has(password.toLowerCase()))
    return "Choose a less common password.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password))
    return "Password must contain letters and numbers.";
  return null;
}

export async function registerUser(
  name: string,
  rawEmail: string,
  password: string,
) {
  await ensureBootstrapAdmin();
  const email = normalizeEmail(rawEmail);
  const { db } = await getMongo();
  if (
    email === bootstrapAdminEmail ||
    (await db.collection("users").findOne({ email }))
  )
    return { ok: false as const };
  const passwordHash = await bcrypt.hash(password, 12);
  const user: User = {
    name: name.trim(),
    email,
    passwordHash,
    createdAt: new Date(),
    plan: "free",
    isAdmin: false,
    disabled: false,
    emailVerified: false,
  };
  try {
    await db.collection<User>("users").insertOne(user);
  } catch {
    return { ok: false as const };
  }
  return { ok: true as const, user };
}

export async function verifyCredentials(rawEmail: string, password: string) {
  await ensureBootstrapAdmin();
  const email = normalizeEmail(rawEmail);
  const { db } = await getMongo();
  const user = await db.collection<User>("users").findOne({ email });
  if (!user) {
    // Equalize timing for unknown accounts.
    await bcrypt.compare(
      password,
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7c4bPTmBJeRtJ0zVZ/4ZOiVHTp71l4i",
    );
    return null;
  }
  return !user.disabled && (await bcrypt.compare(password, user.passwordHash))
    ? user
    : null;
}

export async function createSession(
  cookies: AstroCookies,
  user: User,
  options: { adminVerified?: boolean; request?: Request } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sessionKey(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  const { db } = await getMongo();
  const previousToken = cookies.get("session")?.value;
  if (previousToken)
    await db
      .collection("sessions")
      .deleteOne({ tokenHash: sessionKey(previousToken) });
  await db.collection<Session>("sessions").insertOne({
    sessionId: randomBytes(16).toString("hex"),
    tokenHash,
    email: user.email,
    expiresAt,
    lastSeenAt: new Date(),
    adminVerified: options.adminVerified === true,
    ...(options.adminVerified ? { adminVerifiedAt: new Date() } : {}),
    createdAt: new Date(),
    userAgent:
      options.request?.headers.get("user-agent")?.slice(0, 200) || undefined,
    ipHash: options.request
      ? createHash("sha256")
          .update(
            options.request.headers.get("cf-connecting-ip") ||
              options.request.headers.get("x-forwarded-for") ||
              options.request.headers.get("x-real-ip") ||
              "unknown",
          )
          .digest("hex")
          .slice(0, 16)
      : undefined,
  });
  cookies.set("session", token, secureCookieOptions(SESSION_SECONDS));
  cookies.set("plan", user.plan, secureCookieOptions(SESSION_SECONDS));
}

export async function hasRecentAdminStepUp(
  cookies: AstroCookies,
  maxAgeSeconds = 10 * 60,
) {
  const token = cookies.get("session")?.value;
  if (!token) return false;
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
  const { db } = await getMongo();
  return Boolean(
    await db.collection<Session>("sessions").findOne(
      {
        tokenHash: sessionKey(token),
        adminVerified: true,
        adminVerifiedAt: { $gte: cutoff },
        expiresAt: { $gt: new Date() },
      },
      { projection: { _id: 1 } },
    ),
  );
}

export async function isAdminSessionVerified(cookies: AstroCookies) {
  const token = cookies.get("session")?.value;
  if (!token) return false;
  const { db } = await getMongo();
  return Boolean(
    await db.collection<Session>("sessions").findOne(
      {
        tokenHash: sessionKey(token),
        adminVerified: true,
        expiresAt: { $gt: new Date() },
      },
      { projection: { _id: 1 } },
    ),
  );
}

export async function getCurrentUser(
  cookies: AstroCookies,
): Promise<User | null> {
  const token = cookies.get("session")?.value;
  if (!token) return null;
  await ensureBootstrapAdmin();
  const { db } = await getMongo();
  const tokenHash = sessionKey(token);
  const now = new Date();
  const idleCutoff = new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000);
  const session = await db.collection<Session>("sessions").findOne({
    tokenHash,
    expiresAt: { $gt: now },
    lastSeenAt: { $gt: idleCutoff },
  });
  if (!session) return null;
  if (now.getTime() - new Date(session.lastSeenAt).getTime() > 5 * 60_000)
    await db
      .collection<Session>("sessions")
      .updateOne({ tokenHash }, { $set: { lastSeenAt: now } });
  const user = await db
    .collection<User>("users")
    .findOne({ email: session.email, disabled: false });
  if (!user) await db.collection("sessions").deleteOne({ tokenHash });
  return user;
}

export async function listUserSessions(cookies: AstroCookies, email: string) {
  const current = cookies.get("session")?.value;
  const currentHash = current ? sessionKey(current) : "";
  const { db } = await getMongo();
  const rows = await db
    .collection<Session>("sessions")
    .find(
      { email: normalizeEmail(email), expiresAt: { $gt: new Date() } },
      {
        projection: {
          tokenHash: 1,
          sessionId: 1,
          createdAt: 1,
          lastSeenAt: 1,
          userAgent: 1,
          ipHash: 1,
        },
      },
    )
    .sort({ lastSeenAt: -1 })
    .toArray();
  return rows.map((row) => ({
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    userAgent: row.userAgent || "Unknown device",
    ipHash: row.ipHash,
    current: row.tokenHash === currentHash,
  }));
}

export async function revokeUserSession(email: string, sessionId: string) {
  const { db } = await getMongo();
  return (
    (
      await db
        .collection("sessions")
        .deleteOne({ email: normalizeEmail(email), sessionId })
    ).deletedCount > 0
  );
}

export async function destroySession(cookies: AstroCookies) {
  const token = cookies.get("session")?.value;
  try {
    if (token) {
      const { db } = await getMongo();
      await db
        .collection("sessions")
        .deleteOne({ tokenHash: sessionKey(token) });
    }
  } finally {
    cookies.delete("session", { path: "/" });
    cookies.delete("plan", { path: "/" });
  }
}

export async function listUsers() {
  await ensureBootstrapAdmin();
  const { db } = await getMongo();
  return await db
    .collection<User>("users")
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray();
}

export async function getUserByEmail(email: string) {
  await ensureBootstrapAdmin();
  const { db } = await getMongo();
  return await db
    .collection<User>("users")
    .findOne({ email: normalizeEmail(email) });
}

export async function setUserDisabled(email: string, disabled: boolean) {
  const normalized = normalizeEmail(email);
  const { db } = await getMongo();
  const result = await db
    .collection<User>("users")
    .updateOne({ email: normalized, isAdmin: false }, { $set: { disabled } });
  if (disabled && result.modifiedCount)
    await invalidateUserSessions(normalized);
  return result.modifiedCount > 0;
}

export async function invalidateUserSessions(email: string) {
  const { db } = await getMongo();
  return (
    await db.collection("sessions").deleteMany({ email: normalizeEmail(email) })
  ).deletedCount;
}

export async function countActiveSessions(email?: string) {
  const { db } = await getMongo();
  return await db.collection("sessions").countDocuments({
    expiresAt: { $gt: new Date() },
    ...(email ? { email: normalizeEmail(email) } : {}),
  });
}
