import { randomUUID } from 'node:crypto';

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  createdAt: Date;
};

export type TrafficEvent = {
  ip: string;
  method: string;
  path: string;
  category: string;
  status?: number;
  createdAt: Date;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  content: string;
  coverImage: string;
  status: 'draft' | 'published';
  publishDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BlockEntry = {
  ip: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
};
export type SecuritySignal = { event: string; ip: string; details: Record<string, unknown>; createdAt: Date };

declare global {
  // eslint-disable-next-line no-var
  var textShareAuditLog: AuditEntry[] | undefined;
  // eslint-disable-next-line no-var
  var textShareTrafficLog: TrafficEvent[] | undefined;
  // eslint-disable-next-line no-var
  var textShareBlogPosts: Map<string, BlogPost> | undefined;
  // eslint-disable-next-line no-var
  var textShareBlogSeeded: boolean | undefined;
  // eslint-disable-next-line no-var
  var textShareIpBlocklist: Map<string, BlockEntry> | undefined;
  // eslint-disable-next-line no-var
  var textShareSecuritySignals: SecuritySignal[] | undefined;
}

const auditLog = globalThis.textShareAuditLog ??= [];
const trafficLog = globalThis.textShareTrafficLog ??= [];
const blogPosts = globalThis.textShareBlogPosts ??= new Map();
const blocklist = globalThis.textShareIpBlocklist ??= new Map();
const securitySignals = globalThis.textShareSecuritySignals ??= [];

const starterPosts: Array<Omit<BlogPost, 'createdAt' | 'updatedAt'>> = [
  { id: 'starter-secure-text-sharing', slug: 'secure-text-sharing', title: 'Secure text sharing: Best practices', coverImage: '', status: 'published', publishDate: new Date('2026-07-28T09:00:00Z'), content: '<p>Sharing sensitive notes and code is often necessary, but leaving permanent copies in inboxes and chat histories creates avoidable risk.</p><h2>Share only what is needed</h2><p>Remove credentials, personal information, and unrelated context before creating a link. Use the shortest practical expiry and send passwords through a different channel.</p><h2>Prefer temporary links</h2><p>An expiring share reduces how long information remains accessible. Confirm that the recipient opened it, then remove it early when it is no longer needed.</p><ul><li>Review content before sharing.</li><li>Use password protection for sensitive material.</li><li>Choose a short expiration period.</li><li>Never paste production secrets into public rooms.</li></ul>' },
  { id: 'starter-share-code', slug: 'share-code', title: 'How to share code without the noise', coverImage: '', status: 'published', publishDate: new Date('2026-07-22T09:00:00Z'), content: '<p>Good code sharing keeps formatting intact and gives collaborators the context they need without burying the important lines.</p><h2>Keep snippets focused</h2><p>Include the smallest reproducible section, the language, and the expected result. Syntax highlighting makes structure easier to scan and review.</p><pre><code>const message = "Clear context makes reviews faster";\nconsole.log(message);</code></pre><h2>Add useful context</h2><ul><li>Explain what you expected.</li><li>Include the exact error.</li><li>Remove tokens and private data.</li></ul>' },
  { id: 'starter-expiring-links', slug: 'expiring-links', title: 'Expiring links explained', coverImage: '', status: 'published', publishDate: new Date('2026-07-15T09:00:00Z'), content: '<p>Temporary links automatically become unavailable after a selected period. They are useful when information only needs to exist for a short workflow.</p><h2>When to use expiration</h2><p>Use short-lived links for one-time handoffs, support diagnostics, temporary instructions, and content that becomes stale quickly.</p><blockquote>Expiration limits availability, but it does not prevent a recipient from copying content while the link is active.</blockquote>' },
  { id: 'starter-syntax-highlighting', slug: 'syntax-highlighting', title: 'Why syntax highlighting improves code reviews', coverImage: '', status: 'published', publishDate: new Date('2026-07-08T09:00:00Z'), content: '<p>Syntax highlighting gives visual structure to code. Keywords, strings, comments, and values become easier to distinguish at a glance.</p><h2>Faster scanning</h2><p>Reviewers can follow control flow and spot mismatched values more quickly when a snippet is displayed in the correct language.</p><h2>Better conversations</h2><p>Readable snippets reduce formatting questions and keep discussion focused on behavior, correctness, and maintainability.</p>' },
  { id: 'starter-password-protection', slug: 'password-protection', title: 'When should you password-protect a share?', coverImage: '', status: 'published', publishDate: new Date('2026-06-30T09:00:00Z'), content: '<p>A hard-to-guess URL is useful, but it is not the same as authentication. Password protection adds another check before content is revealed.</p><h2>Use a password when</h2><ul><li>The link contains private or customer information.</li><li>It may be forwarded outside the intended group.</li><li>The sharing channel stores link previews or history.</li></ul><p>Send the password separately from the room link and avoid reusing an account password.</p>' },
  { id: 'starter-qr-sharing', slug: 'qr-sharing', title: 'Faster sharing across devices with QR codes', coverImage: '', status: 'published', publishDate: new Date('2026-06-21T09:00:00Z'), content: '<p>A QR code is a quick bridge between devices. Scan the room code to open a share on a phone or tablet without typing the URL.</p><h2>Useful scenarios</h2><p>QR sharing works well for moving a snippet to a test device, opening setup instructions, or sharing a temporary room during an in-person session.</p><p>Check the destination shown by your scanner before opening unfamiliar codes.</p>' }
];

if (!globalThis.textShareBlogSeeded) {
  const now = new Date();
  const existingSlugs = new Set(Array.from(blogPosts.values(), (post) => post.slug));
  for (const starter of starterPosts) {
    if (!existingSlugs.has(starter.slug)) blogPosts.set(starter.id, { ...starter, createdAt: now, updatedAt: now });
  }
  globalThis.textShareBlogSeeded = true;
}

export function recordAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>) {
  auditLog.unshift({ id: randomUUID(), createdAt: new Date(), ...entry });
  if (auditLog.length > 10_000) auditLog.length = 10_000;
}

