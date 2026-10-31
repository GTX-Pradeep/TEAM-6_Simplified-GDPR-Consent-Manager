import { NavLink } from "react-router-dom";

/** Tabs at the top of the admin console. */
export function AdminNav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${isActive ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <nav aria-label="Admin sections" className="mb-6 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
      <NavLink to="/admin" end className={cls}>
        Policies
      </NavLink>
      <NavLink to="/admin/users" className={cls}>
        Users &amp; roles
      </NavLink>
    </nav>
  );
}
