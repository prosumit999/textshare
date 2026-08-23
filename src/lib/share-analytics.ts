import { createHash } from "node:crypto";
import geoip from "geoip-lite";
import { getMongo } from "./mongo";

export type ShareView = {
  slug: string;
  ipHash: string;
  country: string;
  userAgent?: string;
  createdAt: Date;
};

export type ShareAnalytics = {
  totalViews: number;
  uniqueIps: number;
  byCountry: { country: string; count: number }[];
  recent: ShareView[];
};

function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function isPrivateIp(ip: string): boolean {
  if (ip === "unknown" || !ip) return false;
  const v6 = ip.startsWith("[") ? ip.slice(1, -1) : ip;
  const lower = v6.toLowerCase();
  if (lower === "::1" || lower.startsWith("::ffff:127.")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4 mapped IPv6 (::ffff:a.b.c.d) or plain IPv4.
  const v4 = lower.startsWith("::ffff:") ? lower.slice(7) : lower;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

/**
 * Resolve an ISO country code for a viewer IP.
 *
 * Preference order:
 *   1. `cf-ipcountry` header — provided by Cloudflare in front of the origin.
 *   2. Private / loopback ranges -> "Local".
 *   3. Offline MaxMind-derived lookup via `geoip-lite`.
 *   4. "Unknown" when the address cannot be geolocated.
 */
export function resolveCountry(request: Request, ip: string): string {
  const headerCountry = request.headers.get("cf-ipcountry")?.trim();
  if (headerCountry && /^[A-Z]{2}$/.test(headerCountry)) return headerCountry;
  if (isPrivateIp(ip)) return "Local";
  if (ip === "unknown" || !ip) return "Unknown";
  try {
    const match = geoip.lookup(ip);
    if (match?.country) return match.country;
  } catch {
    /* fall through to Unknown */
  }
  return "Unknown";
}

export async function recordShareView(
  slug: string,
  request: Request,
  ip: string,
): Promise<void> {
  const { db } = await getMongo();
  await db.collection<ShareView>("shareViews").insertOne({
    slug,
    ipHash: hashIp(ip),
    country: resolveCountry(request, ip),
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || undefined,
    createdAt: new Date(),
  });
}

export async function getShareAnalytics(slug: string): Promise<ShareAnalytics> {
  const { db } = await getMongo();
  const collection = db.collection<ShareView>("shareViews");
  const [totalViews, uniqueIps, recent] = await Promise.all([
    collection.countDocuments({ slug }),
    collection.distinct("ipHash", { slug }),
    collection
      .find({ slug })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
  ]);
  const byCountryMap = new Map<string, number>();
  for (const view of recent) {
    byCountryMap.set(view.country, (byCountryMap.get(view.country) || 0) + 1);
  }
  const byCountry = Array.from(byCountryMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
  return { totalViews, uniqueIps: uniqueIps.length, byCountry, recent };
}
