import { createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AstroCookies } from 'astro';
import { createSession, type User } from './auth';
import { sendAdminVerificationCode } from './email';
import { secureCookieOptions } from './security';

type Challenge = { email: string; codeHash: string; expiresAt: number; attempts: number };
declare global {
  // eslint-disable-next-line no-var
  var textShareAdminChallenges: Map<string, Challenge> | undefined;
}
const challenges = globalThis.textShareAdminChallenges ??= new Map<string, Challenge>();

function challengeKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function beginAdminVerification(cookies: AstroCookies, user: User) {
  if (!user.isAdmin || user.disabled) throw new Error('Admin access denied.');
  const token = randomBytes(32).toString('base64url');
  const code = randomInt(100000, 1000000).toString();
  const key = challengeKey(token);
  challenges.set(key, { email: user.email, codeHash: await bcrypt.hash(code, 12), expiresAt: Date.now() + 10 * 60_000, attempts: 0 });
  try {
    await sendAdminVerificationCode(user.email, code);
    cookies.set('admin_challenge', token, secureCookieOptions(10 * 60));
  } catch (error) {
    challenges.delete(key);
    throw error;
  }
}

export async function completeAdminVerification(cookies: AstroCookies, code: string, userLookup: (email: string) => User | null) {
  const token = cookies.get('admin_challenge')?.value;
  if (!token) return false;
  const key = challengeKey(token);
  const challenge = challenges.get(key);
  if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
    challenges.delete(key);
    cookies.delete('admin_challenge', { path: '/' });
    return false;
  }
  challenge.attempts += 1;
  if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, challenge.codeHash))) return false;
  const user = userLookup(challenge.email);
  if (!user?.isAdmin || user.disabled) return false;
  challenges.delete(key);
  cookies.delete('admin_challenge', { path: '/' });
  createSession(cookies, user, { adminVerified: true });
  return true;
}
