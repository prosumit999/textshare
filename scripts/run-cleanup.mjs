import "dotenv/config";
const origin = (process.env.APP_ORIGIN || "http://127.0.0.1:4321").replace(
  /\/$/,
  "",
);
const secret = process.env.CLEANUP_CRON_SECRET;
if (!secret) throw new Error("CLEANUP_CRON_SECRET is required.");
const response = await fetch(`${origin}/api/internal/cleanup`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});
const body = await response.text();
if (!response.ok)
  throw new Error(`Cleanup request failed (${response.status}): ${body}`);
console.log(body);
