/**
 * NFR-1 / NFR-3 (TC-PERF-01, TC-SCAL-01): 50 users grant and withdraw consent at the same time.
 * Target: 95% of consent actions finish within 2 seconds.
 *
 *   k6 run perf/consent-actions.js
 *   k6 run -e BASE_URL=https://<your-api>/api/v1 perf/consent-actions.js
 *
 * Start the API with higher rate limits for this test (see perf/README.md).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, JSON_HEADERS, ensureUser, login } from "./lib.js";

const USERS = Number(__ENV.USERS || 50);
const PASSWORD = "Perf@12345";

export const options = {
  scenarios: {
    consent_actions: {
      executor: "constant-vus",
      vus: USERS,
      duration: __ENV.DURATION || "1m",
    },
  },
  thresholds: {
    "http_req_duration{name:consent_action}": ["p(95)<2000"], // NFR-1
    "http_req_duration{name:dashboard}": ["p(95)<2000"],
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
  },
};

/** Runs once: makes sure there is one test account per virtual user. */
export function setup() {
  for (let i = 1; i <= USERS; i++) ensureUser(`Perf User ${i}`, `perf${i}@load.test`, PASSWORD);
}

export default function () {
  // each virtual user logs in once with its own account
  if (__ITER === 0) {
    if (!login(`perf${__VU}@load.test`, PASSWORD)) return;
  }

  const dash = http.get(`${BASE}/me/consents`, { tags: { name: "dashboard" } });
  check(dash, { "dashboard 200": (r) => r.status === 200 });
  if (dash.status !== 200) return;

  const purposes = dash.json("purposes");
  if (!purposes || purposes.length === 0) return;

  // pick a purpose and flip it: grant if not granted, otherwise withdraw
  const p = purposes[Math.floor(Math.random() * purposes.length)];
  const action = p.status === "GRANTED" ? "WITHDRAWN" : "GRANTED";
  const res = http.post(
    `${BASE}/me/consents`,
    JSON.stringify({ purposeId: p.purpose.id, action }),
    Object.assign({ tags: { name: "consent_action" } }, JSON_HEADERS),
  );
  check(res, { "consent saved (201)": (r) => r.status === 201 });

  sleep(1); // think time between clicks
}
