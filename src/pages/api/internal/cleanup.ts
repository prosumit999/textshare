import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { runCleanupWorker } from '../../../lib/cleanup';
import { serverEnv } from '../../../lib/env';

function validSecret(request: Request) {
  const configured = (serverEnv.CLEANUP_CRON_SECRETS || serverEnv.CLEANUP_CRON_SECRET || '').split(',').map((value) => value.trim()).filter(Boolean);
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!configured.length || !supplied) return false;
  const received = Buffer.from(supplied);
  return configured.some((secret) => { const expected = Buffer.from(secret); return expected.length === received.length && timingSafeEqual(expected, received); });
}

export const POST: APIRoute = async ({ request }) => {
  if (!validSecret(request)) return Response.json({ error: 'Not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    const report = await runCleanupWorker();
    return Response.json(report, { status: report.skipped ? 409 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Cleanup worker failed', error);
    return Response.json({ error: 'Cleanup worker failed.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
};
