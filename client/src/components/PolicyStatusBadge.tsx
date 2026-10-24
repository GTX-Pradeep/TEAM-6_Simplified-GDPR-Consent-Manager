import type { PolicyStatus } from "../api/policies";

const styles: Record<PolicyStatus, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DRAFT: "bg-sky-50 text-sky-700 ring-sky-600/20",
  SUPERSEDED: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const labels: Record<PolicyStatus, string> = { PUBLISHED: "Published", DRAFT: "Draft", SUPERSEDED: "Superseded" };

export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
