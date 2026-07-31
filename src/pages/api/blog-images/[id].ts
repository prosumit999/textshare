import type { APIRoute } from "astro";
import { getBlogImage } from "../../../lib/blog-images";

export const GET: APIRoute = async ({ params }) => {
  const image = await getBlogImage(params.id || "");
  if (!image || typeof image.dataUrl !== "string")
    return new Response("Not found", { status: 404 });
  const match = image.dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(match[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": match[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
