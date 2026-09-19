import type { APIRoute } from 'astro';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { getCurrentUser } from '../../../lib/auth';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../../../lib/security';
import { MAX_SHARE_BYTES } from '../../../lib/shares';
import { hasShare, saveShare } from '../../../lib/share-store';
import { calculateExpiry, generateAvailableSlug, type ExpiryOption } from '../../../lib/share-policy';

export const POST: APIRoute = async ({ request, cookies, url }) => {
  try {
    const currentUser = await getCurrentUser(cookies);
    const isLoggedIn = !!currentUser;

    const requester = isLoggedIn ? currentUser!.email : getClientIp(request);
    const createLimit = await checkRateLimit('share:create', requester, isLoggedIn ? 30 : 15, 10 * 60);
    if (!createLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Share creation limit reached. Try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: any = {};
    const contentTypeHeader = request.headers.get('content-type') || '';
    if (contentTypeHeader.includes('application/json')) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    const textContent = (body.textContent || body.text || '').toString();
    const expiry: ExpiryOption = (['24h', '3h', 'burn', '1h', '1w'].includes(body.expiry) ? body.expiry : '24h') as ExpiryOption;
    const language = (body.language || 'plaintext').toString();
    const password = (body.password || '').toString();

    if (!textContent.trim()) {
      return new Response(JSON.stringify({ error: 'Please enter some text content.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (new TextEncoder().encode(textContent).byteLength > MAX_SHARE_BYTES) {
      return new Response(JSON.stringify({ error: 'Text content exceeds maximum allowed size (50 MB).' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let passwordHash: string | null = null;
    if (password && isLoggedIn) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const slug = await generateAvailableSlug('string', hasShare);
    const now = new Date();
    const expiryDate = calculateExpiry(expiry, now);
    const sizeBytes = Buffer.byteLength(textContent, 'utf8');

    await saveShare(slug, {
      contentType: 'text',
      textContent,
      imageSrc: null,
      expiryDate,
      burnAfterReading: expiry === 'burn',
      language,
      passwordHash,
      owner: isLoggedIn ? currentUser!.email : null,
      guestIp: isLoggedIn ? null : getClientIp(request),
      sizeBytes,
      createdAt: now,
      viewCount: 0,
    });

    const shareUrl = `${url.origin}/${slug}`;
    const qrCodeDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 300 });

    return new Response(
      JSON.stringify({
        success: true,
        slug,
        url: shareUrl,
        qrCode: qrCodeDataUrl,
        expiryTime: expiry === 'burn' ? 'Burn after view' : expiryDate.toISOString(),
        expiresAt: expiryDate.getTime(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Failed to create share' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
