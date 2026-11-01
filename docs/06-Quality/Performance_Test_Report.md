# Performance test report (issue #21)

Covers **NFR-1**, **NFR-2**, **NFR-3**; test cases **TC-PERF-01**, **TC-PERF-02**, **TC-SCAL-01**.
How to run: see [`perf/README.md`](../../perf/README.md).

## Test environment

| Item | Value |
|---|---|
| Date | |
| API | local (`npm run dev`) / deployed URL: |
| Database | Neon PostgreSQL (region: ) |
| Machine running k6 | |
| Data volume before the test | users: ___ , consent records: ___ , audit entries: ___ |

## TC-PERF-01 / TC-SCAL-01: consent actions, 50 concurrent users (`consent-actions.js`)

| Metric | Target | Result | Pass? |
|---|---|---|---|
| Virtual users | 50 | | |
| Consent actions in 1 minute | - | | |
| p(95) consent action (`consent_action`) | < 2000 ms | | |
| p(95) dashboard load (`dashboard`) | < 2000 ms | | |
| Failed requests | < 1% | | |
| Checks passed | > 99% | | |

## TC-PERF-02: DPO search (`dpo-search.js`)

| Metric | Target | Result | Pass? |
|---|---|---|---|
| Virtual users | 10 | | |
| p(95) search (`search`) | < 3000 ms | | |
| Checks passed | > 99% | | |

## Notes

- NFR-3 also mentions 10,000 users and 500,000 records. That volume was not loaded for this course
  project; the test above uses the data present at the time (see "Data volume"). Recorded as a deviation.
-
