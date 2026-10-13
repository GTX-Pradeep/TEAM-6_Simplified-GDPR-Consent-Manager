import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatusPill } from "./StatusPill";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-brand-900">
            <img src="/shield.svg" alt="" className="h-6 w-6" />
            <span>Consent Manager</span>
          </Link>
          <StatusPill />
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
