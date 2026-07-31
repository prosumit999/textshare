import type { APIRoute } from "astro";
import { getCurrentUser, isAdminSessionVerified } from "../../../lib/auth";
import { recordAudit } from "../../../lib/admin";
import { sanitizeImage, UnsafeImageError } from "../../../lib/images";
import { saveBlogImage } from "../../../lib/blog-images";

export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = await getCurrentUser(cookies);
  if (
    !admin?.isAdmin ||
    admin.disabled ||
    !(await isAdminSessionVerified(cookies))
  ) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File))
      return Response.json(
        { error: "Select an image to upload." },
        { status: 400 },
      );
    const image = await sanitizeImage(file);

    const stored = await saveBlogImage({ ...image, uploadedBy: admin.email });
    await recordAudit({
      actor: admin.email,
      action: "upload",
      resourceType: "blog_image",
      resourceId: stored.id,
      details: `${image.bytes} bytes; MongoDB Base64`,
    });
    return Response.json(
      { url: stored.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof UnsafeImageError
        ? error.message
        : "Image upload failed.";
    return Response.json(
      { error: message },
      { status: error instanceof UnsafeImageError ? 400 : 500 },
    );
  }
};
