import Link from "next/link";
import { VenueForm } from "@/components/events/venue-form";

export const metadata = { title: "Add venue" };

export default function NewVenuePage() {
  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href="/settings/events" className="hover:underline">
          Venues
        </Link>
        <span aria-hidden="true"> / </span>
        Add venue
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Add venue
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Save a venue for this organisation so it can be selected when you create
        events.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <VenueForm mode="create" />
      </div>
    </div>
  );
}
