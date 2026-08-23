import { describe, expect, it, beforeAll } from "vitest";
import { getPage, getPageBySlug, listPages, savePage, deletePage } from "../../src/lib/page-store";
import { getMongo } from "../../src/lib/mongo";

describe("custom pages store", () => {
  beforeAll(async () => {
    const { db } = await getMongo();
    await db.collection("pages").deleteMany({});
  });

  it("seeds default policy pages if database is empty", async () => {
    const pages = await listPages();
    // Should have privacy, terms, refund-policy, acceptable-use seeded
    expect(pages.length).toBe(4);
    const privacy = pages.find(p => p.slug === "privacy");
    expect(privacy).toBeDefined();
    expect(privacy?.title).toBe("Privacy Policy");
  });

  it("retrieves a page by ID and by slug", async () => {
    const pages = await listPages();
    const first = pages[0];
    const byId = await getPage(first.id);
    expect(byId).toEqual(first);

    const bySlug = await getPageBySlug(first.slug);
    expect(bySlug).toEqual(first);
  });

  it("saves a new page and edits an existing one", async () => {
    const newPage = await savePage({
      title: "About Us",
      slug: "about",
      eyebrow: "Company",
      summary: "All about TextShare.",
      content: "<section><h2>Our Story</h2><p>Founded in 2026.</p></section>"
    });

    expect(newPage.id).toBeDefined();
    expect(newPage.title).toBe("About Us");

    // Edit it
    await savePage({
      id: newPage.id,
      title: "About TextShare",
      slug: "about",
      eyebrow: "Company Info",
      summary: "Updated summary.",
      content: "<section><h2>Our Story</h2><p>Updated story.</p></section>"
    });

    const updated = await getPage(newPage.id);
    expect(updated?.title).toBe("About TextShare");
    expect(updated?.eyebrow).toBe("Company Info");
    expect(updated?.summary).toBe("Updated summary.");
  });

  it("deletes a page", async () => {
    const newPage = await savePage({
      title: "Temp Page",
      slug: "temp",
      eyebrow: "Temp",
      summary: "Delete me",
      content: "<p>Soon gone</p>"
    });

    const beforeDelete = await getPage(newPage.id);
    expect(beforeDelete).toBeDefined();

    const success = await deletePage(newPage.id);
    expect(success).toBe(true);

    const afterDelete = await getPage(newPage.id);
    expect(afterDelete).toBeNull();
  });
});
