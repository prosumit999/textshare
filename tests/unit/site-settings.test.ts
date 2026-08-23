import { describe, expect, it, beforeAll } from "vitest";
import { getSiteSettings, saveSiteSettings, defaultSiteSettings } from "../../src/lib/site-settings-store";
import { getMongo } from "../../src/lib/mongo";

describe("site settings store", () => {
  beforeAll(async () => {
    const { db } = await getMongo();
    await db.collection("siteSettings").deleteOne({ id: "global" });
  });

  it("loads defaults if settings do not exist", async () => {
    const settings = await getSiteSettings();
    expect(settings.footerDescription).toBe(defaultSiteSettings.footerDescription);
    expect(settings.extensionDescription).toBe(defaultSiteSettings.extensionDescription);
    expect(settings.heroEyebrow).toBe(defaultSiteSettings.heroEyebrow);
    expect(settings.heroTitle).toBe(defaultSiteSettings.heroTitle);
    expect(settings.heroSubtitle).toBe(defaultSiteSettings.heroSubtitle);
    expect(settings.seoTitle).toBe(defaultSiteSettings.seoTitle);
    expect(settings.seoContent).toBe(defaultSiteSettings.seoContent);
    expect(settings.socials).toEqual(defaultSiteSettings.socials);
    expect(settings.pages).toEqual(defaultSiteSettings.pages);
  });

  it("saves and retrieves settings correctly", async () => {
    const customSettings = {
      footerDescription: "Custom footer desc",
      extensionDescription: "Custom extension desc",
      socials: [
        { platform: "linkedin" as const, url: "https://linkedin.com/in/custom", enabled: true },
        { platform: "instagram" as const, url: "#", enabled: true },
        { platform: "github" as const, url: "#", enabled: true },
        { platform: "x" as const, url: "https://x.com/custom", enabled: false }
      ],
      pages: [
        { label: "My Custom Page", url: "/custom", enabled: true }
      ],
      heroEyebrow: "Custom eyebrow",
      heroTitle: "Custom title",
      heroSubtitle: "Custom subtitle",
      seoTitle: "Custom SEO Title",
      seoContent: "<p>Custom SEO HTML Content</p>"
    };
    
    await saveSiteSettings(customSettings);
    
    const settings = await getSiteSettings();
    expect(settings.footerDescription).toBe(customSettings.footerDescription);
    expect(settings.extensionDescription).toBe(customSettings.extensionDescription);
    expect(settings.heroEyebrow).toBe(customSettings.heroEyebrow);
    expect(settings.heroTitle).toBe(customSettings.heroTitle);
    expect(settings.heroSubtitle).toBe(customSettings.heroSubtitle);
    expect(settings.seoTitle).toBe(customSettings.seoTitle);
    expect(settings.seoContent).toBe(customSettings.seoContent);
    expect(settings.socials).toEqual(customSettings.socials);
    expect(settings.pages).toEqual(customSettings.pages);
  });
});
