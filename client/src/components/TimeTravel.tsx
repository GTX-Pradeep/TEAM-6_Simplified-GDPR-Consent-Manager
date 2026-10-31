import { useState, type FormEvent } from "react";
import { describeError } from "../api/auth";
import { getConsentStateAt, lookupUser, type ConsentStateAt } from "../api/dpo";
import { FormAlert } from "./AuthCard";

const badge = {
  GRANTED: { label: "Granted", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  WITHDRAWN: { label: "Withdrawn", cls: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  NOT_GIVEN: { label: "Not given", cls: "bg-slate-100 text-slate-600 ring-slate-500/20" },
} as const;

/** "2026-10-31T10:30" in the viewer's local time, for the datetime-local input. */
export function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * FR-20: pick a user and a past moment; see exactly what the user had agreed to then and
 * under which policy version. Times are entered and shown in local time and sent as UTC.
 */
export function TimeTravel() {
  const [email, setEmail] = useState("");
  const [at, setAt] = useState(localInputValue(new Date()));
  const [state, setState] = useState<ConsentStateAt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !at) {
      setError("Enter the user's e-mail address and a date and time.");
      return;
    }
    setBusy(true);
    try {
      const user = await lookupUser(email.trim());
      setState(await getConsentStateAt(user.id, new Date(at)));
    } catch (err) {
      setState(null);
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <form onSubmit={run} aria-label="Consent state at a past moment" className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="block text-xs font-medium text-slate-600">
          User e-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@demo.com"
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Date and time (your local time)
          <input
            type="datetime-local"
            value={at}
            max={localInputValue(new Date())}
            onChange={(e) => setAt(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Looking..." : "Show consent state"}
        </button>
      </form>

      {error && (
        <div className="mt-4">
          <FormAlert message={error} />
        </div>
      )}

      {state && (
        <section aria-label="Result" className="mt-6">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{state.user.name}</span> ({state.user.email}) on{" "}
            <span className="font-semibold text-slate-900">{when(state.at)}</span>
            {" · "}
            {state.policyInForce ? (
              <>
                policy <span className="font-semibold text-slate-900">v{state.policyInForce.versionNo}</span> was in force
              </>
            ) : (
              "no policy was published yet"
            )}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {state.purposes.map((p) => (
              <li key={p.purpose.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    {p.purpose.name}
                    {!p.purpose.isActive && <span className="ml-2 text-xs font-normal text-slate-500">(deactivated since)</span>}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${badge[p.status].cls}`}>
                    {badge[p.status].label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {p.decidedAt
                    ? `Decided ${when(p.decidedAt)} under policy v${p.policyVersion?.versionNo} · record #${p.recordId}`
                    : "No decision before this moment"}
                </p>
              </li>
            ))}
          </ul>
          {state.purposes.length === 0 && <p className="mt-4 text-slate-500">No purposes existed at that time.</p>}
        </section>
      )}
    </div>
  );
}
