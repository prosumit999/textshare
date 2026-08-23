import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4402",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && node dist/server/entry.mjs",
    url: "http://127.0.0.1:4402",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      MONGODB_URI:
        process.env.TEST_MONGODB_URI ||
        "mongodb://localhost:27017/textshare_e2e_test",
      SHARE_ENCRYPTION_KEYS: "e2e-encryption-key",
      AUDIT_LOG_KEYS: "e2e-audit-key",
      APP_ORIGIN: "http://127.0.0.1:4402",
      REDIS_URL: "",
      RATE_LIMIT_ALLOW_MEMORY: "true",
      CLAMAV_REQUIRED: "false",
      HOST: "127.0.0.1",
      PORT: "4402",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
