import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getMongo } from "../../src/lib/mongo";
import {
  getShare,
  saveShare,
  revokeShare,
  setShareAnalyticsEnabled,
  updateShareExpiry,
  updateShareText,
} from "../../src/lib/share-store";
import {
  getShareAnalytics,
  recordShareView,
} from "../../src/lib/share-analytics";

const baseShare = (overrides: Record<string, unknown> = {}) => ({
  contentType: "text" as const,
  textContent: "lifecycle test content",
  imageSrc: null,
  imageSrcs: [],
  expiryDate: new Date(Date.now() + 3600_000),
  burnAfterReading: false,
  language: "plaintext",
  passwordHash: null,
  owner: "owner@example.com",
  guestIp: null,
  sizeBytes: 21,
  createdAt: new Date(),
  viewCount: 0,
  analyticsEnabled: false,
  ...overrides,
});

beforeAll(async () => {
  if (!process.env.MONGODB_URI?.includes("_test"))
    throw new Error("Integration tests require a _test database.");
  await getMongo();
});
beforeEach(async () => {
  const { db, bucket } = await getMongo();
  for (const name of ["shares", "shareViews"])
    await db.collection(name).deleteMany({});
  for (const file of await db
    .collection("sharePayloads.files")
    .find({})
    .toArray())
    await bucket.delete(file._id as any).catch(() => undefined);
});

describe("share lifecycle store", () => {
  it("persists the analytics opt-in flag", async () => {
    await saveShare("life1", baseShare({ analyticsEnabled: true }));
    expect((await getShare("life1"))?.analyticsEnabled).toBe(true);
  });

  it("revokes a share early and only by its owner", async () => {
    await saveShare("life2", baseShare({ owner: "owner@example.com" }));
    expect(await revokeShare("life2", "other@example.com")).toBe(false);
    expect((await getShare("life2"))?.revokedAt).toBeUndefined();
    expect(await revokeShare("life2", "owner@example.com")).toBe(true);
    expect((await getShare("life2"))?.revokedAt).toBeInstanceOf(Date);
  });

  it("extends expiry only for the owning account", async () => {
    await saveShare("life3", baseShare());
    const original = (await getShare("life3"))!.expiryDate;
    expect(
      await updateShareExpiry("life3", "other@example.com", new Date(original.getTime() + 1000)),
    ).toBe(false);
    const pushed = new Date(original.getTime() + 24 * 3600_000);
    expect(await updateShareExpiry("life3", "owner@example.com", pushed)).toBe(true);
    expect((await getShare("life3"))!.expiryDate.getTime()).toBe(pushed.getTime());
  });

  it("toggles analytics recording", async () => {
    await saveShare("life4", baseShare());
    expect(await setShareAnalyticsEnabled("life4", "owner@example.com", true)).toBe(true);
    expect((await getShare("life4"))?.analyticsEnabled).toBe(true);
  });

  it("updates text content only for the owner and only for text shares", async () => {
    await saveShare("life6", baseShare());
    expect(await updateShareText("life6", "other@example.com", "hijacked")).toBe(false);
    expect((await getShare("life6"))?.textContent).toBe("lifecycle test content");

    expect(await updateShareText("life6", "owner@example.com", "updated live text")).toBe(true);
    const updated = await getShare("life6");
    expect(updated?.textContent).toBe("updated live text");
    expect(updated?.sizeBytes).toBeGreaterThan(0);
  });
});

describe("share analytics recording", () => {
  it("records views and summarizes them", async () => {
    const request = new Request("http://localhost/slug", {
      headers: { "cf-ipcountry": "US", "x-real-ip": "8.8.8.8" },
    });
    await recordShareView("life5", request, "8.8.8.8");
    await recordShareView("life5", request, "8.8.8.8");
    await recordShareView(
      "life5",
      new Request("http://localhost/slug", { headers: { "x-real-ip": "10.0.0.1" } }),
      "10.0.0.1",
    );

    const analytics = await getShareAnalytics("life5");
    expect(analytics.totalViews).toBe(3);
    expect(analytics.uniqueIps).toBe(2);
    expect(analytics.recent).toHaveLength(3);
    const us = analytics.byCountry.find((row) => row.country === "US");
    const local = analytics.byCountry.find((row) => row.country === "Local");
    expect(us?.count).toBe(2);
    expect(local?.count).toBe(1);
  });
});
