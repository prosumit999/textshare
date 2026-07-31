import type { APIRoute } from "astro";
import { getClientIp, logSecurityEvent } from "../../lib/security";

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 64 * 1024) return new Response(null, { status: 413 });
    const parsed = JSON.parse(raw || "{}");
    const report = parsed["csp-report"] || parsed.body || parsed;
    await logSecurityEvent("csp_violation", request, {
      documentUri: String(report["document-uri"] || report.documentURL || "").slice(0, 300),
      violatedDirective: String(report["violated-directive"] || report.effectiveDirective || "").slice(0, 100),
      blockedUri: String(report["blocked-uri"] || report.blockedURL || "").slice(0, 300),
      sourceFile: String(report["source-file"] || report.sourceFile || "").slice(0, 300),
      ip: getClientIp(request),
    });
  } catch { /* Browsers do not need diagnostic details from report ingestion. */ }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
