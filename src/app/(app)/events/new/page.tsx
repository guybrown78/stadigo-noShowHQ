import Link from "next/link";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EventForm } from "@/components/events/event-form";
import {
  listEventTypesForTenant,
  listVenuesForTenant,
} from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";

export const metadata = { title: "Add event" };

export default async function NewEventPage() {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);

  const [types, venues] = await Promise.all([
    listEventTypesForTenant(prisma, user.tenantId),
    listVenuesForTenant(prisma, user.tenantId),
  ]);

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        Add event
      </p>
      <h1 className="mt-2 text-[1.75rem] leading-8 font-semibold tracking-[-0.02em] text-foreground">
        Add event
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Capture the operational details for one event. Staff bookings and
        absences will attach to this record later.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-surface p-6">
        <EventForm
          mode="create"
          types={types.map((type) => ({
            id: type.id,
            name: type.name,
            subtypes: type.subtypes.map((subtype) => ({
              id: subtype.id,
              name: subtype.name,
            })),
          }))}
          venues={venues}
        />
      </div>
    </div>
  );
}
