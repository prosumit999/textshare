import { describe, expect, it } from "vitest";
import { validatePasswordStrength } from "../../src/lib/auth";
import { sanitizeBlogHtml, blogTextExcerpt } from "../../src/lib/blog-content";
import { calculateExpiry, generateAvailableSlug } from "../../src/lib/share-policy";
import { MAX_SHARE_BYTES } from "../../src/lib/shares";

describe("share and content policy", () => {
  it("generates lowercase six-character slugs", async () => {
    const slug = await generateAvailableSlug("string", async () => false);
    expect(slug).toMatch(/^[a-z0-9]{6}$/);
  });
  it("generates numeric six-character slugs", async () => {
    const slug = await generateAvailableSlug("number", async () => false);
    expect(slug).toMatch(/^\d{6}$/);
  });
  it("calculates every supported expiry deterministically", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(calculateExpiry("1h", now).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(calculateExpiry("3h", now).toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(calculateExpiry("24h", now).toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(calculateExpiry("1w", now).toISOString()).toBe("2026-01-08T00:00:00.000Z");
    expect(calculateExpiry("burn", now).toISOString()).toBe("2026-01-01T00:05:00.000Z");
  });
  it("enforces the 50 MB share ceiling", () => expect(MAX_SHARE_BYTES).toBe(50 * 1024 * 1024));
  it("rejects weak passwords", () => {
    expect(validatePasswordStrength("password")).toBeTruthy();
    expect(validatePasswordStrength("OnlyLetters")).toBeTruthy();
    expect(validatePasswordStrength("UniquePassphrase42")).toBeNull();
  });
  it("removes executable blog markup and unsafe URLs", () => {
    const clean = sanitizeBlogHtml('<script>alert(1)</script><p onclick="x()">Safe</p><img src="javascript:alert(1)"><a href="https://example.com">Link</a>');
    expect(clean).not.toContain("script"); expect(clean).not.toContain("onclick"); expect(clean).not.toContain("javascript:");
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(blogTextExcerpt("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });
});
