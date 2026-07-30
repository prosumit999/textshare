import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AstroCookies } from 'astro';
import { secureCookieOptions } from './security';
import { getMongo } from './mongo';
import { serverEnv } from './env';

export type User = {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  plan: 'free' | 'plus' | 'pro';
  isAdmin: boolean;
  disabled: boolean;
};
type Session = { email: string; expiresAt: number; adminVerified: boolean };

declare global {
  // eslint-disable-next-line no-var
  var textShareSessions: Map<string, Session> | undefined;
}

const sessions = globalThis.textShareSessions ??= new Map<string, Session>();
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', 'qwerty123', 'letmein123',
  'admin123', 'welcome1', 'iloveyou', 'abc12345'
]);

const bootstrapAdminEmail = normalizeEmail(serverEnv.ADMIN_EMAIL || 'prosumit999@gmail.com');
const configuredAdminHash = serverEnv.ADMIN_PASSWORD_HASH;
const configuredAdminPassword = serverEnv.ADMIN_PASSWORD;
// The plaintext environment value is used only to derive the in-memory bcrypt hash.
// A precomputed hash is preferred and takes precedence when both are configured.
const bootstrapAdminHash = configuredAdminHash || (configuredAdminPassword ? bcrypt.hashSync(configuredAdminPassword, 12) : undefined);
let adminReady: Promise<void> | null = null;

function ensureBootstrapAdmin() {
  if (!adminReady) adminReady = (async () => {
    if (!bootstrapAdminEmail || !bootstrapAdminHash) return;
    const { db } = await getMongo();
    await db.collection<User>('users').updateOne(
      { email: bootstrapAdminEmail },
      { $set: { name: 'TextShare Admin', passwordHash: bootstrapAdminHash, plan: 'pro', isAdmin: true, disabled: false }, $setOnInsert: { email: bootstrapAdminEmail, createdAt: new Date() } },
      { upsert: true }
    );
  })().catch((error) => { adminReady = null; throw error; });
  return adminReady;
}

function sessionKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must not exceed 128 characters.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.';
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'Password must contain letters and numbers.';
  return null;
}

export async function registerUser(name: string, rawEmail: string, password: string) {
  await ensureBootstrapAdmin();
  const email = normalizeEmail(rawEmail);
  const { db } = await getMongo();
  if (email === bootstrapAdminEmail || await db.collection('users').findOne({ email })) return { ok: false as const };
  const passwordHash = await bcrypt.hash(password, 12);
  const user: User = {
    name: name.trim(), email, passwordHash, createdAt: new Date(), plan: 'free', isAdmin: false, disabled: false
  };
  try { await db.collection<User>('users').insertOne(user); }
  catch { return { ok: false as const }; }
  return { ok: true as const, user };
}

export async function verifyCredentials(rawEmail: string, password: string) {
  await ensureBootstrapAdmin();
  const email = normalizeEmail(rawEmail);
  const { db } = await getMongo();
  const user = await db.collection<User>('users').findOne({ email });
  if (!user) {
    // Equalize timing for unknown accounts.
    await bcrypt.compare(password, '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7c4bPTmBJeRtJ0zVZ/4ZOiVHTp71l4i');
    return null;
  }
  return !user.disabled && await bcrypt.compare(password, user.passwordHash) ? user : null;
}

export function createSession(cookies: AstroCookies, user: User, options: { adminVerified?: boolean } = {}) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(sessionKey(token), {
    email: user.email,
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
    adminVerified: options.adminVerified === true
  });
  cookies.set('session', token, secureCookieOptions(SESSION_SECONDS));
  cookies.set('plan', user.plan, secureCookieOptions(SESSION_SECONDS));
}

export function isAdminSessionVerified(cookies: AstroCookies) {
  const token = cookies.get('session')?.value;
  if (!token) return false;
  const session = sessions.get(sessionKey(token));
  return Boolean(session?.adminVerified && session.expiresAt > Date.now());
}

export async function getCurrentUser(cookies: AstroCookies): Promise<User | null> {
  const token = cookies.get('session')?.value;
  if (!token) return null;
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  await ensureBootstrapAdmin();
  const { db } = await getMongo();
  return await db.collection<User>('users').findOne({ email: session.email });
}

export function destroySession(cookies: AstroCookies) {
  const token = cookies.get('session')?.value;
  if (token) sessions.delete(sessionKey(token));
  cookies.delete('session', { path: '/' });
  cookies.delete('plan', { path: '/' });
}

export async function listUsers() {
  await ensureBootstrapAdmin();
  const { db } = await getMongo();
  return await db.collection<User>('users').find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(1000).toArray();
}

export async function getUserByEmail(email: string) {
  await ensureBootstrapAdmin();
  const { db } = await getMongo();
  return await db.collection<User>('users').findOne({ email: normalizeEmail(email) });
}

export async function setUserDisabled(email: string, disabled: boolean) {
  const normalized = normalizeEmail(email);
  const { db } = await getMongo();
  const result = await db.collection<User>('users').updateOne({ email: normalized, isAdmin: false }, { $set: { disabled } });
  if (disabled && result.modifiedCount) invalidateUserSessions(normalized);
  return result.modifiedCount > 0;
}

export function invalidateUserSessions(email: string) {
  let removed = 0;
  for (const [key, session] of sessions) {
    if (session.email === normalizeEmail(email)) {
      sessions.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function countActiveSessions(email?: string) {
  const now = Date.now();
  let count = 0;
  for (const [key, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(key);
    else if (!email || session.email === normalizeEmail(email)) count += 1;
  }
  return count;
}
