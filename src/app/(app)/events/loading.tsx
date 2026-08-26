export default function EventsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-slate-200" />
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Loading events…</p>
      </div>
    </div>
  );
}
