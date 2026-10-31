# Backup, restore and retention

Covers **NFR-8** (retention), **NFR-11** (backup and restore) and test cases **TC-DATA-01** and **TC-REL-03**.

## 1. Daily backup (recovery point: 24 hours)

The production database runs on **Neon PostgreSQL**. Neon keeps a continuous change history
and can restore the database to **any moment in the last 24 hours** (free plan; longer on paid plans).
That is the daily backup: no job has to be started by hand.

*Neon console -> your project -> Backup & Restore -> pick a time -> Restore to a new branch.*

## 2. Portable backup file (any time)

```bash
npm run db:backup -w server
```

Writes `server/backups/backup-<UTC time>.json` with every table (users, purposes, policy versions,
consent records, audit entries, review notices) read in **one transaction**, so the copy is consistent.

- The file contains e-mail addresses and password **hashes**: keep it private.
- `server/backups/` is in `.gitignore`, so it is never pushed to GitHub.
- The script also reports how many consent records are older than the retention period.

## 3. Restore (target: under 4 hours)

1. Create an **empty** database (for example a new Neon branch) and put its connection string in
   `server/.env` as `DATABASE_URL`.
2. Create the tables:
   ```bash
   npm run db:migrate -w server
   ```
3. Restore:
   ```bash
   npm run db:restore -w server -- backups/backup-2026-10-29T14-05-00Z.json
   ```

The restore runs in **one transaction** (all or nothing), refuses to write into a database that already
has users, keeps every id and hash unchanged (so the SHA-256 chains stay valid) and resets the id
counters so new records continue after the restored ones. It prints how long it took.

## 4. Restore test record

| Date | Backup file | Rows restored | Time taken | Result |
|---|---|---|---|---|
| _fill in after the test_ | | | | |

## 5. Retention (NFR-8)

- Setting: `RETENTION_YEARS` in `server/.env` (default **3**).
- There is **no routine delete job**. Consent records and audit entries are append-only (database
  triggers reject `DELETE`) and published policy versions are locked, so nothing younger than the
  retention period can be removed by normal operation.
- Removing data older than the period is a deliberate, manual task for the DPO.
