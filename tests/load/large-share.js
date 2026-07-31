import http from "k6/http";
import { check } from "k6";
export const options = { vus: 1, iterations: 1, thresholds: { http_req_duration: ["p(100)<10000"] } };
const origin = __ENV.BASE_URL || "http://127.0.0.1:4321";
export default function () {
  const body = { contentType: "text", textContent: "x".repeat(50 * 1024 * 1024 + 1), expiry: "24h", urlFormat: "string" };
  const response = http.post(`${origin}/`, body, { headers: { Origin: origin } });
  check(response, { "oversized submission rejected": (r) => r.status === 413 || r.body.includes("50 MB") });
}
