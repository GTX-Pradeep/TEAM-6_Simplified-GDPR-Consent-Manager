import { useEffect, useState } from "react";
import { getHealth, type Health } from "../api/client";

type State = { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "error" };

/** Live API + database status, refreshed every 15 seconds. */
export function StatusPill() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const load = () =>
      getHealth()
        .then((health) => alive && setState({ kind: "ok", health }))
        .catch(() => alive && setState({ kind: "error" }));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const view =
    state.kind === "loading"
      ? { dot: "bg-slate-400", text: "Checking API..." }
      : state.kind === "error"
        ? { dot: "bg-red-500", text: "API offline" }
        : state.health.db === "up"
          ? { dot: "bg-emerald-500", text: "API & database online" }
          : { dot: "bg-amber-500", text: "API online, database down" };

  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
    >
      <span className={`h-2 w-2 rounded-full ${view.dot}`} aria-hidden="true" />
      {view.text}
    </span>
  );
}
