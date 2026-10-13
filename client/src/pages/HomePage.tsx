const features = [
  {
    title: "Granular consent",
    text: "Grant or withdraw consent for each processing purpose with one click. Nothing is pre-ticked.",
    req: "FR-7, FR-8",
  },
  {
    title: "Policy versioning",
    text: "Every decision is linked to the exact privacy-policy version the user saw. Old versions are locked.",
    req: "FR-9, FR-13 to FR-15",
  },
  {
    title: "Tamper-evident audit trail",
    text: "Append-only records chained with SHA-256 hashes, so any later modification is detectable.",
    req: "FR-11, FR-17, SEC-6",
  },
  {
    title: "Consent time travel",
    text: "Auditors can see exactly what a user had agreed to at any moment in the past.",
    req: "FR-20",
  },
];

export function HomePage() {
  return (
    <div>
      <section className="bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Privacy, made traceable</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl">
            Record, review and withdraw consent - with proof for every decision.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">
            A consent manager for users, administrators and data-protection officers: clear choices for people,
            versioned policies for admins, and an audit trail you can trust.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled title="Available after Sprint 1">
              Get started
            </button>
            <a className="btn-secondary" href="/api/v1/health" target="_blank" rel="noreferrer">
              API health
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-brand-900">What it does</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <article key={f.title} className="card">
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.text}</p>
              <p className="mt-4 text-xs font-medium text-brand-600">{f.req}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
