import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { LedgerTypeNav } from "@/components/absence/ledger-type-nav";
import { AbsenceDetailContent } from "@/components/absence/absence-detail-content";
import { LedgerDetailDrawer } from "@/components/absence/ledger-detail-drawer";
import {
  AbsenceTypeBadge,
  NoticeWarningBadges,
} from "@/components/absence/absence-badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  LEDGER_PAGE_SIZE,
  defaultLedgerSortForView,
  ledgerShowsEventFilters,
  type LedgerSortDirection,
  type LedgerSortField,
} from "@/lib/absence/catalog";
import {
  LEDGER_EVENT_FILTER_HELP,
  NO_SICKNESS_STARTED_RECORDED,
  RECORD_STATUS_LABELS,
  SICKNESS_INITIAL_REPORT_LABEL,
  formatLedgerResultsSummary,
  formatNoticeSummary,
  ledgerItemLabel,
  ledgerSearchPlaceholder,
  ledgerViewDetailsLabel,
} from "@/lib/absence/display";
import {
  isLedgerAffectedDateRangeInvalid,
  isLedgerDateRangeInvalid,
  ledgerHasActiveFilters,
  ledgerRawHasIncompatibleEventFilters,
  parseLedgerListQuery,
  resolvedLedgerAffectedFrom,
  resolvedLedgerAffectedTo,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import {
  ISSUE_SUMMARY_PRESENT_LABEL,
  SICKNESS_LEDGER_SUPPORTING_COPY,
} from "@/lib/absence/sickness";
import {
  listAbsencesForLedger,
  listAwolLedgerFilterOptions,
  listLedgerFilterOptions,
  ledgerStaffDisplay,
  type LedgerAbsenceRow,
  type LedgerFilterOptions,
} from "@/lib/absence/ledger-query";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { getAbsenceForTenant } from "@/lib/absence/queries";
import {
  ledgerArchiveReturnHref,
  ledgerCloseDetailHref,
  ledgerDetailHref,
  ledgerListHref,
  ledgerLogAbsenceHref,
} from "@/lib/absence/url";
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
    : field === "staff" || field === "type"
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

function StaffCell({ row }: { row: LedgerAbsenceRow }) {
  const staff = ledgerStaffDisplay(row);
  const name = formatStaffName(staff);
  const live = !staff.deletedAt;
  return (
    <>
      {live ? (
        <Link
          href={`/staff/${staff.id}`}
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
        {staff.staffIdNumber}
      </p>
    </>
  );
}

function EventName({ row, name }: { row: LedgerAbsenceRow; name: string }) {
  const live = Boolean(row.event && !row.event.deletedAt);
  if (live && row.event) {
    return (
      <Link
        href={`/events/${row.event.id}`}
        className="block truncate font-medium text-slate-900 hover:underline"
        title={name}
      >
        {name}
      </Link>
    );
  }
  return (
    <span className="block truncate font-medium text-slate-900" title={name}>
      {name}
    </span>
  );
}

function ContextCell({ row }: { row: LedgerAbsenceRow }) {
  if (row.type === "CANCELLATION" && row.cancellation) {
    const detail = row.cancellation;
    return (
      <div className="min-w-0">
        <EventName row={row} name={detail.eventNameSnapshot} />
        {detail.venueNameSnapshot ? (
          <p
            className="truncate text-xs text-slate-500"
            title={detail.venueNameSnapshot}
          >
            {detail.venueNameSnapshot}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-slate-600">
          {formatNoticeSummary(detail)}
        </p>
        <NoticeWarningBadges detail={detail} />
      </div>
    );
  }
  if (row.type === "AWOL" && row.awol) {
    const detail = row.awol;
    return (
      <div className="min-w-0">
        <EventName row={row} name={detail.eventNameSnapshot} />
        {detail.venueNameSnapshot ? (
          <p
            className="truncate text-xs text-slate-500"
            title={detail.venueNameSnapshot}
          >
            {detail.venueNameSnapshot}
          </p>
        ) : null}
        {detail.eventReferenceSnapshot ? (
          <p className="whitespace-nowrap font-mono text-xs text-slate-500">
            {detail.eventReferenceSnapshot}
          </p>
        ) : null}
      </div>
    );
  }
  if (row.type === "SICKNESS" && row.sickness) {
    return (
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{SICKNESS_INITIAL_REPORT_LABEL}</p>
        <p className="text-xs text-slate-500">
          Sickness started{" "}
          {row.sickness.sicknessStartedDate
            ? formatLocalDateDisplay(row.sickness.sicknessStartedDate)
            : NO_SICKNESS_STARTED_RECORDED}
        </p>
        {row.issueSummaryPresent ? (
          <p className="text-xs text-slate-500">{ISSUE_SUMMARY_PRESENT_LABEL}</p>
        ) : null}
      </div>
    );
  }
  return <span className="text-slate-500">—</span>;
}

function StatusBadge({ row }: { row: LedgerAbsenceRow }) {
  const archived = row.recordStatus === "ARCHIVED";
  return (
    <Badge tone={archived ? "warning" : "success"}>
      {RECORD_STATUS_LABELS[row.recordStatus]}
    </Badge>
  );
}

function ViewAbsenceLink({
  row,
  query,
}: {
  row: LedgerAbsenceRow;
  query: LedgerListQuery;
}) {
  return (
    <ButtonLink
      href={ledgerDetailHref(query, row.id)}
      scroll={false}
      variant="secondary"
      size="sm"
      aria-label={ledgerViewDetailsLabel(row.type)}
      aria-haspopup="dialog"
      aria-expanded={query.detail === row.id}
      data-ledger-view={row.id}
    >
      View
    </ButtonLink>
  );
}

function emptyState(query: LedgerListQuery, hasFilters: boolean) {
  const onlyArchived =
    query.includeArchived &&
    !query.q &&
    !query.venue &&
    !query.eventType &&
    !query.reportedFrom &&
    !query.reportedTo &&
    !resolvedLedgerAffectedFrom(query) &&
    !resolvedLedgerAffectedTo(query);
  const noun = ledgerItemLabel(query.view);
  if (onlyArchived) {
    return {
      title:
        query.view === "all"
          ? "No archived absences found."
          : `No archived ${noun} found.`,
      description: "Turn off Show archived to return to active records.",
      reset: true,
    };
  }
  if (hasFilters) {
    return {
      title:
        query.view === "all"
          ? "No absences match these filters."
          : `No ${noun} match these filters.`,
      description: "Try a different search, or reset the filters.",
      reset: true,
    };
  }
  return {
    title:
      query.view === "all"
        ? "No absences recorded yet."
        : `No ${noun} recorded yet.`,
    description:
      query.view === "all"
        ? "Recorded Cancellations, AWOLs and Sickness reports will appear here."
        : `Recorded ${noun} will appear here.`,
    reset: false,
  };
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
    affectedFrom: first(raw.affectedFrom),
    affectedTo: first(raw.affectedTo),
    eventFrom: first(raw.eventFrom),
    eventTo: first(raw.eventTo),
    firstDayFrom: first(raw.firstDayFrom),
    firstDayTo: first(raw.firstDayTo),
    includeArchived: first(raw.includeArchived),
    sort: first(raw.sort),
    direction: first(raw.direction),
    page: first(raw.page),
    view: first(raw.view),
    detail: first(raw.detail),
  });

  if (
    ledgerRawHasIncompatibleEventFilters({
      view: first(raw.view),
      venue: first(raw.venue),
      eventType: first(raw.eventType),
    })
  ) {
    redirect(ledgerListHref(query));
  }

  const showEventFilters = ledgerShowsEventFilters(query.view);
  const reportedRangeInvalid = isLedgerDateRangeInvalid(query);
  const affectedRangeInvalid = isLedgerAffectedDateRangeInvalid(query);
  const logHref = ledgerLogAbsenceHref(query.view);
  const defaultSort = defaultLedgerSortForView(query.view);
  const preserveSort =
    query.sort !== defaultSort || query.direction !== DEFAULT_LEDGER_DIRECTION;

  const [options, list]: [
    LedgerFilterOptions,
    Awaited<ReturnType<typeof listAbsencesForLedger>>,
  ] = await Promise.all([
    showEventFilters
      ? query.view === "awol"
        ? listAwolLedgerFilterOptions(
            prisma,
            user.tenantId,
            query.includeArchived,
          )
        : listLedgerFilterOptions(prisma, user.tenantId)
      : Promise.resolve({ venues: [], eventTypes: [] }),
    listAbsencesForLedger(prisma, user.tenantId, query),
  ]);

  let detailAbsence = null;
  if (query.detail) {
    try {
      detailAbsence = await getAbsenceForTenant(
        prisma,
        user.tenantId,
        query.detail,
      );
    } catch (error) {
      if (error instanceof AbsenceAccessError) {
        redirect(ledgerCloseDetailHref(query));
      }
      throw error;
    }
  }

  const {
    rows,
    total,
    activeTotal,
    activeTypeCounts,
    matchingTypeCounts,
    page,
    pageCount,
  } = list;
  if (page !== query.page) {
    redirect(ledgerListHref(query, { page }));
  }

  const hasFilters = ledgerHasActiveFilters(query);
  const selectedVenue = options.venues.find((venue) => venue.id === query.venue);
  const selectedType = options.eventTypes.find(
    (type) => type.id === query.eventType,
  );
  const empty = emptyState(query, hasFilters);
  const affectedFrom = resolvedLedgerAffectedFrom(query);
  const affectedTo = resolvedLedgerAffectedTo(query);

  return (
    <div>
      <div inert={Boolean(detailAbsence) || undefined}>
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

      <LedgerTypeNav query={query} activeCount={activeTotal} />

      {query.view === "sickness" ? (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Sickness reports
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {SICKNESS_LEDGER_SUPPORTING_COPY}
          </p>
        </div>
      ) : null}

      <form method="get" className="mt-4">
        {query.view !== "all" ? (
          <input type="hidden" name="view" value={query.view} />
        ) : null}
        {query.detail ? (
          <input type="hidden" name="detail" value={query.detail} />
        ) : null}
        <FilterBar
          ariaLabel="Filter absences"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {hasFilters ||
              preserveSort ||
              reportedRangeInvalid ||
              affectedRangeInvalid ? (
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
          <FilterField
            label="Search"
            htmlFor="ledger-q"
            className="min-w-[14rem] flex-[1.4]"
          >
            <input
              id="ledger-q"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder={ledgerSearchPlaceholder(query.view)}
              className={filterControlClassName()}
            />
          </FilterField>
          {showEventFilters ? (
            <>
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
            </>
          ) : null}
          <FilterField label="Recorded from" htmlFor="ledger-reported-from">
            <input
              id="ledger-reported-from"
              name="reportedFrom"
              type="date"
              defaultValue={query.reportedFrom}
              aria-invalid={reportedRangeInvalid || undefined}
              aria-describedby={
                reportedRangeInvalid ? "ledger-reported-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Recorded to" htmlFor="ledger-reported-to">
            <input
              id="ledger-reported-to"
              name="reportedTo"
              type="date"
              defaultValue={query.reportedTo}
              aria-invalid={reportedRangeInvalid || undefined}
              aria-describedby={
                reportedRangeInvalid ? "ledger-reported-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Affected date from" htmlFor="ledger-affected-from">
            <input
              id="ledger-affected-from"
              name="affectedFrom"
              type="date"
              defaultValue={affectedFrom}
              aria-invalid={affectedRangeInvalid || undefined}
              aria-describedby={
                affectedRangeInvalid ? "ledger-affected-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField label="Affected date to" htmlFor="ledger-affected-to">
            <input
              id="ledger-affected-to"
              name="affectedTo"
              type="date"
              defaultValue={affectedTo}
              aria-invalid={affectedRangeInvalid || undefined}
              aria-describedby={
                affectedRangeInvalid ? "ledger-affected-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
          <div className="flex min-w-[9.5rem] flex-1 items-end pb-1">
            <label
              htmlFor="ledger-include-archived"
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                id="ledger-include-archived"
                name="includeArchived"
                type="checkbox"
                value="1"
                defaultChecked={query.includeArchived}
                className="size-4 rounded border-slate-300"
              />
              Show archived
            </label>
          </div>
        </FilterBar>
        {query.view === "all" && showEventFilters ? (
          <p className="mt-2 max-w-3xl text-xs text-slate-500">
            {LEDGER_EVENT_FILTER_HELP}
          </p>
        ) : null}
        {reportedRangeInvalid ? (
          <p
            id="ledger-reported-error"
            className="mt-2 text-xs text-red-700"
            role="alert"
          >
            Recorded from date must be on or before the to date.
          </p>
        ) : null}
        {affectedRangeInvalid ? (
          <p
            id="ledger-affected-error"
            className="mt-2 text-xs text-red-700"
            role="alert"
          >
            Affected from date must be on or before the to date.
          </p>
        ) : null}
        {hasFilters ? (
          <p className="mt-2 text-xs text-slate-500" aria-live="polite">
            Active filters:
            {query.q ? ` search “${query.q}”` : ""}
            {showEventFilters && selectedVenue
              ? ` · Venue ${selectedVenue.name}`
              : ""}
            {showEventFilters && selectedType
              ? ` · Event type ${selectedType.name}`
              : ""}
            {!reportedRangeInvalid && (query.reportedFrom || query.reportedTo)
              ? ` · Recorded ${query.reportedFrom || "…"}–${query.reportedTo || "…"}`
              : ""}
            {!affectedRangeInvalid && (affectedFrom || affectedTo)
              ? ` · Affected ${affectedFrom || "…"}–${affectedTo || "…"}`
              : ""}
            {query.includeArchived ? " · Show archived" : ""}
            {showEventFilters && !selectedVenue && query.venue
              ? " · Venue (unknown)"
              : ""}
            {showEventFilters && !selectedType && query.eventType
              ? " · Event type (unknown)"
              : ""}
          </p>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={empty.title}
          description={empty.description}
          action={
            empty.reset ? (
              <ButtonLink href="/ledger" variant="secondary">
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
          <div className="mt-4 space-y-0.5 text-sm text-slate-500" aria-live="polite">
            {formatLedgerResultsSummary({
              view: query.view,
              total,
              activeTotal,
              matchingTypeCounts,
              activeTypeCounts,
              hasFilters,
              includeArchived: query.includeArchived,
              page,
              pageCount,
            }).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <DataTable className="mt-3 hidden xl:block">
            <DataTableHead>
              <tr>
                <SortHeader field="type" label="Type" query={query} />
                <SortHeader field="staff" label="Staff" query={query} />
                <SortHeader field="reported" label="Recorded" query={query} />
                <SortHeader
                  field="affected"
                  label="Affected date"
                  query={query}
                />
                <th className="px-4 py-3 font-medium" scope="col">
                  Context
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Status
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </DataTableHead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <AbsenceTypeBadge type={row.type} />
                  </td>
                  <td className="max-w-[12rem] px-4 py-3">
                    <StaffCell row={row} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatLocalDateDisplay(row.recordedDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {row.affectedDate
                      ? formatLocalDateDisplay(row.affectedDate)
                      : "—"}
                  </td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <ContextCell row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge row={row} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ViewAbsenceLink row={row} query={query} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 xl:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="p-4 shadow-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <AbsenceTypeBadge type={row.type} />
                    <StatusBadge row={row} />
                  </div>
                  <div className="mt-3">
                    <StaffCell row={row} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Recorded {formatLocalDateDisplay(row.recordedDate)}
                  </p>
                  <p className="text-sm text-slate-600">
                    Affected date{" "}
                    {row.affectedDate
                      ? formatLocalDateDisplay(row.affectedDate)
                      : "—"}
                  </p>
                  <div className="mt-2 text-sm text-slate-700">
                    <ContextCell row={row} />
                  </div>
                  <div className="mt-3">
                    <ViewAbsenceLink row={row} query={query} />
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
            from={(page - 1) * LEDGER_PAGE_SIZE + 1}
            to={Math.min(page * LEDGER_PAGE_SIZE, total)}
            itemLabel={ledgerItemLabel(query.view)}
            hrefForPage={(nextPage) =>
              ledgerListHref(query, { page: nextPage })
            }
          />
        </>
      )}
      </div>

      <LedgerDetailDrawer
        open={Boolean(detailAbsence)}
        titleId="ledger-absence-detail-title"
        closeHref={ledgerCloseDetailHref(query)}
        returnFocusId={detailAbsence?.id ?? ""}
      >
        {detailAbsence ? (
          <AbsenceDetailContent
            absence={detailAbsence}
            flash={{
              created: first(raw.created),
              updated: first(raw.updated),
              archived: first(raw.archived),
            }}
            layout="drawer"
            titleId="ledger-absence-detail-title"
            archiveReturnTo={ledgerArchiveReturnHref(query, detailAbsence.id)}
          />
        ) : null}
      </LedgerDetailDrawer>
    </div>
  );
}
