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
    // CSP is deliberately NOT configured here. Astro's built-in CSP only
    // supports static SHA-256 hashes of first-party inline scripts, which
    // cannot cover Cloudflare's edge-injected inline scripts (JS Detections)
    // or allow the Web Analytics beacon. src/middleware.ts is the single
    // source of truth: it emits a nonce-based CSP (the mechanism Cloudflare
    // documents for its injected scripts) and injects the nonce into the
    // response HTML. Keeping two CSP implementations would make browsers
    // enforce their intersection, which is what broke production.
  },
  adapter: node({
    mode: "standalone",
  }),
});
