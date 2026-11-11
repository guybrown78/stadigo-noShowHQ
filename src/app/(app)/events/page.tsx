import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel } from "@/components/ui/field";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Banner } from "@/components/ui/banner";
import { filterControlClassName } from "@/components/form";
import { EventActiveFilters } from "@/components/events/event-active-filters";
import { EventClickCard, EventClickRow } from "@/components/events/event-click-row";
import { EventQuickFilters } from "@/components/events/event-quick-filters";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { EVENT_STATUSES } from "@/lib/events/catalog";
import { formatLocalDateDisplay, formatTimeRange } from "@/lib/events/dates";
import { EVENT_STATUS_LABELS, formatStaffRequired } from "@/lib/events/display";
import {
  EVENT_PAGE_SIZE,
  listEventsForTenant,
  listEventTypesForTenant,
} from "@/lib/events/queries";
import { ensureTenantEventCatalog } from "@/lib/events/provision";
import { eventListQuerySchema, type EventListQuery } from "@/lib/events/schema";
import { eventsListHref } from "@/lib/events/url";
import { ArchiveEventDialog } from "@/components/events/archive-event-dialog";
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
    range: first(raw.range) || "upcoming",
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
        range: "upcoming",
        from: "",
        to: "",
        page: 1,
      };

  const [types, list] = await Promise.all([
    listEventTypesForTenant(prisma, user.tenantId),
    listEventsForTenant(prisma, user.tenantId, query),
  ]);

  const { events, total, page, pageCount } = list;
  const typeName = types.find((type) => type.id === query.type)?.name;
  const deleted = first(raw.deleted) === "1";
  const archived = first(raw.archived) === "1";
  const unarchived = first(raw.unarchived) === "1";
  const onlyRange = !query.q && !query.status && !query.type && !query.from && !query.to;
  const hasFilters = Boolean(!onlyRange || query.range !== "upcoming");

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
      {archived ? (
        <Banner tone="success" className="mt-6">
          Event archived. Open Archived to find it again.
        </Banner>
      ) : null}
      {unarchived ? (
        <Banner tone="success" className="mt-6">
          Event restored to the active list.
        </Banner>
      ) : null}

      <form
        key={`${query.q}|${query.status}|${query.type}|${query.range}|${query.from}|${query.to}`}
        method="get"
        className="mt-4 space-y-3"
      >
        <div>
          <FieldLabel htmlFor="events-q" size="sm">
            Search
          </FieldLabel>
          <input
            id="events-q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Name, reference, or venue"
            className={filterControlClassName()}
          />
        </div>
        <EventQuickFilters query={query} />
        {query.range !== "upcoming" ? (
          <input type="hidden" name="range" value={query.range} />
        ) : null}
        <FilterBar
          ariaLabel="Filter events"
          active={hasFilters}
          actions={
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
          }
        >
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

      {events.length === 0 ? (
        <>
          {hasFilters ? (
            <div className="mt-3">
              <EventActiveFilters query={query} typeName={typeName} />
            </div>
          ) : null}
          <EmptyState
          className="mt-6"
          title={
            !onlyRange
              ? "No events match these filters"
              : query.range === "past"
                ? "No past events"
                : query.range === "archived"
                  ? "No archived events"
                  : query.range === "all"
                    ? "No events yet"
                    : "No upcoming events"
          }
          description={
            !onlyRange
              ? "Try a different search, or clear the filters to see upcoming events."
              : query.range === "past"
                ? "Events on today or later stay on Upcoming until their date has passed."
                : query.range === "archived"
                  ? "Archive an event when you no longer need it on the working lists. You can restore it later."
                  : query.range === "all"
                    ? "Add your first event to start tracking fixtures, venues, and staffing requirements."
                    : "Events on earlier dates stay on Past. Add an event when you have one coming up."
          }
          action={
            !onlyRange || query.range === "past" || query.range === "archived" ? (
              <ButtonLink href="/events" variant="secondary">
                {query.range === "upcoming" || !onlyRange
                  ? "Clear filters"
                  : "Show upcoming events"}
              </ButtonLink>
            ) : query.range === "upcoming" ? (
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/events/new" icon={Plus}>
                  Add event
                </ButtonLink>
                <ButtonLink
                  href={eventsListHref(query, { range: "past", page: 1 })}
                  variant="secondary"
                >
                  View past events
                </ButtonLink>
              </div>
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
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm text-muted">
              {total} {total === 1 ? "event" : "events"}
              {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
            </p>
            <EventActiveFilters query={query} typeName={typeName} />
          </div>

          <DataTable className="mt-3 hidden md:block" stickyHeader>
              <DataTableHead sticky>
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
                  <EventClickRow key={event.id} href={`/events/${event.id}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground">
                      <div>{formatLocalDateDisplay(event.eventDate)}</div>
                      <div className="text-xs text-muted">
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
                        className="font-medium text-foreground hover:underline"
                      >
                        {event.name}
                      </Link>
                      {event.reference ? (
                        <div className="text-xs text-muted">
                          {event.reference}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-foreground">{event.venue.name}</td>
                    <td className="px-4 py-3 text-foreground">
                      {event.eventType.name}
                      <div className="text-xs text-muted">
                        {event.eventSubtype.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatStaffRequired(event.staffRequired)}
                    </td>
                    <td className="px-4 py-3">
                      <EventStatusBadge status={event.status} />
                    </td>
                    <td className="px-4 py-3 text-right" data-event-separate>
                      <EventRowActions
                        eventId={event.id}
                        eventName={event.name}
                        archived={Boolean(event.archivedAt)}
                      />
                    </td>
                  </EventClickRow>
                ))}
              </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 md:hidden">
            {events.map((event) => (
              <li key={event.id}>
                <EventClickCard href={`/events/${event.id}`}>
                <Card className="p-4 shadow-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted">
                      {formatLocalDateDisplay(event.eventDate)}
                    </p>
                    <Link
                      href={`/events/${event.id}`}
                      className="mt-1 block font-semibold text-foreground"
                    >
                      {event.name}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {event.venue.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {event.eventType.name} · {event.eventSubtype.name}
                    </p>
                  </div>
                  <EventStatusBadge status={event.status} />
                </div>
                <p className="mt-3 text-sm text-muted">
                  Staff required: {formatStaffRequired(event.staffRequired)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2" data-event-separate>
                  <ButtonLink href={`/events/${event.id}`} variant="secondary" size="sm">
                    View
                  </ButtonLink>
                  <ButtonLink href={`/events/${event.id}/edit`} variant="secondary" size="sm">
                    Edit
                  </ButtonLink>
                  <ArchiveEventDialog
                    eventId={event.id}
                    eventName={event.name}
                    archived={Boolean(event.archivedAt)}
                  />
                  <DeleteEventDialog
                    eventId={event.id}
                    eventName={event.name}
                  />
                </div>
                </Card>
                </EventClickCard>
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
