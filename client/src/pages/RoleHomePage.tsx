import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../auth/roles";

/**
 * Temporary home screens. Each one is replaced by its real screen in a later issue:
 * /admin -> #12 policy editor, /dpo -> #22 DPO console.
 */
export function RoleHomePage({ title, comingIn }: { title: string; comingIn: string }) {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
        {user ? roleLabel[user.role] : ""}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-brand-900">
        {title}
        {user ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <div className="card mt-6 max-w-xl">
        <p className="text-slate-600">This screen is being built in {comingIn}.</p>
      </div>
    </div>
  );
}
