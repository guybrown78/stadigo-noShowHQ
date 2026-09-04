import Link from "next/link";
import { LedgerTypeNav } from "@/components/absence/ledger-type-nav";
import { NoticeWarningBadges } from "@/components/absence/absence-badges";
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
          className="font-medium text-slate-900 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium text-slate-900">{name}</span>
      )}
      <p className="font-mono text-xs text-slate-500">
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
          className="font-medium text-slate-900 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium text-slate-900">{name}</span>
      )}
      {reference ? (
        <p className="font-mono text-xs text-slate-500">{reference}</p>
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
  const hasFilters = Boolean(
    query.q ||
      query.venue ||
      query.eventType ||
      query.reportedFrom ||
      query.reportedTo,
  );
  const selectedVenue = options.venues.find((venue) => venue.id === query.venue);
  const selectedType = options.eventTypes.find(
    (type) => type.id === query.eventType,
  );
  const preserveSort =
    query.sort !== DEFAULT_LEDGER_SORT ||
    query.direction !== DEFAULT_LEDGER_DIRECTION;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Ledger
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Review your organisation&apos;s absence records.
          </p>
        </div>
        <Link
          href="/absence/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Log absence
        </Link>
      </div>

      <LedgerTypeNav activeCount={activeTotal} />

      <form
        method="get"
        className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Filter cancellations"
      >
        {preserveSort ? (
          <>
            <input type="hidden" name="sort" value={query.sort} />
            <input type="hidden" name="direction" value={query.direction} />
          </>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-4">
            <label
              htmlFor="ledger-q"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>
            <input
              id="ledger-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Staff name, Staff ID, event name, or event reference"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="ledger-venue"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Venue
            </label>
            <select
              id="ledger-venue"
              name="venue"
              defaultValue={query.venue}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All venues</option>
              {options.venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="ledger-event-type"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Event type
            </label>
            <select
              id="ledger-event-type"
              name="eventType"
              defaultValue={query.eventType}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            >
              <option value="">All event types</option>
              {options.eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="ledger-reported-from"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Reported from
            </label>
            <input
              id="ledger-reported-from"
              name="reportedFrom"
              type="date"
              defaultValue={query.reportedFrom}
              aria-invalid={dateRangeInvalid || undefined}
              aria-describedby={
                dateRangeInvalid ? "ledger-date-error" : undefined
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="ledger-reported-to"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Reported to
            </label>
            <input
              id="ledger-reported-to"
              name="reportedTo"
              type="date"
              defaultValue={query.reportedTo}
              aria-invalid={dateRangeInvalid || undefined}
              aria-describedby={
                dateRangeInvalid ? "ledger-date-error" : undefined
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-400 focus:ring-2"
            />
          </div>
        </div>
        {dateRangeInvalid ? (
          <p id="ledger-date-error" className="text-sm text-red-700" role="alert">
            From date must be on or before To date.
          </p>
        ) : null}
        {hasFilters ? (
          <p className="text-sm text-slate-600" aria-live="polite">
            Active filters:
            {query.q ? ` search “${query.q}”` : ""}
            {selectedVenue ? ` · Venue ${selectedVenue.name}` : ""}
            {selectedType ? ` · Event type ${selectedType.name}` : ""}
            {query.reportedFrom || query.reportedTo
              ? ` · Reported ${query.reportedFrom || "…"}–${query.reportedTo || "…"}`
              : ""}
            {!selectedVenue && query.venue ? " · Venue (unknown)" : ""}
            {!selectedType && query.eventType ? " · Event type (unknown)" : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Apply filters
          </button>
          {hasFilters || preserveSort ? (
            <Link
              href="/ledger"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Reset filters
            </Link>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm font-medium text-slate-800">
                No Cancellations match these filters.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try a different search, or reset the filters to see all active
                Cancellations.
              </p>
              <Link
                href="/ledger"
                className="mt-4 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Reset filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800">
                No Cancellations recorded yet.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Recorded Cancellations will appear here.
              </p>
              <Link
                href="/absence/new"
                className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Log absence
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-slate-500" aria-live="polite">
            {hasFilters
              ? `${total} matching · ${activeTotal} active Cancellations`
              : `${total} ${total === 1 ? "Cancellation" : "Cancellations"}`}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <div className="mt-3 hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
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
              </thead>
              <tbody>
                {rows.map((row) => {
                  const detail = row.cancellation;
                  return (
                    <tr key={row.id} className="border-b border-slate-100">
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
                      <td className="max-w-[10rem] truncate px-4 py-3 text-slate-700">
                        {detail?.venueNameSnapshot ?? "—"}
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
                        <Link
                          href={`/absence/${row.id}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-3 md:hidden">
            {rows.map((row) => {
              const detail = row.cancellation;
              return (
                <li
                  key={row.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <StaffCell row={row} />
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
                    <p className="mt-2 truncate text-sm text-slate-600">
                      {detail.venueNameSnapshot}
                    </p>
                  ) : null}
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {row.reason}
                  </p>
                  <div className="mt-3">
                    <Link
                      href={`/absence/${row.id}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      View cancellation
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {pageCount > 1 ? (
            <nav
              className="mt-6 flex items-center justify-between gap-3"
              aria-label="Ledger pagination"
            >
              {page > 1 ? (
                <Link
                  href={ledgerListHref(query, { page: page - 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  aria-label="Previous page of Cancellations"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-sm text-slate-400">Previous</span>
              )}
              <span className="text-sm text-slate-600">
                Showing {(page - 1) * LEDGER_PAGE_SIZE + 1}–
                {Math.min(page * LEDGER_PAGE_SIZE, total)} of {total}{" "}
                Cancellations
              </span>
              {page < pageCount ? (
                <Link
                  href={ledgerListHref(query, { page: page + 1 })}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  aria-label="Next page of Cancellations"
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
