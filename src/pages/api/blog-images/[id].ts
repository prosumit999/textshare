import type { APIRoute } from "astro";
import sharp from "sharp";
import { getBlogImage } from "../../../lib/blog-images";

export const GET: APIRoute = async ({ params, request }) => {
  const image = await getBlogImage(params.id || "");
  if (!image || typeof image.dataUrl !== "string")
    return new Response("Not found", { status: 404 });

  const match = image.dataUrl.match(
    /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) return new Response("Not found", { status: 404 });

  const sourceMime = `image/${match[1]}`;
  const bytes = Buffer.from(match[2], "base64");

  // Optional width-based resize + WebP conversion for performance. Without
  // `?w=`, the original upload is served as-is (backward compatible).
  const widthParam = Number(
    new URL(request.url).searchParams.get("w") || "",
  );
  const width = Number.isInteger(widthParam) && widthParam > 0 ? widthParam : 0;

  if (width > 0 && sourceMime !== "image/webp") {
    try {
      const resized = await sharp(bytes)
        .rotate()
        .resize({ width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return new Response(resized, {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(resized.length),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // Fall through to serving the original if resize/conversion fails.
    }
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": sourceMime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
