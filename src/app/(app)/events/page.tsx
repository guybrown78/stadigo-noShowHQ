import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Banner } from "@/components/ui/banner";
import { filterControlClassName } from "@/components/form";
import { SegmentedNav } from "@/components/ui/segmented-nav";
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
import { EventRowActions } from "@/components/events/event-row-actions";
import { EventStatusBadge } from "@/components/events/event-status-badge";
import { EventsSectionNav } from "@/components/events/events-section-nav";

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
      <PageHeader
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Events" },
        ]}
        title="Events"
        description="Create and maintain upcoming events so staffing and absences can be recorded against the right fixture later."
        actions={
          <>
            <ButtonLink href="/events/import" variant="secondary">
              Import events
            </ButtonLink>
            <ButtonLink href="/events/new" icon={Plus}>
              Add event
            </ButtonLink>
          </>
        }
      >
        <EventsSectionNav current="events" />
      </PageHeader>

      {deleted ? (
        <Banner tone="success" className="mt-6">
          Event removed from the active list.
        </Banner>
      ) : null}

      <form method="get" className="mt-4">
        <FilterBar
          ariaLabel="Filter events"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {hasFilters ? (
                <ButtonLink href="/events" variant="secondary" size="sm">
                  Reset
                </ButtonLink>
              ) : null}
            </>
          }
        >
        {query.range !== "all" ? (
          <input type="hidden" name="range" value={query.range} />
        ) : null}
        <FilterField label="Search" htmlFor="events-q" className="min-w-[12rem] flex-[1.3]">
          <input
            id="events-q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Name, reference, or venue"
            className={filterControlClassName()}
          />
        </FilterField>
        <FilterField label="Status" htmlFor="events-status">
          <select
            id="events-status"
            name="status"
            defaultValue={query.status}
            className={filterControlClassName()}
          >
            <option value="">All statuses</option>
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EVENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Event type" htmlFor="events-type">
          <select
            id="events-type"
            name="type"
            defaultValue={query.type}
            className={filterControlClassName()}
          >
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From" htmlFor="events-from">
          <input
            id="events-from"
            name="from"
            type="date"
            defaultValue={query.from}
            className={filterControlClassName()}
          />
        </FilterField>
        <FilterField label="To" htmlFor="events-to">
          <input
            id="events-to"
            name="to"
            type="date"
            defaultValue={query.to}
            className={filterControlClassName()}
          />
        </FilterField>
        </FilterBar>
      </form>

      <SegmentedNav
        className="mt-3"
        label="Quick date filters"
        items={[
          {
            href: eventsListHref(query, { range: "all", page: 1, from: "", to: "" }),
            label: "All",
            active: query.range === "all",
          },
          {
            href: eventsListHref(query, {
              range: "upcoming",
              page: 1,
              from: "",
              to: "",
            }),
            label: "Upcoming",
            active: query.range === "upcoming",
          },
          {
            href: eventsListHref(query, { range: "past", page: 1, from: "", to: "" }),
            label: "Past",
            active: query.range === "past",
          },
        ]}
      />

      {events.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={hasFilters ? "No events match these filters" : "No events yet"}
          description={
            hasFilters
              ? "Try a different search, or clear the filters to see all events."
              : "Add your first event to start tracking fixtures, venues, and staffing requirements."
          }
          action={
            hasFilters ? (
              <ButtonLink href="/events" variant="secondary">
                Clear filters
              </ButtonLink>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/events/new" icon={Plus}>
                  Add your first event
                </ButtonLink>
                <ButtonLink href="/events/import" variant="secondary">
                  Import events
                </ButtonLink>
                <ButtonLink href="/settings/events" variant="secondary">
                  Venues
                </ButtonLink>
              </div>
            )
          }
        />
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500">
            {total} {total === 1 ? "event" : "events"}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <DataTable className="mt-3 hidden md:block">
              <DataTableHead>
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
              </DataTableHead>
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
                      <EventRowActions
                        eventId={event.id}
                        eventName={event.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 md:hidden">
            {events.map((event) => (
              <li key={event.id}>
                <Card className="p-4 shadow-none">
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
                  <ButtonLink href={`/events/${event.id}`} variant="secondary" size="sm">
                    View
                  </ButtonLink>
                  <ButtonLink href={`/events/${event.id}/edit`} variant="secondary" size="sm">
                    Edit
                  </ButtonLink>
                  <DeleteEventDialog
                    eventId={event.id}
                    eventName={event.name}
                  />
                </div>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            className="mt-6"
            page={page}
            pageCount={pageCount}
            total={total}
            from={(page - 1) * EVENT_PAGE_SIZE + 1}
            to={Math.min(page * EVENT_PAGE_SIZE, total)}
            itemLabel="events"
            hrefForPage={(nextPage) => eventsListHref(query, { page: nextPage })}
          />
        </>
      )}
    </div>
  );
}