export function getAuditLog() {
  return auditLog;
}

export function categorizePath(path: string) {
  if (path === '/') return 'share_creation';
  if (path === '/join') return 'room_join';
  if (path === '/login') return 'login';
  if (path.includes('password')) return 'password_attempt';
  if (path.startsWith('/8010952940-admin')) return 'admin';
  return 'share_resolution';
}

export function recordTraffic(event: Omit<TrafficEvent, 'createdAt' | 'category'>) {
  trafficLog.push({ ...event, category: categorizePath(event.path), createdAt: new Date() });
  if (trafficLog.length > 50_000) trafficLog.splice(0, trafficLog.length - 50_000);
}

export function getTrafficEvents(since: Date) {
  return trafficLog.filter((event) => event.createdAt >= since);
}

export function recordSecuritySignal(event: string, ip: string, details: Record<string, unknown>) {
  securitySignals.unshift({ event, ip, details, createdAt: new Date() });
  if (securitySignals.length > 20_000) securitySignals.length = 20_000;
}

export function getSecuritySignals(since: Date) {
  return securitySignals.filter((signal) => signal.createdAt >= since);
}

export function isIpBlocked(ip: string) {
  const entry = blocklist.get(ip);
  if (!entry) return false;
  if (entry.expiresAt && entry.expiresAt <= new Date()) {
    blocklist.delete(ip);
    return false;
  }
  return true;
}

export function blockIp(ip: string, actor: string, durationMinutes: number | null, reason: string) {
  const entry: BlockEntry = {
    ip,
    reason,
    createdBy: actor,
    createdAt: new Date(),
    expiresAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60_000) : null
  };
  blocklist.set(ip, entry);
  return entry;
}

export function unblockIp(ip: string) {
  return blocklist.delete(ip);
}

export function getBlockedIps() {
  return Array.from(blocklist.values()).filter((entry) => isIpBlocked(entry.ip));
}

export function getBlogPosts() {
  return Array.from(blogPosts.values());
}

export function getBlogPost(id: string) {
  return blogPosts.get(id);
}

export function getPublishedBlogPosts(now = new Date()) {
  return getBlogPosts()
    .filter((post) => post.status === 'published' && post.publishDate && post.publishDate <= now)
    .sort((a, b) => (b.publishDate?.getTime() || 0) - (a.publishDate?.getTime() || 0));
}

export function getPublishedBlogPostBySlug(slug: string, now = new Date()) {
  return getPublishedBlogPosts(now).find((post) => post.slug === slug) || null;
}

export function saveBlogPost(input: Omit<BlogPost, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  const now = new Date();
  const existing = input.id ? blogPosts.get(input.id) : null;
  const post: BlogPost = {
    ...input,
    id: existing?.id || randomUUID(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  blogPosts.set(post.id, post);
  return post;
}

export function deleteBlogPost(id: string) {
  return blogPosts.delete(id);
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
