import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "../api/auth";
import { useAuth } from "./AuthContext";
import { homeFor } from "./roles";

/**
 * Shows the page only to logged-in users with one of the given roles.
 * Not logged in -> login page (and back here afterwards). Wrong role -> own home screen.
 * (The API checks the role again on every request; this only keeps the UI tidy.)
 */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return (
      <div className="flex justify-center py-24" role="status" aria-live="polite">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}
