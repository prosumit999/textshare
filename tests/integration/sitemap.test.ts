import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getMongo } from "../../src/lib/mongo";
import { saveBlogPost } from "../../src/lib/admin";
import {
  getSiteSettings,
  saveSiteSettings,
} from "../../src/lib/site-settings-store";
import { GET } from "../../src/pages/sitemap.xml.ts";

beforeAll(async () => {
  if (!process.env.MONGODB_URI?.includes("_test"))
    throw new Error("Integration tests require a _test database.");
  await getMongo();
});
beforeEach(async () => {
  const { db } = await getMongo();
  for (const name of ["blogPosts", "siteSettings"])
    await db.collection(name).deleteMany({});
});

const callGet = (origin = "http://example.com") =>
  GET({ request: new Request(`${origin}/sitemap.xml`) } as any);

it("returns 404 when the blog sitemap is disabled", async () => {
  await saveSiteSettings({
    ...(await getSiteSettings()),
    blogSitemapEnabled: false,
  });
  const res = await callGet();
  expect(res.status).toBe(404);
});

it("serves an XML sitemap of published blog posts when enabled", async () => {
  await saveSiteSettings({
    ...(await getSiteSettings()),
    blogSitemapEnabled: true,
  });
  await saveBlogPost({
    title: "Hello World",
    slug: "hello-world",
    category: "news",
    content: "<p>Hello</p>",
    coverImage: "",
    status: "published",
    publishDate: new Date(),
  });

  const res = await callGet();
  expect(res.status).toBe(200);
  const xml = await res.text();
  expect(xml).toContain("<urlset");
  expect(xml).toContain("http://example.com/blog/hello-world");
  expect(xml).toContain("http://www.sitemaps.org/schemas/sitemap/0.9");
});

it("excludes draft blog posts from the sitemap", async () => {
  await saveSiteSettings({
    ...(await getSiteSettings()),
    blogSitemapEnabled: true,
  });
  await saveBlogPost({
    title: "Draft",
    slug: "draft-post",
    category: "news",
    content: "<p>Draft</p>",
    coverImage: "",
    status: "draft",
    publishDate: null,
  });

  const res = await callGet();
  const xml = await res.text();
  expect(xml).not.toContain("/blog/draft-post");
});
