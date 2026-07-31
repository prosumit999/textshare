import { createHash } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import { recordSecuritySignal } from "./admin";
import { serverEnv } from "./env";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};
type MemoryEntry = { count: number; expiresAt: number };

const memoryLimits = new Map<string, MemoryEntry>();
let redisPromise: Promise<RedisClientType | null> | null = null;

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

async function getRedis(): Promise<RedisClientType | null> {
  const redisUrl = serverEnv.REDIS_URL;
  if (!redisUrl) return null;

  if (!redisPromise) {
    redisPromise = (async () => {
      const client = createClient({ url: redisUrl });
      client.on("error", (error) => {
        console.error(
          JSON.stringify({
            event: "redis_error",
            at: new Date().toISOString(),
            message: error.message,
          }),
        );
      });
      await client.connect();
      return client as RedisClientType;
    })().catch((error) => {
      redisPromise = null;
      console.error(
        JSON.stringify({
          event: "redis_connection_failed",
          at: new Date().toISOString(),
          message: error.message,
        }),
      );
      return null;
    });
  }

  return redisPromise;
}

export function getClientIp(request: Request): string {
  const trustProxy =
    (import.meta.env.TRUST_PROXY || process.env.TRUST_PROXY) === "true";
  if (trustProxy) {
    const cloudflareIp = request.headers.get("cf-connecting-ip");
    if (cloudflareIp) return cloudflareIp.trim();
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    if (forwarded) return forwarded;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `textshare:rl:${scope}:${hashIdentifier(identifier)}`;
  const redis = await getRedis();

  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    const ttl = Math.max(1, await redis.ttl(key));
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter: ttl,
    };
  }

  if (import.meta.env.PROD && serverEnv.RATE_LIMIT_ALLOW_MEMORY !== "true") {
    console.error(
      JSON.stringify({
        event: "rate_limit_store_unavailable",
        scope,
        at: new Date().toISOString(),
      }),
    );
    return { allowed: false, remaining: 0, retryAfter: 60 };
  }

  const now = Date.now();
  const existing = memoryLimits.get(key);
  const entry =
    !existing || existing.expiresAt <= now
      ? { count: 0, expiresAt: now + windowSeconds * 1000 }
      : existing;
  entry.count += 1;
  memoryLimits.set(key, entry);
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfter: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
  };
}

export function rateLimitResponse(
  retryAfter: number,
  message = "Too many requests. Please try again later.",
) {
  return new Response(JSON.stringify({ error: message, retryAfter }), {
    status: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(retryAfter),
      "Cache-Control": "no-store",
    },
  });
}

export async function logSecurityEvent(
  event: string,
  request: Request,
  details: Record<string, unknown> = {},
) {
  const ip = getClientIp(request);
  await recordSecuritySignal(event, ip, details);
  console.warn(
    JSON.stringify({ event, at: new Date().toISOString(), ip, ...details }),
  );
}

export function secureCookieOptions(maxAge: number) {
  return {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax" as const,
    maxAge,
  };
}

export async function getRedisHealth() {
  const redis = await getRedis();
  if (!redis) return { connected: false, usedMemory: null as number | null };
  try {
    const info = await redis.info("memory");
    const usedMemory = Number(info.match(/^used_memory:(\d+)$/m)?.[1] || 0);
    return { connected: true, usedMemory };
  } catch {
    return { connected: false, usedMemory: null as number | null };
  }
}
