import Link from "next/link";

export default function VenueNotFound() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Venue not found
      </h1>
      <p className="mt-2 max-w-xl text-slate-600">
        This venue is not available. It may have been removed, or you may not
        have access to it.
      </p>
      <Link
        href="/settings/events"
        className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Back to venues
      </Link>
    </div>
  );
}
