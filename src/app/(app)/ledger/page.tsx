import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { LedgerTypeNav } from "@/components/absence/ledger-type-nav";
import { AbsenceTypeBadge, NoticeWarningBadges } from "@/components/absence/absence-badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { filterControlClassName } from "@/components/form";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  DEFAULT_LEDGER_DIRECTION,
  DEFAULT_LEDGER_SORT,
  LEDGER_PAGE_SIZE,
  type LedgerSortDirection,
  type LedgerSortField,
} from "@/lib/absence/catalog";
import { formatNoticeSummary } from "@/lib/absence/display";
import {
  isLedgerDateRangeInvalid,
  ledgerHasActiveFilters,
  parseLedgerListQuery,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import {
  listActiveCancellationsForLedger,
  listLedgerFilterOptions,
  type LedgerCancellationRow,
} from "@/lib/absence/queries";
import { ledgerListHref } from "@/lib/absence/url";
import { formatLocalDateDisplay } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export const metadata = { title: "Ledger" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

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
    <th
      className="px-4 py-3 font-medium"
      aria-sort={ariaSort}
      scope="col"
    >
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

function StaffCell({ row }: { row: LedgerCancellationRow }) {
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

function EventCell({ row }: { row: LedgerCancellationRow }) {
  const detail = row.cancellation;
  const name = detail?.eventNameSnapshot ?? "Event";
  const live = Boolean(row.event && !row.event.deletedAt);
  const reference = row.event?.reference ?? null;
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

function NoticeCell({ row }: { row: LedgerCancellationRow }) {
  const detail = row.cancellation;
  if (!detail) {
    return <span className="text-slate-500">—</span>;
  }
  return (
    <div>
      <p>{formatNoticeSummary(detail)}</p>
      <NoticeWarningBadges detail={detail} />
    </div>
  );
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const raw = await searchParams;
  const query = parseLedgerListQuery({
    q: first(raw.q),
    venue: first(raw.venue),
    eventType: first(raw.eventType),
    reportedFrom: first(raw.reportedFrom),
    reportedTo: first(raw.reportedTo),
    sort: first(raw.sort),
    direction: first(raw.direction),
    page: first(raw.page),
    view: first(raw.view),
  });
  const dateRangeInvalid = isLedgerDateRangeInvalid(query);

  const [options, list] = await Promise.all([
    listLedgerFilterOptions(prisma, user.tenantId),
    listActiveCancellationsForLedger(prisma, user.tenantId, query),
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
    query.sort !== DEFAULT_LEDGER_SORT ||
    query.direction !== DEFAULT_LEDGER_DIRECTION;

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
          <ButtonLink href="/absence/new" icon={Plus}>
            Log absence
          </ButtonLink>
        }
      />

      <LedgerTypeNav activeCount={activeTotal} />

      <form method="get" className="mt-4">
        <FilterBar
          ariaLabel="Filter cancellations"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {hasFilters || preserveSort || dateRangeInvalid ? (
                <ButtonLink href="/ledger" variant="secondary" size="sm">
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
        <FilterField label="Reported from" htmlFor="ledger-reported-from">
          <input
            id="ledger-reported-from"
            name="reportedFrom"
            type="date"
            defaultValue={query.reportedFrom}
            aria-invalid={dateRangeInvalid || undefined}
            aria-describedby={
              dateRangeInvalid ? "ledger-date-error" : undefined
            }
            className={filterControlClassName()}
          />
        </FilterField>
        <FilterField label="Reported to" htmlFor="ledger-reported-to">
          <input
            id="ledger-reported-to"
            name="reportedTo"
            type="date"
            defaultValue={query.reportedTo}
            aria-invalid={dateRangeInvalid || undefined}
            aria-describedby={
              dateRangeInvalid ? "ledger-date-error" : undefined
            }
            className={filterControlClassName()}
          />
        </FilterField>
        </FilterBar>
        {dateRangeInvalid ? (
          <p id="ledger-date-error" className="mt-2 text-xs text-red-700" role="alert">
            From date must be on or before To date.
          </p>
        ) : null}
        {hasFilters ? (
          <p className="mt-2 text-xs text-slate-500" aria-live="polite">
            Active filters:
            {query.q ? ` search “${query.q}”` : ""}
            {selectedVenue ? ` · Venue ${selectedVenue.name}` : ""}
            {selectedType ? ` · Event type ${selectedType.name}` : ""}
            {!dateRangeInvalid && (query.reportedFrom || query.reportedTo)
              ? ` · Reported ${query.reportedFrom || "…"}–${query.reportedTo || "…"}`
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
              ? "No Cancellations match these filters."
              : "No Cancellations recorded yet."
          }
          description={
            hasFilters
              ? "Try a different search, or reset the filters to see all active Cancellations."
              : "Recorded Cancellations will appear here."
          }
          action={
            hasFilters ? (
              <ButtonLink href="/ledger" variant="secondary">
                Reset filters
              </ButtonLink>
            ) : (
              <ButtonLink href="/absence/new" icon={Plus}>
                Log absence
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500" aria-live="polite">
            {hasFilters
              ? `${total} matching · ${activeTotal} active Cancellations`
              : `${total} ${total === 1 ? "Cancellation" : "Cancellations"}`}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <DataTable className="mt-3 hidden xl:block">
              <DataTableHead>
                <tr>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Type
                  </th>
                  <SortHeader field="reported" label="Reported" query={query} />
                  <SortHeader field="staff" label="Staff" query={query} />
                  <SortHeader field="event" label="Event" query={query} />
                  <SortHeader
                    field="eventDate"
                    label="Event date"
                    query={query}
                  />
                  <th className="px-4 py-3 font-medium" scope="col">
                    Venue
                  </th>
                  <SortHeader field="notice" label="Notice" query={query} />
                  <th className="px-4 py-3 font-medium" scope="col">
                    Reason
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    <span className="sr-only">View</span>
                  </th>
                </tr>
              </DataTableHead>
              <tbody>
                {rows.map((row) => {
                  const detail = row.cancellation;
                  return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <AbsenceTypeBadge type="CANCELLATION" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatLocalDateDisplay(row.reportedDate)}
                        {row.reportedTime ? ` · ${row.reportedTime}` : ""}
                      </td>
                      <td className="max-w-[12rem] px-4 py-3">
                        <StaffCell row={row} />
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        <EventCell row={row} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {detail
                          ? formatLocalDateDisplay(detail.eventDateSnapshot)
                          : "—"}
                      </td>
                      <td className="max-w-[12rem] px-4 py-3 text-slate-700">
                        <p
                          className="truncate"
                          title={detail?.venueNameSnapshot ?? undefined}
                        >
                          {detail?.venueNameSnapshot ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <NoticeCell row={row} />
                      </td>
                      <td className="max-w-[14rem] px-4 py-3 text-slate-700">
                        <p className="truncate" title={row.reason}>
                          {row.reason}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ButtonLink
                          href={`/absence/${row.id}`}
                          variant="secondary"
                          size="sm"
                        >
                          View
                        </ButtonLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 xl:hidden">
            {rows.map((row) => {
              const detail = row.cancellation;
              return (
                <li key={row.id}>
                  <Card className="p-4 shadow-none">
                  <AbsenceTypeBadge type="CANCELLATION" />
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
                  <p className="mt-2 text-sm text-slate-600">
                    Reported {formatLocalDateDisplay(row.reportedDate)}
                    {row.reportedTime ? ` · ${row.reportedTime}` : ""}
                  </p>
                  <div className="mt-2 text-sm text-slate-700">
                    <NoticeCell row={row} />
                  </div>
                  {detail?.venueNameSnapshot ? (
                    <p
                      className="mt-2 text-sm text-slate-600"
                      title={detail.venueNameSnapshot}
                    >
                      {detail.venueNameSnapshot}
                    </p>
                  ) : null}
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {row.reason}
                  </p>
                  <div className="mt-3">
                    <ButtonLink
                      href={`/absence/${row.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      View cancellation
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
            itemLabel="Cancellations"
            hrefForPage={(nextPage) => ledgerListHref(query, { page: nextPage })}
          />
        </>
      )}
    </div>
  );
}
