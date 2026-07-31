import { randomInt } from "node:crypto";

export type ExpiryOption = "3h" | "1h" | "24h" | "1w" | "1m" | "1y" | "burn";

export function calculateExpiry(option: ExpiryOption, now = new Date()) {
  const expiry = new Date(now);
  if (option === "3h") expiry.setHours(expiry.getHours() + 3);
  else if (option === "1h") expiry.setHours(expiry.getHours() + 1);
  else if (option === "24h") expiry.setDate(expiry.getDate() + 1);
  else if (option === "1w") expiry.setDate(expiry.getDate() + 7);
  else if (option === "1m") expiry.setMonth(expiry.getMonth() + 1);
  else if (option === "1y") expiry.setFullYear(expiry.getFullYear() + 1);
  else expiry.setMinutes(expiry.getMinutes() + 5);
  return expiry;
}

export async function generateAvailableSlug(
  format: "string" | "number",
  exists: (slug: string) => Promise<boolean>,
) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const slug =
      format === "number"
        ? Array.from({ length: 6 }, () => randomInt(0, 10)).join("")
        : Array.from(
            { length: 6 },
            () => chars[randomInt(0, chars.length)],
          ).join("");
    if (!(await exists(slug))) return slug;
  }
  throw new Error("Unable to allocate a unique share slug.");
}
