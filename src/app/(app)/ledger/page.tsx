import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { LedgerTypeNav } from "@/components/absence/ledger-type-nav";
import { LedgerActiveFilters } from "@/components/absence/ledger-active-filters";
import {
  LedgerClickCard,
  LedgerClickRow,
  LedgerDetailHost,
  ViewAbsenceButton,
} from "@/components/absence/ledger-detail-host";
import { LedgerQuickFilters } from "@/components/absence/ledger-quick-filters";
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
import { formatPayPeriodName, payPeriodStatusSuffix } from "@/lib/absence/pay-period";
import { listPayPeriods } from "@/lib/absence/pay-periods";
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
  formatLedgerResultsSummary,
  formatNoticeSummary,
  formatSicknessLedgerEpisodeContext,
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
import { toLedgerDrawerPreview } from "@/lib/absence/ledger-drawer-preview";
import { getTenantTimezone } from "@/lib/absence/queries";
import {
  ledgerClearFiltersHref,
  ledgerCloseDetailHref,
  ledgerListHref,
  ledgerLogAbsenceHref,
} from "@/lib/absence/url";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
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
  align = "left",
}: {
  field: LedgerSortField;
  label: string;
  query: LedgerListQuery;
  align?: "left" | "right";
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
      className={`px-4 py-3 font-medium ${align === "right" ? "w-44 min-w-44 text-right" : ""}`}
      aria-sort={ariaSort}
      scope="col"
    >
      <Link
        href={href}
        className={`inline-flex items-center gap-1 text-foreground hover:text-slate-950 hover:underline ${align === "right" ? "w-full justify-end" : ""}`}
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
      <span className="block truncate font-medium text-foreground" title={name}>
        {name}
      </span>
      <p className="whitespace-nowrap font-mono text-xs text-muted">
        {staff.staffIdNumber}
      </p>
      {live ? (
        <Link
          href={`/staff/${staff.id}`}
          data-ledger-separate=""
          className="mt-1 inline-flex text-xs font-medium text-muted hover:underline"
        >
          Staff profile
        </Link>
      ) : null}
    </>
  );
}

function EventName({ row, name }: { row: LedgerAbsenceRow; name: string }) {
  const live = Boolean(row.event && !row.event.deletedAt);
  return (
    <>
      <span className="block truncate font-medium text-foreground" title={name}>
        {name}
      </span>
      {live && row.event ? (
        <Link
          href={`/events/${row.event.id}`}
          data-ledger-separate=""
          className="mt-1 inline-flex text-xs font-medium text-muted hover:underline"
        >
          Event
        </Link>
      ) : null}
    </>
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
            className="truncate text-xs text-muted"
            title={detail.venueNameSnapshot}
          >
            {detail.venueNameSnapshot}
          </p>
        ) : null}
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
            className="truncate text-xs text-muted"
            title={detail.venueNameSnapshot}
          >
            {detail.venueNameSnapshot}
          </p>
        ) : null}
        {detail.eventReferenceSnapshot ? (
          <p className="whitespace-nowrap font-mono text-xs text-muted">
            {detail.eventReferenceSnapshot}
          </p>
        ) : null}
      </div>
    );
  }
  if (row.type === "SICKNESS" && row.sickness) {
    return (
      <div className="min-w-0">
        <p className="text-sm text-foreground">
          {formatSicknessLedgerEpisodeContext(row.sickness)}
        </p>
        <p className="text-xs text-muted">
          Sickness started{" "}
          {row.sickness.sicknessStartedDate
            ? formatLocalDateDisplay(row.sickness.sicknessStartedDate)
            : NO_SICKNESS_STARTED_RECORDED}
        </p>
        {row.issueSummaryPresent ? (
          <p className="text-xs text-muted">{ISSUE_SUMMARY_PRESENT_LABEL}</p>
        ) : null}
      </div>
    );
  }
  return <span className="text-muted">—</span>;
}

function StatusBadge({ row }: { row: LedgerAbsenceRow }) {
  if (row.recordStatus === "ARCHIVED") {
    return (
      <Badge tone="warning">{RECORD_STATUS_LABELS[row.recordStatus]}</Badge>
    );
  }
  return (
    <span className="text-sm text-muted">
      {RECORD_STATUS_LABELS[row.recordStatus]}
    </span>
  );
}

