import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => new Response(JSON.stringify({ status: 'ok' }), {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
