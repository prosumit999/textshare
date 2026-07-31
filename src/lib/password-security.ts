import { createHash } from "node:crypto";

export async function breachedPasswordCount(
  password: string,
): Promise<number | null> {
  const hash = createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          "Add-Padding": "true",
          "User-Agent": "TextShare-Password-Security",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;
    for (const line of (await response.text()).split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) || 1;
    }
    return 0;
  } catch {
    return null;
  }
}