function TypeCell({ row }: { row: LedgerAbsenceRow }) {
  return (
    <div>
      <AbsenceTypeBadge type={row.type} />
      {row.type === "CANCELLATION" && row.cancellation?.unauthorised ? (
        <span className="mt-1 flex">
          <Badge tone="warning">Unauthorised</Badge>
        </span>
      ) : null}
    </div>
  );
}

function AffectedDateValue({
  row,
  prefix,
}: {
  row: LedgerAbsenceRow;
  prefix?: string;
}) {
  const notice =
    row.type === "CANCELLATION" && row.cancellation
      ? formatNoticeSummary(row.cancellation)
      : null;
  return (
    <>
      <span className="block">
        {prefix ? `${prefix} ` : null}
        {row.affectedDate ? formatLocalDateDisplay(row.affectedDate) : "—"}
      </span>
      {notice ? (
        <span className="block text-xs font-normal text-muted">
          Notice {notice}
        </span>
      ) : null}
      {row.type === "CANCELLATION" && row.cancellation ? (
        <NoticeWarningBadges detail={row.cancellation} />
      ) : null}
    </>
  );
}

function ViewAbsenceLink({ row }: { row: LedgerAbsenceRow }) {
  return (
    <ViewAbsenceButton
      absenceId={row.id}
      label={ledgerViewDetailsLabel(row.type)}
    />
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
    evidenceStatus: first(raw.evidenceStatus),
    unauthorised: first(raw.unauthorised),
    period: first(raw.period),
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

  let todayIso = "";
  if (query.view === "sickness") {
    try {
      const timeZone = await getTenantTimezone(prisma, user.tenantId);
      todayIso = todayIsoInTimeZone(timeZone);
    } catch {
      todayIso = "";
    }
  }

  const [options, list, periods]: [
    LedgerFilterOptions,
    Awaited<ReturnType<typeof listAbsencesForLedger>>,
    Awaited<ReturnType<typeof listPayPeriods>>,
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
    listAbsencesForLedger(
      prisma,
      user.tenantId,
      query,
      todayIso || undefined,
    ),
    listPayPeriods(prisma, user.tenantId),
  ]);

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
  const venueChipName =
    showEventFilters && query.venue
      ? (selectedVenue?.name ?? "unknown")
      : "";
  const eventTypeChipName =
    showEventFilters && query.eventType
      ? (selectedType?.name ?? "unknown")
      : "";
  const empty = emptyState(query, hasFilters);
  const affectedFrom = resolvedLedgerAffectedFrom(query);
  const affectedTo = resolvedLedgerAffectedTo(query);
  const selectedPeriod = periods.find((period) => period.id === query.period);
  const periodLabel =
    query.period === "none"
      ? "No period"
      : selectedPeriod
        ? formatPayPeriodName(selectedPeriod)
        : query.period
          ? "the selected pay period"
          : "";

  return (
    <LedgerDetailHost
      previews={rows.map(toLedgerDrawerPreview)}
      listHref={ledgerCloseDetailHref(query)}
      initialDetailId={query.detail}
      flash={{
        created: first(raw.created),
        updated: first(raw.updated),
        archived: first(raw.archived),
        episodeUpdated: first(raw.episodeUpdated),
        followUp: first(raw.followUp),
        evidence: first(raw.evidence),
        returnToWork: first(raw.returnToWork),
      }}
    >
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

      <LedgerTypeNav query={query} activeCount={activeTotal} />

      {query.view === "sickness" ? (
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-foreground">
            Sickness reports
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {SICKNESS_LEDGER_SUPPORTING_COPY}
          </p>
        </div>
      ) : null}

      <LedgerQuickFilters query={query} />

      <form method="get" className="mt-3">
        {query.view !== "all" ? (
          <input type="hidden" name="view" value={query.view} />
        ) : null}
        <input
          type="hidden"
          name="detail"
          defaultValue={query.detail}
          data-ledger-detail=""
          disabled={query.detail.length === 0}
        />
        <FilterBar
          ariaLabel="Filter absences"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" variant="secondary" size="sm">
                Apply filters
              </Button>
              {preserveSort ? (
                <ButtonLink
                  href={ledgerListHref(query, {
                    sort: defaultSort,
                    direction: DEFAULT_LEDGER_DIRECTION,
                    page: 1,
                  })}
                  variant="secondary"
                  size="sm"
                >
                  Reset sort
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
          {query.includeArchived ? (
            <input type="hidden" name="includeArchived" value="1" />
          ) : null}
          {query.view === "cancellations" && query.unauthorised ? (
            <input type="hidden" name="unauthorised" value="1" />
          ) : null}
          {query.view === "sickness" && query.evidenceStatus ? (
            <input
              type="hidden"
              name="evidenceStatus"
              value={query.evidenceStatus}
            />
          ) : null}
          <FilterField label="Pay period" htmlFor="ledger-period" className="min-w-[16rem]">
            <select
              id="ledger-period"
              name="period"
              defaultValue={query.period}
              className={filterControlClassName()}
            >
              <option value="">All periods</option>
              <option value="none">No period</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {formatPayPeriodName(period)}
                  {payPeriodStatusSuffix(period, periods)}
                </option>
              ))}
            </select>
          </FilterField>
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
        </FilterBar>
        {query.view === "all" && showEventFilters ? (
          <p className="mt-2 max-w-3xl text-xs text-muted">
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
      </form>
      <LedgerActiveFilters
        query={query}
        periodLabel={periodLabel}
        venueName={venueChipName}
        eventTypeName={eventTypeChipName}
        showClear={
          hasFilters || reportedRangeInvalid || affectedRangeInvalid
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={empty.title}
          description={empty.description}
          action={
            empty.reset ? (
              <ButtonLink
                href={ledgerClearFiltersHref(query)}
                variant="secondary"
              >
                Clear filters
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
          <div className="mt-4 space-y-0.5 text-sm text-muted" aria-live="polite">
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
              periodLabel: periodLabel || undefined,
            }).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <DataTable className="mt-3 hidden xl:block" stickyHeader>
            <DataTableHead sticky>
              <tr>
                <SortHeader field="type" label="Type" query={query} />
                <SortHeader field="staff" label="Staff" query={query} />
                <SortHeader
                  field="reported"
                  label="Recorded"
                  query={query}
                  align="right"
                />
                <SortHeader
                  field="affected"
                  label="Affected date"
                  query={query}
                  align="right"
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
                <LedgerClickRow
                  key={row.id}
                  absenceId={row.id}
                  className="border-b border-row"
                >
                  <td className="px-4 py-3">
                    <TypeCell row={row} />
                  </td>
                  <td className="max-w-[12rem] px-4 py-3">
                    <StaffCell row={row} />
                  </td>
                  <td className="w-44 min-w-44 px-4 py-3 text-right text-foreground tabular-nums whitespace-nowrap">
                    {formatLocalDateDisplay(row.recordedDate)}
                  </td>
                  <td className="w-44 min-w-44 px-4 py-3 text-right text-foreground tabular-nums">
                    <AffectedDateValue row={row} />
                  </td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <ContextCell row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge row={row} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ViewAbsenceLink row={row} />
                  </td>
                </LedgerClickRow>
              ))}
            </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 xl:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <LedgerClickCard absenceId={row.id}>
                  <Card className="p-4 shadow-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeCell row={row} />
                      <StatusBadge row={row} />
                    </div>
                    <div className="mt-3">
                      <StaffCell row={row} />
                    </div>
                    <p className="mt-2 text-sm text-muted tabular-nums">
                      Recorded {formatLocalDateDisplay(row.recordedDate)}
                    </p>
                    <div className="text-sm text-muted tabular-nums">
                      <AffectedDateValue row={row} prefix="Affected date" />
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      <ContextCell row={row} />
                    </div>
                    <div className="mt-3">
                      <ViewAbsenceLink row={row} />
                    </div>
                  </Card>
                </LedgerClickCard>
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
    </LedgerDetailHost>
  );
}
