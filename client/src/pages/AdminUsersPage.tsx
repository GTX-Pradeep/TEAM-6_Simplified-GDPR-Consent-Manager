import { useCallback, useEffect, useState, type FormEvent } from "react";
import { describeError, type Role } from "../api/auth";
import { changeRole, listUsers, setActive, type AdminUser } from "../api/users";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../auth/roles";
import { AdminNav } from "../components/AdminNav";
import { FormAlert } from "../components/AuthCard";
import { Pager } from "../components/Pager";

const ROLES: Role[] = ["USER", "ADMIN", "DPO"];

/**
 * SEC-4: the administrator manages accounts: search, change a role, deactivate or
 * reactivate. Every change is audited and takes effect at once (open sessions end).
 * An admin cannot change or deactivate his own account.
 */
export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [data, setData] = useState<{ items: AdminUser[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listUsers({ q: applied || undefined, page, pageSize: 50 }));
    } catch (err) {
      setError(describeError(err).message);
    }
  }, [applied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(u: AdminUser, fn: () => Promise<AdminUser>, done: (x: AdminUser) => string) {
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await fn();
      setNotice(done(updated));
      await load();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied(q.trim());
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <AdminNav />
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Admin console</p>
      <h1 className="mt-1 text-3xl font-bold text-brand-900">Users and roles</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Change a role or deactivate an account. Changes take effect immediately and are recorded in the audit trail.
      </p>

      <form onSubmit={search} aria-label="Search users" className="mt-6 flex max-w-md gap-2">
        <input
          aria-label="Search by name or e-mail"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or e-mail"
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      <div className="mt-4 space-y-3" aria-live="polite">
        {notice && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </div>
        )}
        {error && <FormAlert message={error} />}
      </div>

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((u) => {
              const self = u.id === me?.id;
              const busy = busyId === u.id;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">
                      {u.name}
                      {self && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Role of ${u.name}`}
                      value={u.role}
                      disabled={self || busy}
                      onChange={(e) =>
                        act(u, () => changeRole(u.id, e.target.value as Role), (x) => `${x.name} is now ${roleLabel[x.role]}.`)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        u.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"
                      }`}
                    >
                      {u.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{new Date(u.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</td>
                  <td className="px-4 py-3 text-right">
                    {!self && (
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5"
                        disabled={busy}
                        onClick={() =>
                          act(u, () => setActive(u.id, !u.isActive), (x) =>
                            x.isActive ? `${x.name} can log in again.` : `${x.name} is deactivated and logged out.`,
                          )
                        }
                      >
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="px-4 py-6 text-slate-500">No users found.</p>}
        {!data && !error && <p className="px-4 py-6 text-slate-500">Loading...</p>}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}
