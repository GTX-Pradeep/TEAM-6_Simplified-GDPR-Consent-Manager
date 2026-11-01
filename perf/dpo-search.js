/**
 * NFR-2 (TC-PERF-02): DPO search and filter. Target: 95% of first pages (50 rows) within 3 seconds.
 *
 *   k6 run perf/dpo-search.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, login } from "./lib.js";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "1m",
  thresholds: {
    "http_req_duration{name:search}": ["p(95)<3000"], // NFR-2
    checks: ["rate>0.99"],
  },
};

const QUERIES = [
  "/consents?page=1&pageSize=50",
  "/consents?action=GRANTED&pageSize=50",
  "/consents?purpose=MARKETING_EMAIL&pageSize=50",
  "/consents?from=2026-10-01&to=2026-12-31&pageSize=50",
  "/consents?user=Perf&action=WITHDRAWN&pageSize=50",
  "/audit?page=1&pageSize=50",
  "/audit?outcome=FAILURE&pageSize=50",
  "/audit?action=CONSENT_GRANTED&pageSize=50",
];

export default function () {
  if (__ITER === 0) {
    if (!login(__ENV.DPO_EMAIL || "dpo@demo.com", __ENV.DPO_PASSWORD || "Demo@12345")) return;
  }
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.get(`${BASE}${q}`, { tags: { name: "search" } });
  check(res, {
    "search 200": (r) => r.status === 200,
    "at most 50 rows": (r) => r.status !== 200 || r.json("items").length <= 50,
  });
  sleep(1);
}
