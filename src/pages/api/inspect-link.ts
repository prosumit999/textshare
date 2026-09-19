import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const targetUrlStr = url.searchParams.get('url')?.trim();

  if (!targetUrlStr) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let validUrl: URL;
  try {
    let formatted = targetUrlStr;
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = 'https://' + formatted;
    }
    validUrl = new URL(formatted);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(validUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const xFrameOptions = response.headers.get('x-frame-options')?.toUpperCase() || null;
    const cspHeader = response.headers.get('content-security-policy')?.toLowerCase() || null;

    let canFrame = true;
    let frameRestriction = null;

    if (xFrameOptions === 'DENY' || xFrameOptions === 'SAMEORIGIN') {
      canFrame = false;
      frameRestriction = `X-Frame-Options: ${xFrameOptions}`;
    } else if (cspHeader && (cspHeader.includes('frame-ancestors') || cspHeader.includes("frame-src 'none'"))) {
      canFrame = false;
      frameRestriction = 'Content-Security-Policy (frame-ancestors)';
    }

    const contentType = response.headers.get('content-type') || '';
    let title = '';
    let description = '';
    let contentExcerpt = '';

    if (contentType.includes('text/html')) {
      const htmlText = await response.text();

      // Extract <title>
      const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }

      // Extract meta description
      const descMatch = htmlText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        htmlText.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                        htmlText.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch && descMatch[1]) {
        description = descMatch[1].trim();
      }

      // Clean text excerpt
      const bodyClean = htmlText
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      contentExcerpt = bodyClean.slice(0, 300);
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: validUrl.toString(),
        finalUrl: response.url,
        domain: validUrl.hostname,
        isHttps: validUrl.protocol === 'https:',
        status: response.status,
        statusText: response.statusText,
        title: title || validUrl.hostname,
        description: description || 'No page description provided.',
        canFrame,
        frameRestriction,
        contentType,
        contentExcerpt: contentExcerpt || 'Webpage content loaded.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        url: validUrl.toString(),
        domain: validUrl.hostname,
        isHttps: validUrl.protocol === 'https:',
        error: err?.name === 'AbortError' ? 'Request timed out' : 'Could not fetch page details',
        canFrame: true,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
