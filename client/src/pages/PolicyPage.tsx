import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { describeError } from "../api/auth";
import { getCurrentPolicy, type Policy } from "../api/policies";
import { useAuth } from "../auth/AuthContext";
import { homeFor } from "../auth/roles";
import { FormAlert } from "../components/AuthCard";

/** FR-5: the privacy policy currently in force, with its version and effective date. */
export function PolicyPage() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<Policy | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentPolicy()
      .then(setPolicy)
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setPolicy(null);
        else setError(describeError(err).message);
      });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {user && (
        <Link to={homeFor(user.role)} className="text-sm font-medium text-brand-700 hover:underline">
          &larr; Back
        </Link>
      )}
      {error && (
        <div className="mt-6">
          <FormAlert message={error} />
        </div>
      )}
      {policy === undefined && !error && <div className="card mt-6 h-64 animate-pulse bg-slate-100" aria-hidden="true" />}
      {policy === null && (
        <div className="card mt-6">
          <h1 className="text-2xl font-bold text-brand-900">Privacy policy</h1>
          <p className="mt-2 text-slate-600">No privacy policy has been published yet.</p>
        </div>
      )}
      {policy && (
        <article className="card mt-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Version {policy.versionNo}</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-900">{policy.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            In force since{" "}
            {policy.effectiveAt
              ? new Date(policy.effectiveAt).toLocaleDateString(undefined, { dateStyle: "long" })
              : "-"}
            {" · "}
            {policy.changeSummary}
          </p>
          <div className="mt-6 whitespace-pre-line border-t border-slate-100 pt-6 leading-relaxed text-slate-700">
            {policy.body}
          </div>
        </article>
      )}
    </div>
  );
}
