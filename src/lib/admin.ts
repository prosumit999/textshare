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
  var textShareIpBlocklist: Map<string, BlockEntry> | undefined;
  // eslint-disable-next-line no-var
  var textShareSecuritySignals: SecuritySignal[] | undefined;
}

const auditLog = globalThis.textShareAuditLog ??= [];
const trafficLog = globalThis.textShareTrafficLog ??= [];
const blogPosts = globalThis.textShareBlogPosts ??= new Map();
const blocklist = globalThis.textShareIpBlocklist ??= new Map();
const securitySignals = globalThis.textShareSecuritySignals ??= [];

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
