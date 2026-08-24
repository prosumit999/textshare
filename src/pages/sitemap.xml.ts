import type { APIRoute } from "astro";
import { getPublishedBlogPosts } from "../lib/admin";
import { getSiteSettings } from "../lib/site-settings-store";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export const GET: APIRoute = async ({ request }) => {
  const settings = await getSiteSettings();
  // The sitemap is only served when the owner enables it in the admin panel.
  if (!settings.blogSitemapEnabled) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const origin = new URL(request.url).origin;
  const posts = await getPublishedBlogPosts();

  const urls = posts
    .map((post) => {
      const loc = `${origin}/blog/${post.slug}`;
      const lastmod = isoDate(post.updatedAt || post.publishDate);
      return `<url><loc>${xmlEscape(loc)}</loc>${
        lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
      }<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
