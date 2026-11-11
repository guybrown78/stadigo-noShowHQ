export default function ImportLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-slate-200" />
      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-muted">Working on the import…</p>
      </div>
    </div>
  );
}
