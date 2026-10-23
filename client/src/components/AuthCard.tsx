import type { ReactNode } from "react";

/** The centred card used by the login and register screens. */
export function AuthCard({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <div className="card">
          <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-4 text-center text-sm text-slate-600">{footer}</p>
      </div>
    </div>
  );
}

export function FormAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}
