"use client";

import Link from "next/link";

export default function FollowUpsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h1 className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
        Could not load follow-ups
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Something went wrong while loading this page. Your data has not been
        changed. You can try again, or go back to follow-ups.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Try again
        </button>
        <Link
          href="/follow-ups"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-wash"
        >
          Back to follow-ups
        </Link>
      </div>
    </div>
  );
}
