// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  markdown: { syntaxHighlight: false },
  security: {
    // Coolify terminates TLS at Traefik and forwards the public host to this
    // container. Trust that forwarded host so Astro can compare form origins
    // against the real public URL instead of the container's localhost URL.
    allowedDomains: [{ hostname: "**" }],
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "object-src 'none'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "report-uri /api/csp-report",
      ],
      scriptDirective: {
        resources: ["'self'", "https://challenges.cloudflare.com"],
      },
      styleDirective: {
        resources: [
          "'self'",
          {
            resource: "'unsafe-inline'",
            kind: "attribute",
          },
        ],
      },
    },
  },
  adapter: node({
    mode: "standalone",
  }),
});
