import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AstroCookies } from 'astro';
import { secureCookieOptions } from './security';

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
  var textShareUsers: Map<string, User> | undefined;
  // eslint-disable-next-line no-var
  var textShareSessions: Map<string, Session> | undefined;
}

const users = globalThis.textShareUsers ??= new Map<string, User>();
const sessions = globalThis.textShareSessions ??= new Map<string, Session>();
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', 'qwerty123', 'letmein123',
  'admin123', 'welcome1', 'iloveyou', 'abc12345'
]);

const bootstrapAdminEmail = normalizeEmail(import.meta.env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'prosumit999@gmail.com');
const configuredAdminHash = import.meta.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH;
const configuredAdminPassword = import.meta.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
// The plaintext environment value is used only to derive the in-memory bcrypt hash.
// A precomputed hash is preferred and takes precedence when both are configured.
const bootstrapAdminHash = configuredAdminHash || (configuredAdminPassword ? bcrypt.hashSync(configuredAdminPassword, 12) : undefined);
if (bootstrapAdminEmail && bootstrapAdminHash) {
  const existingAdmin = users.get(bootstrapAdminEmail);
  if (existingAdmin?.isAdmin) {
    existingAdmin.passwordHash = bootstrapAdminHash;
  } else if (!existingAdmin) users.set(bootstrapAdminEmail, {
    name: 'TextShare Admin',
    email: bootstrapAdminEmail,
    passwordHash: bootstrapAdminHash,
    createdAt: new Date(),
    plan: 'pro',
    isAdmin: true,
    disabled: false
  });
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
  const email = normalizeEmail(rawEmail);
  if (users.has(email) || (bootstrapAdminEmail && email === bootstrapAdminEmail)) return { ok: false as const };
  const passwordHash = await bcrypt.hash(password, 12);
  users.set(email, {
    name: name.trim(), email, passwordHash, createdAt: new Date(), plan: 'free', isAdmin: false, disabled: false
  });
  return { ok: true as const, user: users.get(email)! };
}

export async function verifyCredentials(rawEmail: string, password: string) {
  const email = normalizeEmail(rawEmail);
  const user = users.get(email);
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

export function getCurrentUser(cookies: AstroCookies): User | null {
  const token = cookies.get('session')?.value;
  if (!token) return null;
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return users.get(session.email) || null;
}

export function destroySession(cookies: AstroCookies) {
  const token = cookies.get('session')?.value;
  if (token) sessions.delete(sessionKey(token));
  cookies.delete('session', { path: '/' });
  cookies.delete('plan', { path: '/' });
}

export function listUsers() {
  return Array.from(users.values()).map(({ passwordHash: _passwordHash, ...user }) => user);
}

export function getUserByEmail(email: string) {
  return users.get(normalizeEmail(email)) || null;
}

export function setUserDisabled(email: string, disabled: boolean) {
  const user = users.get(normalizeEmail(email));
  if (!user || user.isAdmin) return false;
  user.disabled = disabled;
  if (disabled) invalidateUserSessions(user.email);
  return true;
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
