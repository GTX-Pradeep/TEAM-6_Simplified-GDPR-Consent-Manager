import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { describeError } from "../api/auth";
import { getMyConsents, setConsent, type MyConsents, type PurposeState } from "../api/consents";
import { useAuth } from "../auth/AuthContext";
import { FormAlert } from "../components/AuthCard";
import { PolicyNoticeBanner } from "../components/PolicyNoticeBanner";

const badge: Record<PurposeState["status"], { label: string; cls: string }> = {
  GRANTED: { label: "Granted", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  WITHDRAWN: { label: "Withdrawn", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  NOT_GIVEN: { label: "Not given", cls: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * FR-4, FR-7, FR-8: the user's home screen. One card per processing purpose with its
 * current status and a single button to grant or withdraw. Nothing is pre-ticked:
 * a purpose the user never decided on shows "Not given".
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MyConsents | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMyConsents());
      setLoadError(null);
    } catch (err) {
      setLoadError(describeError(err).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(p: PurposeState) {
    const action = p.status === "GRANTED" ? "WITHDRAWN" : "GRANTED";
    setBusyId(p.purpose.id);
    setActionError(null);
    setNotice(null);
    try {
      const consent = await setConsent(p.purpose.id, action);
      setNotice(
        `${action === "GRANTED" ? "Consent granted" : "Consent withdrawn"} for "${p.purpose.name}" under policy v${consent.policyVersion.versionNo}.`,
      );
      await load();
    } catch (err) {
      setActionError(describeError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  const granted = data?.purposes.filter((p) => p.status === "GRANTED").length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Your privacy choices</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-900">Hello, {user?.name.split(" ")[0]}</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Decide what we may use your data for. You can change your mind at any time - withdrawing is as easy as
            granting.
          </p>
        </div>
        {data && (
          <div className="text-sm text-slate-600 sm:text-right">
            <p>
              <span className="text-2xl font-bold text-brand-900">{granted}</span> of {data.purposes.length} granted
            </p>
            {data.currentPolicy ? (
              <Link to="/policy" className="font-medium text-brand-700 hover:underline">
                Privacy policy v{data.currentPolicy.versionNo}
              </Link>
            ) : (
              <span className="text-amber-700">No privacy policy published yet</span>
            )}
            <span className="text-slate-300"> &middot; </span>
            <Link to="/history" className="font-medium text-brand-700 hover:underline">
              My history
            </Link>
          </div>
        )}
      </div>

      <PolicyNoticeBanner onChanged={() => void load()} />

      <div className="mt-6 space-y-3" aria-live="polite">
        {notice && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </div>
        )}
        {actionError && <FormAlert message={actionError} />}
        {loadError && <FormAlert message={loadError} />}
      </div>

      {!data && !loadError && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-40 animate-pulse bg-slate-100" />
          ))}
        </div>
      )}

      {data && data.purposes.length === 0 && (
        <div className="card mt-8 text-slate-600">There are no processing purposes yet.</div>
      )}

      {data && data.purposes.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {data.purposes.map((p) => {
            const b = badge[p.status];
            const busy = busyId === p.purpose.id;
            return (
              <li key={p.purpose.id} className="card flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-slate-900">{p.purpose.name}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${b.cls}`}>
                    {b.label}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-sm text-slate-600">{p.purpose.description}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    {p.updatedAt
                      ? `${b.label} ${formatWhen(p.updatedAt)} · policy v${p.policyVersion?.versionNo}`
                      : "You have not decided yet"}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    disabled={busy || busyId !== null || !data.currentPolicy}
                    className={p.status === "GRANTED" ? "btn-secondary" : "btn-primary"}
                    aria-label={`${p.status === "GRANTED" ? "Withdraw" : "Grant"} consent for ${p.purpose.name}`}
                  >
                    {busy ? "Saving..." : p.status === "GRANTED" ? "Withdraw" : "Grant"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
