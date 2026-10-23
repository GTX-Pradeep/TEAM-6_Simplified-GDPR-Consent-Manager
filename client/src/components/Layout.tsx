import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { homeFor, roleLabel } from "../auth/roles";
import { StatusPill } from "./StatusPill";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to={user ? homeFor(user.role) : "/"} className="flex items-center gap-2 font-semibold text-brand-900">
            <img src="/shield.svg" alt="" className="h-6 w-6" />
            <span>Consent Manager</span>
          </Link>
          <div className="flex items-center gap-3">
            <StatusPill />
            {user ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {user.name} <span className="text-slate-400">&middot; {roleLabel[user.role]}</span>
                </span>
                <button type="button" onClick={onLogout} className="btn-secondary px-3 py-1.5">
                  Log out
                </button>
              </>
            ) : user === null ? (
              <>
                <NavLink to="/login" className="text-sm font-semibold text-slate-700 hover:text-brand-700">
                  Log in
                </NavLink>
                <NavLink to="/register" className="btn-primary px-3 py-1.5">
                  Sign up
                </NavLink>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500 sm:px-6">
          Simplified GDPR Consent Manager &middot; Team 6 academic project. This is a simplified system and not a
          legal GDPR compliance certification.
        </div>
      </footer>
    </div>
  );
}
