import { useState } from "react";
import { describeError } from "../api/auth";
import { verifyIntegrity, type ChainReport, type IntegrityReport } from "../api/dpo";

function chainLine(name: string, c: ChainReport) {
  if (c.ok) return `${name}: ${c.checked} checked, chain intact`;
  const why = c.reason === "BROKEN_LINK" ? "does not link to the entry before it" : "its content does not match its hash";
  return `${name}: problem at #${c.firstBrokenId} - ${why}`;
}

/**
 * SEC-6: one click recomputes every SHA-256 hash in both chains and shows whether any
 * stored record was changed or removed.
 */
export function IntegrityCheck() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setReport(await verifyIntegrity());
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button type="button" className="btn-primary" onClick={run} disabled={busy}>
        {busy ? "Checking..." : "Verify integrity"}
      </button>
      <div aria-live="polite" className="max-w-md text-sm">
        {error && <p className="text-red-700">{error}</p>}
        {report && (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 ${
              report.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="font-semibold">
              {report.ok ? "All records intact - no tampering found" : "Tampering detected"}
            </p>
            <p className="mt-0.5 text-xs">{chainLine("Audit trail", report.audit)}</p>
            <p className="text-xs">{chainLine("Consent records", report.consents)}</p>
            <p className="mt-0.5 text-xs opacity-80">
              Checked {new Date(report.checkedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
