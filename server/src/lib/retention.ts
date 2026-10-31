import { config } from "../config";

/**
 * NFR-8 retention rule. Records younger than the retention period must never be removed.
 * The app has NO routine delete job at all: consent records and audit entries are
 * append-only (database triggers reject DELETE), and published policies are locked.
 * This helper is used by the backup report to show what has passed the period.
 */
export function retentionCutoff(now = new Date(), years = config.RETENTION_YEARS): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

/** True while a record created at `createdAt` is still inside the retention period. */
export function isWithinRetention(createdAt: Date, now = new Date(), years = config.RETENTION_YEARS): boolean {
  return createdAt >= retentionCutoff(now, years);
}
