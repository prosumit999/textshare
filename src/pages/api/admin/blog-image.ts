import { createHash } from 'node:crypto';
import type { APIRoute } from 'astro';
import { getCurrentUser, isAdminSessionVerified } from '../../../lib/auth';
import { recordAudit } from '../../../lib/admin';
import { sanitizeImage, UnsafeImageError } from '../../../lib/images';

export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = getCurrentUser(cookies);
  if (!admin?.isAdmin || admin.disabled || !isAdminSessionVerified(cookies)) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return Response.json({ error: 'Select an image to upload.' }, { status: 400 });
    const image = await sanitizeImage(file);

    const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || import.meta.env.CLOUINARY_CLOUD || process.env.CLOUINARY_CLOUD;
    const apiKey = import.meta.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || import.meta.env.CLOUDINARY_API || process.env.CLOUDINARY_API;
    const apiSecret = import.meta.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = import.meta.env.CLOUDINARY_UPLOAD_PRESET || process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || (!apiSecret && !uploadPreset) || (apiSecret && !apiKey)) {
      return Response.json({ error: 'Cloudinary needs CLOUDINARY_CLOUD_NAME plus either API key/secret or an unsigned upload preset.' }, { status: 503 });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const upload = new FormData();
    upload.set('file', image.dataUrl);
    upload.set('folder', 'textshare/blog');
    if (apiSecret && apiKey) {
      const signature = createHash('sha1').update(`folder=textshare/blog&timestamp=${timestamp}${apiSecret}`).digest('hex');
      upload.set('api_key', apiKey);
      upload.set('timestamp', timestamp);
      upload.set('signature', signature);
    } else {
      upload.set('upload_preset', uploadPreset!);
    }

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: 'POST', body: upload });
    const result = await response.json() as { secure_url?: string; public_id?: string; error?: { message?: string } };
    if (!response.ok || !result.secure_url || !result.secure_url.startsWith(`https://res.cloudinary.com/${cloudName}/`)) {
      return Response.json({ error: result.error?.message || 'Cloudinary rejected the upload.' }, { status: 502 });
    }
    recordAudit({ actor: admin.email, action: 'upload', resourceType: 'blog_image', resourceId: result.public_id || 'cloudinary', details: `${image.bytes} bytes` });
    return Response.json({ url: result.secure_url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof UnsafeImageError ? error.message : 'Image upload failed.';
    return Response.json({ error: message }, { status: error instanceof UnsafeImageError ? 400 : 500 });
  }
};
