import Link from "next/link";

export default function VenueNotFound() {
  return (
    <div>
      <h1 className="text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
        Venue not found
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        This venue is not available. It may have been removed, or you may not
        have access to it.
      </p>
      <Link
        href="/settings/events"
        className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Back to venues
      </Link>
    </div>
  );
}
