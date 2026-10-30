/** "Showing 1-50 of 120" with Previous / Next buttons. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>
        Showing {from}-{to} of {total}
      </span>
      <span className="flex gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className="btn-secondary px-3 py-1.5" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}
