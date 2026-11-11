import Link from "next/link";
import { VenueForm } from "@/components/events/venue-form";

export const metadata = { title: "Add venue" };

export default function NewVenuePage() {
  return (
    <div>
      <p className="text-sm text-muted">
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
      <h1 className="mt-2 text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
        Add venue
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Save a venue for this organisation so it can be selected when you create
        events.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <VenueForm mode="create" />
      </div>
    </div>
  );
}
