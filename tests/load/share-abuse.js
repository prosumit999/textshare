import http from "k6/http";
import { check, sleep } from "k6";
import { randomString } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  scenarios: {
    slug_enumeration: {
      executor: "constant-arrival-rate",
      rate: 150,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 30,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<750"],
    http_req_failed: ["rate<0.10"],
  },
};
const origin = __ENV.BASE_URL || "http://127.0.0.1:4321";
export default function () {
  const slug = randomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  const response = http.get(`${origin}/${slug}`);
  check(response, {
    "generic response or throttled": (r) => [404, 429].includes(r.status),
  });
  sleep(0.01);
}
