// Shared helpers for the k6 load tests (issue #21).
import http from "k6/http";
import { check } from "k6";

export const BASE = __ENV.BASE_URL || "http://localhost:4000/api/v1";
export const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

/** Logs in (the session cookie is kept in this virtual user's cookie jar). */
export function login(email, password) {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password }), JSON_HEADERS);
  check(res, { "login 200": (r) => r.status === 200 });
  return res.status === 200;
}

/** Creates the account if it does not exist yet (409 = already there, also fine). */
export function ensureUser(name, email, password) {
  const res = http.post(`${BASE}/auth/register`, JSON.stringify({ name, email, password }), JSON_HEADERS);
  return res.status === 201 || res.status === 409;
}
