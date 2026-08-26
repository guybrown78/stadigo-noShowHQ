import Link from "next/link";
import { notFound } from "next/navigation";
import { VenueForm } from "@/components/events/venue-form";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventAccessError } from "@/lib/events/errors";
import { getVenueForTenant } from "@/lib/events/venues";

export const metadata = { title: "Edit venue" };

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;

  let venue;
  try {
    venue = await getVenueForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/settings" className="hover:underline">
          Settings
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href="/settings/events" className="hover:underline">
          Event settings
        </Link>
        <span aria-hidden="true"> / </span>
        Edit
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Edit venue
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Changes apply to this organisation only. Existing events keep this
        venue and show the updated name and address.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <VenueForm
          mode="edit"
          venueId={venue.id}
          initialValues={{
            name: venue.name,
            addressLine1: venue.addressLine1,
            townCity: venue.townCity,
            postcode: venue.postcode,
            active: venue.active,
          }}
        />
      </div>
    </div>
  );
}
