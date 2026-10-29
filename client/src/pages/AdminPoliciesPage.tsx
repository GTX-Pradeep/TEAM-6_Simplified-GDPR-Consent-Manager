import { useCallback, useEffect, useState, type FormEvent } from "react";
import { describeError } from "../api/auth";
import {
  createDraft,
  listPolicies,
  publishPolicy,
  updateDraft,
  type Policy,
  type PolicyInput,
} from "../api/policies";
import { FormAlert } from "../components/AuthCard";
import { FormField } from "../components/FormField";
import { PolicyStatusBadge } from "../components/PolicyStatusBadge";

const empty: PolicyInput = { versionNo: "", title: "Privacy Policy", changeSummary: "", body: "" };

/** Suggests the next version number, e.g. 1.0 -> 2.0. */
export function nextVersion(policies: Policy[]): string {
  const majors = policies.map((p) => parseInt(p.versionNo.split(".")[0], 10)).filter((n) => !Number.isNaN(n));
  return `${majors.length ? Math.max(...majors) + 1 : 1}.0`;
}

/**
 * FR-13, FR-14, FR-15: admin screen for policy versions. Drafts can be edited and
 * published; published and superseded versions are read-only (locked).
 */
export function AdminPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: PolicyInput } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPolicies(await listPolicies());
    } catch (err) {
      setError(describeError(err).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startNew() {
    setNotice(null);
    setError(null);
    setFieldErrors({});
    setEditing({ id: null, form: { ...empty, versionNo: nextVersion(policies ?? []) } });
  }

  function startEdit(p: Policy) {
    setNotice(null);
    setError(null);
    setFieldErrors({});
    setEditing({ id: p.id, form: { versionNo: p.versionNo, title: p.title, changeSummary: p.changeSummary, body: p.body } });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const saved = editing.id ? await updateDraft(editing.id, editing.form) : await createDraft(editing.form);
      setEditing(null);
      setNotice(`Draft v${saved.versionNo} saved.`);
      await load();
    } catch (err) {
      const d = describeError(err);
      setError(d.message);
      setFieldErrors(d.fields);
    } finally {
      setBusy(false);
    }
  }

  async function publish(p: Policy) {
    setBusy(true);
    setError(null);
    try {
      await publishPolicy(p.id);
      setConfirmId(null);
      setNotice(`Version ${p.versionNo} is now published. The previous version is superseded and locked.`);
      await load();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof PolicyInput) => (e: { target: { value: string } }) =>
    editing && setEditing({ ...editing, form: { ...editing.form, [k]: e.target.value } });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Admin console</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-900">Privacy policy versions</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Write a new version as a draft, then publish it. Published versions can never be edited, so every
            consent stays linked to the exact text the user saw.
          </p>
        </div>
        {!editing && (
          <button type="button" className="btn-primary" onClick={startNew}>
            New draft
          </button>
        )}
      </div>

      <div className="mt-6 space-y-3" aria-live="polite">
        {notice && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </div>
        )}
        {error && <FormAlert message={error} />}
      </div>

      {editing && (
        <form onSubmit={save} noValidate className="card mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing.id ? `Edit draft v${editing.form.versionNo}` : "New draft"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Version" value={editing.form.versionNo} onChange={set("versionNo")} error={fieldErrors.versionNo} hint="e.g. 2.0" />
            <div className="sm:col-span-2">
              <FormField label="Title" value={editing.form.title} onChange={set("title")} error={fieldErrors.title} />
            </div>
          </div>
          <FormField
            label="What changed"
            value={editing.form.changeSummary}
            onChange={set("changeSummary")}
            error={fieldErrors.changeSummary}
            hint="Shown to users with the new version"
          />
          <div>
            <label htmlFor="policy-body" className="block text-sm font-medium text-slate-700">
              Policy text
            </label>
            <textarea
              id="policy-body"
              rows={12}
              value={editing.form.body}
              onChange={set("body")}
              aria-invalid={fieldErrors.body ? true : undefined}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {fieldErrors.body && <p className="mt-1 text-xs text-red-600">{fieldErrors.body}</p>}
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving..." : "Save draft"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">In force since</th>
              <th className="px-4 py-3 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {policies === null && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {policies?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500">
                  No versions yet. Start with "New draft".
                </td>
              </tr>
            )}
            {policies?.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">v{p.versionNo}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-900">{p.title}</div>
                  <div className="text-xs text-slate-500">{p.changeSummary}</div>
                </td>
                <td className="px-4 py-3">
                  <PolicyStatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {p.effectiveAt ? new Date(p.effectiveAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.status === "DRAFT" ? (
                    confirmId === p.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-slate-600">Publish v{p.versionNo}?</span>
                        <button type="button" className="btn-primary px-3 py-1.5" onClick={() => publish(p)} disabled={busy}>
                          Confirm publish
                        </button>
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => startEdit(p)}>
                          Edit
                        </button>
                        <button type="button" className="btn-primary px-3 py-1.5" onClick={() => setConfirmId(p.id)}>
                          Publish
                        </button>
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-slate-500" title="Published versions cannot be changed">
                      Locked
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
