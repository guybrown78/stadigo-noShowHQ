"use client";

import Link from "next/link";

export default function ImportError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Could not continue the import
      </h1>
      <p className="mt-2 max-w-xl text-slate-600">
        Something went wrong. No staff were created from this step. You can try
        again, or go back to staff.
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
          href="/staff"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Back to staff
        </Link>
      </div>
    </div>
  );
}
