# Performance tests (issue #21)

Load tests written for [k6](https://k6.io). They cover **NFR-1** (consent action within 2 s),
**NFR-2** (search within 3 s) and **NFR-3** (50 concurrent users), test cases **TC-PERF-01**,
**TC-PERF-02** and **TC-SCAL-01**.

| Script | What it does | Pass when |
|---|---|---|
| `consent-actions.js` | 50 users (each with their own account) open the dashboard and grant/withdraw a purpose, once a second, for 1 minute | 95% of consent actions < **2 s**, < 1% errors |
| `dpo-search.js` | 10 DPO sessions run the console's searches (filters, paging, audit trail) for 1 minute | 95% of searches < **3 s** |

## 1. Install k6 (one time)

Windows (CMD):

```
winget install k6 --source winget
```

Close and reopen CMD, then check: `k6 version`.

## 2. Start the API with higher rate limits

The normal rate limit (10 logins per minute per network) would block 50 test users logging in at once,
so raise it **for this test only**. In one CMD window:

```
set AUTH_RATE_LIMIT_PER_MINUTE=1000
set API_RATE_LIMIT_PER_MINUTE=100000
npm run dev -w server
```

The database needs the demo data (`npm run db:seed -w server`), at least one published policy and some
purposes.

## 3. Run the tests

In a second CMD window, inside the project folder:

```
k6 run perf/consent-actions.js
k6 run perf/dpo-search.js
```

Options: `-e USERS=50 -e DURATION=1m` (consent test), `-e VUS=10` (search test),
`-e BASE_URL=https://<deployed-api>/api/v1` to test the deployed system.

At the end k6 prints a summary. The lines that matter:

- `http_req_duration{name:consent_action}` → **p(95)** must be below 2 s
- `http_req_duration{name:search}` → **p(95)** must be below 3 s
- `checks` → close to 100%
- each threshold shows ✓ (passed) or ✗ (failed)

Copy those numbers into `docs/06-Quality/Performance_Test_Report.md`.

The test users (`perf1@load.test` … `perf50@load.test`) stay in the database; their consent records are
real append-only data and are never deleted.
