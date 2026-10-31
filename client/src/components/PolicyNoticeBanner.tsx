import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { describeError } from "../api/auth";
import { acknowledgeNotice, getMyNotices, reconfirmNotice, type PolicyNotice } from "../api/notices";

/**
 * FR-16: shown on the dashboard after login when the privacy policy changed since the user
 * gave some consents. The user can keep them under the new version in one click, or
 * withdraw individual purposes with the cards below and then close the notice.
 */
export function PolicyNoticeBanner({ onChanged }: { onChanged: () => void }) {
  const [notice, setNotice] = useState<PolicyNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    getMyNotices()
      .then((n) => setNotice(n[0] ?? null))
      .catch(() => setNotice(null)); // the dashboard still works without the banner
  }, []);

  async function run(fn: () => Promise<string>) {
    if (!notice) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await fn());
      setNotice(null);
      onChanged();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {done}
      </div>
    );
  }
  if (!notice) return null;

  const names = notice.purposes.map((p) => p.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

  return (
    <section aria-label="Privacy policy updated" className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <h2 className="font-semibold text-sky-900">Our privacy policy changed to version {notice.policy.versionNo}</h2>
      <p className="mt-1 text-sm text-sky-900">
        What changed: {notice.policy.changeSummary}.{" "}
        <Link to="/policy" className="font-semibold underline">
          Read the new policy
        </Link>
      </p>
      {names.length > 0 && (
        <p className="mt-2 text-sm text-sky-900">
          You agreed to <strong>{list}</strong> under an older version. Do you want to keep{" "}
          {names.length > 1 ? "these choices" : "this choice"}? You can also withdraw{" "}
          {names.length > 1 ? "any of them" : "it"} below.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {names.length > 0 && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await reconfirmNotice(notice.id);
                return `Thanks - ${r.reconfirmed} consent${r.reconfirmed === 1 ? "" : "s"} confirmed under policy v${notice.policy.versionNo}.`;
              })
            }
          >
            Keep my choices
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await acknowledgeNotice(notice.id);
              return "Thanks for reviewing the new policy.";
            })
          }
        >
          {names.length > 0 ? "I've reviewed them" : "OK"}
        </button>
      </div>
    </section>
  );
}
