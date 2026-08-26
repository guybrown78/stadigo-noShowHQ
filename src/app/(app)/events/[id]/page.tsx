import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEventDialog } from "@/components/events/delete-event-dialog";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  formatTimeRange,
} from "@/lib/events/dates";
import { EventAccessError } from "@/lib/events/errors";
import { getEventForTenant } from "@/lib/events/queries";

export const metadata = { title: "Event" };

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const flash = await searchParams;

  let event;
  try {
    event = await getEventForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  const timeRange = formatTimeRange(
    event.startTime,
    event.endTime,
    event.endsNextDay,
  );

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/events" className="hover:underline">
          Events
        </Link>
        <span aria-hidden="true"> / </span>
        {event.name}
      </p>

      {flash.created === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Event created.
        </p>
      ) : null}
      {flash.updated === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Event updated.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {event.name}
            </h1>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="mt-2 text-slate-600">
            {formatLocalDateDisplay(event.eventDate)}
            {timeRange ? ` · ${timeRange}` : ""}
            {` · ${event.venue.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/events/${event.id}/edit`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Edit event
          </Link>
          <DeleteEventDialog eventId={event.id} eventName={event.name} />
        </div>
      </div>

      <dl className="mt-8 grid gap-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <Detail label="Reference">{event.reference ?? "—"}</Detail>
        <Detail label="Status">
          <EventStatusBadge status={event.status} />
        </Detail>
        <Detail label="Event type">{event.eventType.name}</Detail>
        <Detail label="Event subtype">{event.eventSubtype.name}</Detail>
        <Detail label="Venue">
          {event.venue.name}
          {event.venue.postcode ? ` · ${event.venue.postcode}` : ""}
        </Detail>
        <Detail label="Event date">
          {formatLocalDateDisplay(event.eventDate)}
          <span className="sr-only"> {formatLocalDateIso(event.eventDate)}</span>
        </Detail>
        <Detail label="Briefing time">{event.briefingTime ?? "—"}</Detail>
        <Detail label="Start / end">
          {timeRange ?? "—"}
        </Detail>
        <Detail label="Staff required">{event.staffRequired}</Detail>
        <Detail label="Fill-rate thresholds">
          Warning {event.warningFillRate}% · Critical {event.criticalFillRate}%
        </Detail>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-slate-500">Notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-900">
            {event.notes ?? "—"}
          </dd>
        </div>
        <Detail label="Created">
          {event.createdAt.toLocaleString("en-GB")}
        </Detail>
        <Detail label="Last updated">
          {event.updatedAt.toLocaleString("en-GB")}
        </Detail>
      </dl>
    </div>
  );
}
