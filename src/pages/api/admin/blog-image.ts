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

  let stage = "auth";
  try {
    stage = "parse form";
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File))
      return Response.json(
        { error: "Select an image to upload." },
        { status: 400 },
      );
    stage = "sanitize";
    const image = await sanitizeImage(file);

    stage = "save to mongo";
    const stored = await saveBlogImage({ ...image, uploadedBy: admin.email });

    stage = "record audit";
    await recordAudit({
      actor: admin.email,
      action: "upload",
      resourceType: "blog_image",
      resourceId: stored.id,
      details: `${image.bytes} bytes; MongoDB Base64`,
    });

    stage = "done";
    return Response.json(
      { url: stored.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // TEMPORARY STRUCTURED DEBUG LOGGING — remove after root cause is fixed.
    console.error("[blog-image:debug] upload failed", {
      stage,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      isUnsafeImage: error instanceof UnsafeImageError,
      prod: import.meta.env.PROD,
      auditKeysConfigured: Boolean(
        (process.env.AUDIT_LOG_KEYS || process.env.AUDIT_LOG_SECRET || "")
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean)
          .length,
      ),
      clamavHostConfigured: Boolean(process.env.CLAMAV_HOST),
      mongoUriConfigured: Boolean(process.env.MONGODB_URI),
      adminEmail: admin.email,
      contentLength: request.headers.get("content-length") || null,
      contentType: request.headers.get("content-type") || null,
      origin: request.headers.get("origin") || null,
    });

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
