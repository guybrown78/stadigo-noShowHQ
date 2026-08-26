import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/events/event-form";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatLocalDateIso } from "@/lib/events/dates";
import { EventAccessError } from "@/lib/events/errors";
import {
  getEventForTenant,
  listEventTypesForTenant,
  listVenuesForTenant,
} from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);
  const { id } = await params;

  let event;
  try {
    event = await getEventForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  const [types, venues] = await Promise.all([
    listEventTypesForTenant(prisma, user.tenantId),
    listVenuesForTenant(prisma, user.tenantId),
  ]);

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/events/${event.id}`} className="hover:underline">
          {event.name}
        </Link>
        <span aria-hidden="true"> / </span>
        Edit
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Edit event
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Update operational details. The event stays in this organisation and
        keeps its original record identifier.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <EventForm
          mode="edit"
          eventId={event.id}
          types={types.map((type) => ({
            id: type.id,
            name: type.name,
            subtypes: type.subtypes.map((subtype) => ({
              id: subtype.id,
              name: subtype.name,
            })),
          }))}
          venues={venues}
          initialValues={{
            name: event.name,
            reference: event.reference,
            eventTypeId: event.eventTypeId,
            eventSubtypeId: event.eventSubtypeId,
            venueId: event.venueId,
            eventDate: formatLocalDateIso(event.eventDate),
            briefingTime: event.briefingTime,
            startTime: event.startTime,
            endTime: event.endTime,
            endsNextDay: event.endsNextDay,
            staffRequired: event.staffRequired,
            warningFillRate: event.warningFillRate,
            criticalFillRate: event.criticalFillRate,
            status: event.status,
            notes: event.notes,
          }}
        />
      </div>
    </div>
  );
}
