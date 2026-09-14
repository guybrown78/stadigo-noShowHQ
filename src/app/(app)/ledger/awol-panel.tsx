import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { LedgerTypeNav } from "@/components/absence/ledger-type-nav";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { filterControlClassName } from "@/components/form";
import {
  DEFAULT_AWOL_LEDGER_SORT,
  DEFAULT_LEDGER_DIRECTION,
  LEDGER_PAGE_SIZE,
  type LedgerSortDirection,
  type LedgerSortField,
} from "@/lib/absence/catalog";
import { truncateNotes } from "@/lib/absence/display";
import {
  isLedgerDateRangeInvalid,
  isLedgerEventDateRangeInvalid,
  ledgerHasActiveFilters,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import {
  listActiveAwolsForLedger,
  listAwolLedgerFilterOptions,
  type LedgerAwolRow,
} from "@/lib/absence/queries";
import { ledgerListHref } from "@/lib/absence/url";
import { prisma } from "@/lib/db";
import { formatLocalDateDisplay } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

function sortHref(
  query: LedgerListQuery,
  field: LedgerSortField,
): { href: string; nextDirection: LedgerSortDirection } {
  const active = query.sort === field;
  const nextDirection: LedgerSortDirection = active
    ? query.direction === "asc"
      ? "desc"
      : "asc"
    : field === "staff" || field === "event"
      ? "asc"
      : "desc";
  return {
    href: ledgerListHref(query, {
      sort: field,
      direction: nextDirection,
      page: 1,
    }),
    nextDirection,
  };
}

function SortHeader({
  field,
  label,
  query,
}: {
  field: LedgerSortField;
  label: string;
  query: LedgerListQuery;
}) {
  const active = query.sort === field;
  const { href, nextDirection } = sortHref(query, field);
  const ariaSort = active
    ? query.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const nextLabel = nextDirection === "asc" ? "ascending" : "descending";

  return (
    <th className="px-4 py-3 font-medium" aria-sort={ariaSort} scope="col">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-950 hover:underline"
        aria-label={`Sort by ${label}, ${nextLabel}`}
      >
        {label}
        {active ? (
          <span aria-hidden="true">
            {query.direction === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
      </Link>
    </th>
  );
}

function StaffCell({ row }: { row: LedgerAwolRow }) {
  const name = formatStaffName(row.staff);
  const live = !row.staff.deletedAt;
  return (
    <>
      {live ? (
        <Link
          href={`/staff/${row.staff.id}`}
          className="block truncate font-medium text-slate-900 hover:underline"
          title={name}
        >
          {name}
        </Link>
      ) : (
        <span className="block truncate font-medium text-slate-900" title={name}>
          {name}
        </span>
      )}
      <p className="whitespace-nowrap font-mono text-xs text-slate-500">
        {row.staff.staffIdNumber}
      </p>
    </>
  );
}

function EventCell({ row }: { row: LedgerAwolRow }) {
  const detail = row.awol;
  const name = detail?.eventNameSnapshot ?? "Event";
  const live = Boolean(row.event && !row.event.deletedAt);
  const reference = detail?.eventReferenceSnapshot ?? null;
  return (
    <>
      {live && row.event ? (
        <Link
          href={`/events/${row.event.id}`}
          className="block truncate font-medium text-slate-900 hover:underline"
          title={name}
        >
          {name}
        </Link>
      ) : (
        <span className="block truncate font-medium text-slate-900" title={name}>
          {name}
        </span>
      )}
      {reference ? (
        <p className="whitespace-nowrap font-mono text-xs text-slate-500">
          {reference}
        </p>
      ) : null}
    </>
  );
}

export async function AwolLedgerPanel({
  tenantId,
  query,
}: {
  tenantId: string;
  query: LedgerListQuery;
}) {
  const reportedRangeInvalid = isLedgerDateRangeInvalid(query);
  const eventRangeInvalid = isLedgerEventDateRangeInvalid(query);
  const [options, list] = await Promise.all([
    listAwolLedgerFilterOptions(prisma, tenantId),
    listActiveAwolsForLedger(prisma, tenantId, query),
  ]);

  const { rows, total, activeTotal, page, pageCount } = list;
  if (page !== query.page) {
    redirect(ledgerListHref(query, { page }));
  }

  const hasFilters = ledgerHasActiveFilters(query);
  const selectedVenue = options.venues.find((venue) => venue.id === query.venue);
  const selectedType = options.eventTypes.find(
    (type) => type.id === query.eventType,
  );
  const preserveSort =
    query.sort !== DEFAULT_AWOL_LEDGER_SORT ||
    query.direction !== DEFAULT_LEDGER_DIRECTION;
  const resetHref = "/ledger?view=awol";
  const logHref = "/absence/new?type=awol";

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/dashboard", label: "Dashboard" },
          { label: "Ledger" },
        ]}
        title="Absence Ledger"
        description="Review your organisation's absence records."
        actions={
          <ButtonLink href={logHref} icon={Plus}>
            Log absence
          </ButtonLink>
        }
      />

      <LedgerTypeNav view="awol" activeCount={activeTotal} />

      <form method="get" className="mt-4">
        <input type="hidden" name="view" value="awol" />
        <FilterBar
          ariaLabel="Filter AWOL records"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {hasFilters || preserveSort || reportedRangeInvalid || eventRangeInvalid ? (
                <ButtonLink href={resetHref} variant="secondary" size="sm">
                  Reset
                </ButtonLink>
              ) : null}
            </>
          }
        >
          {preserveSort ? (
            <>
              <input type="hidden" name="sort" value={query.sort} />
              <input type="hidden" name="direction" value={query.direction} />
            </>
          ) : null}
          <FilterField label="Search" htmlFor="ledger-q" className="min-w-[14rem] flex-[1.4]">
            <input
              id="ledger-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Staff, event, or reference"
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Venue" htmlFor="ledger-venue">
            <select
              id="ledger-venue"
              name="venue"
              defaultValue={query.venue}
              className={filterControlClassName()}
            >
              <option value="">All venues</option>
              {options.venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Event type" htmlFor="ledger-event-type">
            <select
              id="ledger-event-type"
              name="eventType"
              defaultValue={query.eventType}
              className={filterControlClassName()}
            >
              <option value="">All event types</option>
              {options.eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Event date from" htmlFor="ledger-event-from">
            <input
              id="ledger-event-from"
              name="eventFrom"
              type="date"
              defaultValue={query.eventFrom}
              aria-invalid={eventRangeInvalid || undefined}
              aria-describedby={eventRangeInvalid ? "ledger-event-date-error" : undefined}
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Event date to" htmlFor="ledger-event-to">
            <input
              id="ledger-event-to"
              name="eventTo"
              type="date"
              defaultValue={query.eventTo}
              aria-invalid={eventRangeInvalid || undefined}
              aria-describedby={eventRangeInvalid ? "ledger-event-date-error" : undefined}
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Date recorded from" htmlFor="ledger-reported-from">
            <input
              id="ledger-reported-from"
              name="reportedFrom"
              type="date"
              defaultValue={query.reportedFrom}
              aria-invalid={reportedRangeInvalid || undefined}
              aria-describedby={
                reportedRangeInvalid ? "ledger-date-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Date recorded to" htmlFor="ledger-reported-to">
            <input
              id="ledger-reported-to"
              name="reportedTo"
              type="date"
              defaultValue={query.reportedTo}
              aria-invalid={reportedRangeInvalid || undefined}
              aria-describedby={
                reportedRangeInvalid ? "ledger-date-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
        </FilterBar>
        {eventRangeInvalid ? (
          <p id="ledger-event-date-error" className="mt-2 text-xs text-red-700" role="alert">
            Event date From must be on or before To.
          </p>
        ) : null}
        {reportedRangeInvalid ? (
          <p id="ledger-date-error" className="mt-2 text-xs text-red-700" role="alert">
            Date recorded From must be on or before To.
          </p>
        ) : null}
        {hasFilters ? (
          <p className="mt-2 text-xs text-slate-500" aria-live="polite">
            Active filters:
            {query.q ? ` search “${query.q}”` : ""}
            {selectedVenue ? ` · Venue ${selectedVenue.name}` : ""}
            {selectedType ? ` · Event type ${selectedType.name}` : ""}
            {!eventRangeInvalid && (query.eventFrom || query.eventTo)
              ? ` · Event date ${query.eventFrom || "…"}–${query.eventTo || "…"}`
              : ""}
            {!reportedRangeInvalid && (query.reportedFrom || query.reportedTo)
              ? ` · Date recorded ${query.reportedFrom || "…"}–${query.reportedTo || "…"}`
              : ""}
            {!selectedVenue && query.venue ? " · Venue (unknown)" : ""}
            {!selectedType && query.eventType ? " · Event type (unknown)" : ""}
          </p>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={
            hasFilters
              ? "No AWOL records match these filters."
              : "No AWOL records yet."
          }
          description={
            hasFilters
              ? "Try a different search, or reset the filters to see all active AWOL records."
              : "Recorded non-attendance will appear here."
          }
          action={
            hasFilters ? (
              <ButtonLink href={resetHref} variant="secondary">
                Reset filters
              </ButtonLink>
            ) : (
              <ButtonLink href={logHref} icon={Plus}>
                Log absence
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500" aria-live="polite">
            {hasFilters
              ? `${total} matching · ${activeTotal} active AWOLs`
              : `${total} ${total === 1 ? "AWOL" : "AWOLs"}`}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <DataTable className="mt-3 hidden xl:block">
            <DataTableHead>
              <tr>
                <SortHeader field="eventDate" label="Event date" query={query} />
                <SortHeader field="staff" label="Staff" query={query} />
                <SortHeader field="event" label="Event" query={query} />
                <th className="px-4 py-3 font-medium" scope="col">
                  Venue
                </th>
                <SortHeader field="reported" label="Date recorded" query={query} />
                <th className="px-4 py-3 font-medium" scope="col">
                  Notes
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </DataTableHead>
            <tbody>
              {rows.map((row) => {
                const detail = row.awol;
                const notes = truncateNotes(row.notes);
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {detail
                        ? formatLocalDateDisplay(detail.eventDateSnapshot)
                        : "—"}
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <StaffCell row={row} />
                    </td>
                    <td className="max-w-[14rem] px-4 py-3">
                      <EventCell row={row} />
                    </td>
                    <td className="max-w-[12rem] px-4 py-3 text-slate-700">
                      <p
                        className="truncate"
                        title={detail?.venueNameSnapshot ?? undefined}
                      >
                        {detail?.venueNameSnapshot ?? "—"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatLocalDateDisplay(row.reportedDate)}
                    </td>
                    <td className="max-w-[14rem] px-4 py-3 text-slate-700">
                      <p className="truncate" title={notes ?? undefined}>
                        {notes ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ButtonLink
                        href={`/absence/${row.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        View AWOL
                      </ButtonLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 xl:hidden">
            {rows.map((row) => {
              const detail = row.awol;
              const notes = truncateNotes(row.notes);
              return (
                <li key={row.id}>
                  <Card className="p-4 shadow-none">
                    <AbsenceTypeBadge type="AWOL" />
                    <div className="mt-3">
                      <StaffCell row={row} />
                    </div>
                    <div className="mt-2">
                      <EventCell row={row} />
                      <p className="mt-1 text-sm text-slate-600">
                        Event{" "}
                        {detail
                          ? formatLocalDateDisplay(detail.eventDateSnapshot)
                          : "—"}
                      </p>
                    </div>
                    {detail?.venueNameSnapshot ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {detail.venueNameSnapshot}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-600">
                      Date recorded {formatLocalDateDisplay(row.reportedDate)}
                    </p>
                    {notes ? (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                        {notes}
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <ButtonLink
                        href={`/absence/${row.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        View AWOL
                      </ButtonLink>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          <Pagination
            className="mt-6"
            page={page}
            pageCount={pageCount}
            total={total}
            from={(page - 1) * LEDGER_PAGE_SIZE + 1}
            to={Math.min(page * LEDGER_PAGE_SIZE, total)}
            itemLabel="AWOLs"
            hrefForPage={(nextPage) => ledgerListHref(query, { page: nextPage })}
          />
        </>
      )}
    </div>
  );
}
