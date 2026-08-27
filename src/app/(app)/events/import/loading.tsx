export default function ImportLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-slate-200" />
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Working on the import…</p>
      </div>
    </div>
  );
}
