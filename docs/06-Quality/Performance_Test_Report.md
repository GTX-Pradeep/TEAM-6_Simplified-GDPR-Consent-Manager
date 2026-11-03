# Performance test report (issue #21, executed for #25)

Covers **NFR-1**, **NFR-2**, **NFR-3**; test cases **TC-PERF-01**, **TC-PERF-02**, **TC-SCAL-01**.
How to run: see [`perf/README.md`](../../perf/README.md). Full evidence: [System Validation Report](../07-Test-Reports/System_Validation_Report.pdf).

## Test environment

| Item | Value |
|---|---|
| Date | 03-11-2026 |
| API | Project API code (Node 20, Express, Prisma 5) on a 2-vCPU Linux test machine, rate limits raised for the test |
| Database | PostgreSQL 16 on the same machine |
| Machine running k6 | same machine (k6 v0.54.0) |
| Data volume, TC-PERF-01/02 | normal demo data plus 50 load-test accounts |
| Data volume, TC-SCAL-01 | **10,059 users, 517,306 consent records** before the run (528,731 after) |

## TC-PERF-01: consent actions, 50 concurrent users, 1 minute (`consent-actions.js`)

| Metric | Target | Result | Pass? |
|---|---|---|---|
| Virtual users | 50 | 50 | ✅ |
| Consent actions in 1 minute | - | 1,253 | |
| p(95) consent action (`consent_action`) | < 2000 ms | 491 ms | ✅ |
| p(95) dashboard load (`dashboard`) | < 2000 ms | 251 ms | ✅ |
| Failed requests | < 1% | 0.00 % | ✅ |
| Checks passed | > 99% | 100.00 % | ✅ |

## TC-PERF-02: DPO search, 10 sessions, 1 minute (`dpo-search.js`)

| Metric | Target | Result | Pass? |
|---|---|---|---|
| Virtual users | 10 | 10 | ✅ |
| Searches | - | 550 | |
| p(95) search (`search`) | < 3000 ms | 42 ms | ✅ |
| Checks passed | > 99% | 100.00 % | ✅ |

## TC-SCAL-01: 10 minutes at volume (both scripts at the same time)

| Metric | Target | Result | Pass? |
|---|---|---|---|
| Concurrent users | 50 + 10 DPO | 60 | ✅ |
| Consent actions in 10 minutes | - | 11,425 | |
| p(95) consent action | < 2000 ms | 1171 ms | ✅ |
| p(95) dashboard | < 2000 ms | 942 ms | ✅ |
| p(95) DPO search over 500k records | < 3000 ms | 786 ms | ✅ |
| HTTP 5xx errors | 0 | 0 | ✅ |
| Failed requests | < 1% | 0.00 % / 0.00 % | ✅ |
| Audit entries lost | 0 | 0 | ✅ |

## Notes

- **Defect D-03 found and fixed.** The first 10-minute run showed that when all 50 users log in at the same
  second, some audit writes waited longer than Prisma's default 5 s transaction limit: 25 login audit entries were
  not written and 1 consent action returned 500 (rolled back, no orphan record). The audit chain is written
  one entry at a time (advisory lock), and 50 bcrypt checks at cost 12 keep the CPU busy. Fix: longer
  transaction limits in `server/src/lib/prisma.ts`. The re-run above has 0 lost entries and 0 errors.
- The slowest single requests (up to ~25 s) all happen in the first seconds while 60 accounts log in at once
  (bcrypt cost 12 is slow on purpose, SEC-1). After that, latency stays flat for the whole 10 minutes.
- The 500,000 consent records were inserted directly with SQL (synthetic hash values) to reach the NFR-3 volume quickly;
  the integrity check is therefore not meaningful on that test database. Recorded as a deviation.
- k6 scripts fixed during this run (defect D-02): `noCookiesReset: true` keeps each virtual user logged in,
  and a 409 "already registered" in setup is no longer counted as a failed request.
