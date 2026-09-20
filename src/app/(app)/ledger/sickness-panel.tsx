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
  DEFAULT_LEDGER_DIRECTION,
  DEFAULT_SICKNESS_LEDGER_SORT,
  LEDGER_PAGE_SIZE,
  type LedgerSortDirection,
  type LedgerSortField,
} from "@/lib/absence/catalog";
import { RECORD_STATUS_LABELS } from "@/lib/absence/display";
import {
  isLedgerDateRangeInvalid,
  isLedgerFirstDayRangeInvalid,
  ledgerHasActiveFilters,
  type LedgerListQuery,
} from "@/lib/absence/schema";
import {
  listSicknessForLedger,
  type LedgerSicknessRow,
} from "@/lib/absence/queries";
import {
  ISSUE_SUMMARY_PRESENT_LABEL,
  NO_SICKNESS_STARTED_RECORDED,
  SICKNESS_LEDGER_EMPTY_DESCRIPTION,
  SICKNESS_LEDGER_EMPTY_TITLE,
  SICKNESS_LEDGER_NO_ARCHIVED_DESCRIPTION,
  SICKNESS_LEDGER_NO_ARCHIVED_TITLE,
  SICKNESS_LEDGER_NO_MATCH_DESCRIPTION,
  SICKNESS_LEDGER_NO_MATCH_TITLE,
  SICKNESS_LEDGER_SUPPORTING_COPY,
} from "@/lib/absence/sickness";
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
    : field === "staff"
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

function snapshotStaff(row: LedgerSicknessRow) {
  return {
    firstName: row.sickness?.staffFirstNameSnapshot ?? "",
    lastName: row.sickness?.staffLastNameSnapshot ?? "",
    staffIdNumber: row.sickness?.staffIdNumberSnapshot ?? "",
  };
}

function StaffCell({ row }: { row: LedgerSicknessRow }) {
  const staff = snapshotStaff(row);
  const name = formatStaffName(staff);
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
        {staff.staffIdNumber}
      </p>
    </>
  );
}

function emptyState(query: LedgerListQuery, hasFilters: boolean) {
  const onlyArchived =
    query.includeArchived &&
    !query.q &&
    !query.reportedFrom &&
    !query.reportedTo &&
    !query.firstDayFrom &&
    !query.firstDayTo;
  if (onlyArchived) {
    return {
      title: SICKNESS_LEDGER_NO_ARCHIVED_TITLE,
      description: SICKNESS_LEDGER_NO_ARCHIVED_DESCRIPTION,
      reset: true,
    };
  }
  if (hasFilters) {
    return {
      title: SICKNESS_LEDGER_NO_MATCH_TITLE,
      description: SICKNESS_LEDGER_NO_MATCH_DESCRIPTION,
      reset: true,
    };
  }
  return {
    title: SICKNESS_LEDGER_EMPTY_TITLE,
    description: SICKNESS_LEDGER_EMPTY_DESCRIPTION,
    reset: false,
  };
}

