import Link from "next/link";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EVENT_STATUSES } from "@/lib/events/catalog";
import { formatLocalDateDisplay, formatTimeRange } from "@/lib/events/dates";
import { EVENT_STATUS_LABELS } from "@/lib/events/display";
import {
  EVENT_PAGE_SIZE,
  listEventsForTenant,
  listEventTypesForTenant,
} from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";
import { eventListQuerySchema, type EventListQuery } from "@/lib/events/schema";
import { eventsListHref } from "@/lib/events/url";
import { DeleteEventDialog } from "@/components/events/delete-event-dialog";
import { EventStatusBadge } from "@/components/events/event-status-badge";

export const metadata = { title: "Events" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  await ensureTenantEventCatalog(prisma, user.tenantId);

  const raw = await searchParams;
  const parsedQuery = eventListQuerySchema.safeParse({
    q: first(raw.q),
    status: first(raw.status),
    type: first(raw.type),
    range: first(raw.range) || "all",
    from: first(raw.from),
    to: first(raw.to),
    page: first(raw.page) || "1",
  });
  const query: EventListQuery = parsedQuery.success
    ? parsedQuery.data
    : {
        q: "",
        status: "",
        type: "",
        range: "all",
        from: "",
        to: "",
        page: 1,
      };

  const types = await listEventTypesForTenant(prisma, user.tenantId);
  const list = await listEventsForTenant(prisma, user.tenantId, query);

  const { events, total, page, pageCount } = list;
  const deleted = first(raw.deleted) === "1";
  const hasFilters = Boolean(
    query.q || query.status || query.type || query.range !== "all" || query.from || query.to,
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Events
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Create and maintain upcoming events so staffing and absences can be
            recorded against the right fixture later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/events/import"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Import events
          </Link>
          <Link
            href="/events/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add event
          </Link>
        </div>
      </div>

      {deleted ? (
        <p
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Event removed from the active list.
        </p>
      ) : null}

      <form
        method="get"
        className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Filter events"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="events-q" className="mb-1 block text-sm font-medium text-slate-700">
              Search
            </label>
            {query.range !== "all" ? (
              <input type="hidden" name="range" value={query.range} />
            ) : null}
            <input
              id="events-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Name, reference, or venue"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="events-status" className="mb-1 block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="events-status"
              name="status"
              defaultValue={query.status}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All statuses</option>
              {EVENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {EVENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="events-type" className="mb-1 block text-sm font-medium text-slate-700">
              Event type
            </label>
            <select
              id="events-type"
              name="type"
              defaultValue={query.type}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="events-from" className="mb-1 block text-sm font-medium text-slate-700">
              From date
            </label>
            <input
              id="events-from"
              name="from"
              type="date"
              defaultValue={query.from}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="events-to" className="mb-1 block text-sm font-medium text-slate-700">
              To date
            </label>
            <input
              id="events-to"
              name="to"
              type="date"
              defaultValue={query.to}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Apply filters
            </button>
            {hasFilters ? (
              <Link
                href="/events"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick date filters">
        {(
          [
            ["all", "All"],
            ["upcoming", "Upcoming"],
            ["past", "Past"],
          ] as const
        ).map(([range, label]) => {
          const active = query.range === range;
          return (
            <Link
              key={range}
              href={eventsListHref(query, { range, page: 1, from: "", to: "" })}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {events.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm font-medium text-slate-800">
                No events match these filters
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try a different search, or clear the filters to see all events.
              </p>
              <Link
                href="/events"
                className="mt-4 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800">
                No events yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add your first event to start tracking fixtures, venues, and
                staffing requirements.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  href="/events/new"
                  className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Add your first event
                </Link>
                <Link
                  href="/events/import"
                  className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Import events
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-500">
            {total} {total === 1 ? "event" : "events"}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <div className="mt-3 hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      <div>{formatLocalDateDisplay(event.eventDate)}</div>
                      <div className="text-xs text-slate-500">
                        {formatTimeRange(
                          event.startTime,
                          event.endTime,
                          event.endsNextDay,
                        ) ?? "Time TBC"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/events/${event.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {event.name}
                      </Link>
                      {event.reference ? (
                        <div className="text-xs text-slate-500">
                          {event.reference}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{event.venue.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {event.eventType.name}
                      <div className="text-xs text-slate-500">
                        {event.eventSubtype.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {event.staffRequired}
                    </td>
                    <td className="px-4 py-3">
                      <EventStatusBadge status={event.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/events/${event.id}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                        >
                          View
                        </Link>
                        <Link
                          href={`/events/${event.id}/edit`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                        >
                          Edit
                        </Link>
                        <DeleteEventDialog
                          eventId={event.id}
                          eventName={event.name}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-3 md:hidden">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {formatLocalDateDisplay(event.eventDate)}
                    </p>
                    <Link
                      href={`/events/${event.id}`}
                      className="mt-1 block font-semibold text-slate-900"
                    >
                      {event.name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {event.venue.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {event.eventType.name} · {event.eventSubtype.name}
                    </p>
                  </div>
                  <EventStatusBadge status={event.status} />
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Staff required: {event.staffRequired}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/events/${event.id}`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    View
                  </Link>
                  <Link
                    href={`/events/${event.id}/edit`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                  <DeleteEventDialog
                    eventId={event.id}
                    eventName={event.name}
                  />
                </div>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav
              className="mt-6 flex items-center justify-between gap-3"
              aria-label="Pagination"
            >
              {page > 1 ? (
                <Link
                  href={eventsListHref(query, { page: page - 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-sm text-slate-400">Previous</span>
              )}
              <span className="text-sm text-slate-600">
                Showing {(page - 1) * EVENT_PAGE_SIZE + 1}–
                {Math.min(page * EVENT_PAGE_SIZE, total)} of {total}
              </span>
              {page < pageCount ? (
                <Link
                  href={eventsListHref(query, { page: page + 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : (
                <span className="text-sm text-slate-400">Next</span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
