export function LedgerTypeNav({ activeCount }: { activeCount: number }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Absence type"
        className="flex flex-wrap items-center gap-2"
      >
        <span
          role="tab"
          aria-selected="true"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Cancellations
        </span>
        <span
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400"
        >
          AWOL{" "}
          <span className="text-xs font-medium text-slate-500">
            Coming soon
          </span>
        </span>
        <span
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400"
        >
          Sickness{" "}
          <span className="text-xs font-medium text-slate-500">
            Coming soon
          </span>
        </span>
      </div>
      <p className="text-sm text-slate-600" aria-live="polite">
        {activeCount}{" "}
        {activeCount === 1 ? "active Cancellation" : "active Cancellations"}
      </p>
    </div>
  );
}