export async function SicknessLedgerPanel({
  tenantId,
  query,
}: {
  tenantId: string;
  query: LedgerListQuery;
}) {
  const reportedRangeInvalid = isLedgerDateRangeInvalid(query);
  const firstDayRangeInvalid = isLedgerFirstDayRangeInvalid(query);
  const list = await listSicknessForLedger(prisma, tenantId, query);

  const { rows, total, activeTotal, page, pageCount } = list;
  if (page !== query.page) {
    redirect(ledgerListHref(query, { page }));
  }

  const hasFilters = ledgerHasActiveFilters(query);
  const preserveSort =
    query.sort !== DEFAULT_SICKNESS_LEDGER_SORT ||
    query.direction !== DEFAULT_LEDGER_DIRECTION;
  const resetHref = "/ledger?view=sickness";
  const logHref = "/absence/new?type=sickness";
  const empty = emptyState(query, hasFilters);

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

      <LedgerTypeNav view="sickness" activeCount={activeTotal} />

      <div className="mt-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Sickness reports
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {SICKNESS_LEDGER_SUPPORTING_COPY}
        </p>
      </div>

      <form method="get" className="mt-4">
        <input type="hidden" name="view" value="sickness" />
        <FilterBar
          ariaLabel="Filter sickness reports"
          active={hasFilters}
          actions={
            <>
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              {hasFilters ||
              preserveSort ||
              reportedRangeInvalid ||
              firstDayRangeInvalid ? (
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
              placeholder="Staff name or ID"
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField
            label="Date sickness reported from"
            htmlFor="ledger-reported-from"
          >
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
          <FilterField
            label="Date sickness reported to"
            htmlFor="ledger-reported-to"
          >
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
          <FilterField
            label="First day sick from work from"
            htmlFor="ledger-first-day-from"
          >
            <input
              id="ledger-first-day-from"
              name="firstDayFrom"
              type="date"
              defaultValue={query.firstDayFrom}
              aria-invalid={firstDayRangeInvalid || undefined}
              aria-describedby={
                firstDayRangeInvalid ? "ledger-first-day-error" : undefined
              }
              className={filterControlClassName()}
            />
          </FilterField>
          <FilterField
            label="First day sick from work to"
            htmlFor="ledger-first-day-to"
          >
            <input
              id="ledger-first-day-to"
              name="firstDayTo"
              type="date"
              defaultValue={query.firstDayTo}
              aria-invalid={firstDayRangeInvalid || undefined}
              aria-describedby={
                firstDayRangeInvalid ? "ledger-first-day-error" : undefined
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
        {reportedRangeInvalid ? (
          <p
            id="ledger-date-error"
            className="mt-2 text-xs text-red-700"
            role="alert"
          >
            From date must be on or before To date.
          </p>
        ) : null}
        {firstDayRangeInvalid ? (
          <p
            id="ledger-first-day-error"
            className="mt-2 text-xs text-red-700"
            role="alert"
          >
            From date must be on or before To date.
          </p>
        ) : null}
        {hasFilters ? (
          <p className="mt-2 text-xs text-slate-500" aria-live="polite">
            Active filters:
            {query.q ? ` search “${query.q}”` : ""}
            {!reportedRangeInvalid && (query.reportedFrom || query.reportedTo)
              ? ` · Date sickness reported ${query.reportedFrom || "…"}–${query.reportedTo || "…"}`
              : ""}
            {!firstDayRangeInvalid && (query.firstDayFrom || query.firstDayTo)
              ? ` · First day sick from work ${query.firstDayFrom || "…"}–${query.firstDayTo || "…"}`
              : ""}
            {query.includeArchived ? " · Show archived" : ""}
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
              ? `${total} matching · ${activeTotal} active Sickness reports`
              : `${total} ${total === 1 ? "Sickness report" : "Sickness reports"}`}
            {pageCount > 1 ? ` · Page ${page} of ${pageCount}` : ""}
          </p>

          <DataTable className="mt-3 hidden xl:block">
            <DataTableHead>
              <tr>
                <SortHeader
                  field="firstDay"
                  label="First day sick from work"
                  query={query}
                />
                <SortHeader
                  field="reported"
                  label="Date sickness reported"
                  query={query}
                />
                <SortHeader field="staff" label="Staff" query={query} />
                <SortHeader
                  field="sicknessStarted"
                  label="Sickness started"
                  query={query}
                />
                <th className="px-4 py-3 font-medium" scope="col">
                  Issue summary
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Record status
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </DataTableHead>
            <tbody>
              {rows.map((row) => {
                const detail = row.sickness;
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {detail
                        ? formatLocalDateDisplay(detail.firstWorkingDaySick)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatLocalDateDisplay(row.reportedDate)}
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <StaffCell row={row} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {detail?.sicknessStartedDate
                        ? formatLocalDateDisplay(detail.sicknessStartedDate)
                        : NO_SICKNESS_STARTED_RECORDED}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.issueSummaryPresent
                        ? ISSUE_SUMMARY_PRESENT_LABEL
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {RECORD_STATUS_LABELS[row.recordStatus]}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ButtonLink
                        href={`/absence/${row.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        View sickness report
                      </ButtonLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <ul className="mt-3 space-y-3 xl:hidden">
            {rows.map((row) => {
              const detail = row.sickness;
              const archived = row.recordStatus === "ARCHIVED";
              return (
                <li key={row.id}>
                  <Card className="p-4 shadow-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <AbsenceTypeBadge type="SICKNESS" />
                      {archived ? (
                        <span className="text-sm font-medium text-slate-700">
                          {RECORD_STATUS_LABELS.ARCHIVED}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <StaffCell row={row} />
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      First day sick from work{" "}
                      {detail
                        ? formatLocalDateDisplay(detail.firstWorkingDaySick)
                        : "—"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Date sickness reported{" "}
                      {formatLocalDateDisplay(row.reportedDate)}
                    </p>
                    {detail?.sicknessStartedDate ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Sickness started{" "}
                        {formatLocalDateDisplay(detail.sicknessStartedDate)}
                      </p>
                    ) : null}
                    {row.issueSummaryPresent ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {ISSUE_SUMMARY_PRESENT_LABEL}
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <ButtonLink
                        href={`/absence/${row.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        View sickness report
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
            itemLabel="Sickness reports"
            hrefForPage={(nextPage) =>
              ledgerListHref(query, { page: nextPage })
            }
          />
        </>
      )}
    </div>
  );
}
