"use client";

import Link from "next/link";

export default function EventSettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Could not load event settings
      </h1>
      <p className="mt-2 max-w-xl text-slate-600">
        Something went wrong while loading this page. Your data has not been
        changed. You can try again, or go back to settings.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Try again
        </button>
        <Link
          href="/settings"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Back to settings
        </Link>
      </div>
    </div>
  );
}
