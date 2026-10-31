import { useCallback, useEffect, useState, type FormEvent } from "react";
import { describeError } from "../api/auth";
import { listAuditEntries, listConsentRecords, type AuditRow, type ConsentRecordRow, type Page } from "../api/dpo";
import { FormAlert } from "../components/AuthCard";
import { IntegrityCheck } from "../components/IntegrityCheck";
import { TimeTravel } from "../components/TimeTravel";
import { Pager } from "../components/Pager";

type Tab = "consents" | "audit" | "time";

/** FR-19 search fields. Empty fields are not sent. */
export type Filters = Record<string, string>;
const emptyFilters: Record<Tab, Filters> = {
  consents: { user: "", purpose: "", action: "", policyVersion: "", from: "", to: "" },
  audit: { actor: "", action: "", outcome: "", from: "", to: "" },
  time: {},
};

/** Drops empty values so the URL only carries real filters. */
export function activeFilters(f: Filters): Filters {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim() !== ""));
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

function ActionBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        ok ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-800 ring-amber-600/20"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * FR-18: the DPO / auditor console. Read-only lists of every consent record and the
 * audit trail, newest first, 50 per page. There are no edit or delete controls.
 */
export function DpoConsolePage() {
  const [tab, setTab] = useState<Tab>("consents");
  const [page, setPage] = useState(1);
  const [consents, setConsents] = useState<Page<ConsentRecordRow> | null>(null);
  const [audit, setAudit] = useState<Page<AuditRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<Tab, Filters>>(emptyFilters);
  const [applied, setApplied] = useState<Record<Tab, Filters>>(emptyFilters);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { page, pageSize: 50, ...activeFilters(applied[tab]) };
      if (tab === "consents") setConsents(await listConsentRecords(params));
      else if (tab === "audit") setAudit(await listAuditEntries(params));
    } catch (err) {
      setError(describeError(err).message);
    }
  }, [tab, page, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => switchTab(t)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        tab === t ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  const data = tab === "consents" ? consents : tab === "audit" ? audit : null;
  const f = draft[tab];
  const setField = (k: string) => (e: { target: { value: string } }) =>
    setDraft({ ...draft, [tab]: { ...draft[tab], [k]: e.target.value } });

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied({ ...applied, [tab]: draft[tab] });
    setPage(1);
  }

  function clear() {
    setDraft({ ...draft, [tab]: emptyFilters[tab] });
    setApplied({ ...applied, [tab]: emptyFilters[tab] });
    setPage(1);
  }

  const filtering = Object.keys(activeFilters(applied[tab])).length > 0;
  const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
  const field = (label: string, el: JSX.Element) => (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {el}
    </label>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">DPO console &middot; read-only</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-900">Consent records and audit trail</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Every consent decision and every security-relevant action, exactly as stored. Records are append-only and
            hash-chained, so nothing here can be edited or deleted.
          </p>
        </div>
        <IntegrityCheck />
      </div>

      <div role="tablist" aria-label="DPO views" className="mt-6 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {tabBtn("consents", "Consent records")}
        {tabBtn("audit", "Audit trail")}
        {tabBtn("time", "Time travel")}
      </div>

      {tab === "time" ? (
        <div className="card mt-4 p-0" role="tabpanel">
          <TimeTravel />
        </div>
      ) : (
      <>
      <form
        onSubmit={search}
        aria-label={tab === "consents" ? "Search consent records" : "Search audit trail"}
        className="card mt-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7"
      >
        {tab === "consents" ? (
          <>
            {field("User (name or e-mail)", <input className={input} value={f.user} onChange={setField("user")} />)}
            {field("Purpose code", <input className={input} value={f.purpose} onChange={setField("purpose")} placeholder="ANALYTICS" />)}
            {field("Decision",
              <select className={input} value={f.action} onChange={setField("action")}>
                <option value="">Any</option>
                <option value="GRANTED">Granted</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>,
            )}
            {field("Policy version", <input className={input} value={f.policyVersion} onChange={setField("policyVersion")} placeholder="2.0" />)}
          </>
        ) : (
          <>
            {field("Actor (name or e-mail)", <input className={input} value={f.actor} onChange={setField("actor")} />)}
            {field("Action", <input className={input} value={f.action} onChange={setField("action")} placeholder="LOGIN_FAILED" />)}
            {field("Outcome",
              <select className={input} value={f.outcome} onChange={setField("outcome")}>
                <option value="">Any</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILURE">Failure</option>
              </select>,
            )}
            <span className="hidden lg:block" />
          </>
        )}
        {field("From", <input type="date" className={input} value={f.from} onChange={setField("from")} />)}
        {field("To", <input type="date" className={input} value={f.to} onChange={setField("to")} />)}
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary px-3 py-1.5">
            Search
          </button>
          {filtering && (
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={clear}>
              Clear
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="mt-4">
          <FormAlert message={error} />
        </div>
      )}

      <div className="card mt-4 overflow-x-auto p-0" role="tabpanel">
        {tab === "consents" ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Purpose</th>
                <th className="px-4 py-3 font-semibold">Decision</th>
                <th className="px-4 py-3 font-semibold">Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consents?.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-slate-500">{r.id}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{when(r.recordedAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-slate-900">{r.user.name}</div>
                    <div className="text-xs text-slate-500">{r.user.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{r.purpose.name}</td>
                  <td className="px-4 py-2.5">
                    <ActionBadge ok={r.action === "GRANTED"} label={r.action === "GRANTED" ? "Granted" : "Withdrawn"} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">v{r.policyVersion.versionNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Target</th>
                <th className="px-4 py-3 font-semibold">Outcome</th>
                <th className="px-4 py-3 font-semibold">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {audit?.items.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5 text-slate-500">{a.id}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{when(a.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    {a.actor ? (
                      <>
                        <div className="text-slate-900">{a.actor.name}</div>
                        <div className="text-xs text-slate-500">{a.actor.email}</div>
                      </>
                    ) : (
                      <span className="text-slate-500">Anonymous</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{a.action}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{a.targetType}</td>
                  <td className="px-4 py-2.5">
                    <ActionBadge ok={a.outcome === "SUCCESS"} label={a.outcome === "SUCCESS" ? "Success" : "Failure"} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500" title={a.hash}>
                    {a.hash.slice(0, 10)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.items.length === 0 && (
          <p className="px-4 py-6 text-slate-500">{filtering ? "No results match these filters." : "Nothing recorded yet."}</p>
        )}
        {!data && !error && <p className="px-4 py-6 text-slate-500">Loading...</p>}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
      </>
      )}
    </div>
  );
}
