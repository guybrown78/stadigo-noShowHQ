import Link from "next/link";
import { redirect } from "next/navigation";
import { AbsenceDetailContent } from "@/components/absence/absence-detail-content";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { CompleteFollowUpDialog } from "@/components/absence/follow-up-dialogs";
import { FollowUpActiveFilters } from "@/components/absence/follow-up-active-filters";
import { FollowUpClickCard, FollowUpClickRow } from "@/components/absence/follow-up-click-row";
import { FollowUpQueueFilters } from "@/components/absence/follow-up-queue-filters";
import { LedgerDetailDrawer } from "@/components/absence/ledger-detail-drawer";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableHead } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  FOLLOW_UP_DUE_LABELS,
  FOLLOW_UP_VISIBILITY_DUE_LABELS,
  FOLLOW_UP_VISIBILITY_LABELS,
} from "@/lib/absence/follow-up";
import { FOLLOW_UP_QUEUE_PAGE_SIZE } from "@/lib/absence/catalog";
import {
  followUpQueueHasFilters,
  parseFollowUpQueueQuery,
} from "@/lib/absence/follow-up-schema";
import { listFollowUpQueue } from "@/lib/absence/follow-up-service";
import {
  evidenceActionReturnHref,
  followUpActionReturnHref,
  returnToWorkActionReturnHref,
  missedShiftActionReturnHref,
  followUpCloseDetailHref,
  followUpDetailHref,
  followUpQueueHref,
} from "@/lib/absence/follow-up-url";
import { getAbsenceForTenant, getTenantTimezone } from "@/lib/absence/queries";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import { formatLocalDateDisplay, parseLocalDate } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export const metadata = { title: "Follow-ups" };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireTenant();
  const raw = await searchParams;
  const query = parseFollowUpQueueQuery({
    q: first(raw.q),
    type: first(raw.type),
    due: first(raw.due),
    page: first(raw.page),
    detail: first(raw.detail),
  });

  let timeZone = "";
  let todayIso = "";
  try {
    timeZone = await getTenantTimezone(prisma, user.tenantId);
    todayIso = todayIsoInTimeZone(timeZone);
  } catch {
    timeZone = "";
    todayIso = "";
  }
  const today = todayIso ? parseLocalDate(todayIso) : null;

  const list = today
    ? await listFollowUpQueue(prisma, user.tenantId, query, today)
    : { rows: [], total: 0, page: query.page, pageCount: 1 };

  if (today && query.page > list.pageCount) {
    redirect(followUpQueueHref(query, { page: list.pageCount }));
  }

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
        redirect(followUpCloseDetailHref(query));
      }
      throw error;
    }
  }

  const hasFilters = followUpQueueHasFilters(query);
  const rowReturnTo = followUpActionReturnHref(followUpQueueHref(query));

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Ongoing sickness and unresolved AWOL stay here until the sickness ends or the AWOL is archived. Dated follow-ups are ordered by overdue, due today, then upcoming."
      />
      {first(raw.followUp) === "1" ? (
        <Banner tone="success" className="mt-4">
          Follow-up saved.
        </Banner>
      ) : null}
      {!today ? (
        <Banner tone="warning" className="mt-4">
          Follow-up dates need a valid organisation timezone before this queue
          can be shown.
        </Banner>
      ) : null}

      <div inert={Boolean(detailAbsence) || undefined}>
        <FollowUpQueueFilters query={query} />

        {!today ? null : list.total === 0 ? (
          <>
          {hasFilters ? (
            <div className="mt-4">
              <FollowUpActiveFilters query={query} />
            </div>
          ) : null}
          <EmptyState
            className="mt-6"
            title={
              hasFilters
                ? "No follow-ups match these filters."
                : "No open follow-ups."
            }
            description={
              hasFilters
                ? "Try a different search, or clear the filters."
                : "Ongoing sickness, unresolved AWOL, and follow-ups added on an active absence appear here."
            }
            action={
              hasFilters ? (
                <ButtonLink href="/follow-ups" variant="secondary" size="sm">
                  Clear filters
                </ButtonLink>
              ) : undefined
            }
          />
          </>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-sm text-muted">
                {list.total === 1 ? "1 to review" : `${list.total} to review`}
              </p>
              <FollowUpActiveFilters query={query} />
            </div>
            <DataTable className="mt-3 hidden xl:block" stickyHeader>
              <DataTableHead sticky>
                <tr>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Due
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Staff
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Absence
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Details
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </DataTableHead>
              <tbody>
                {list.rows.map((row) => (
                  <FollowUpClickRow
                    key={row.id}
                    href={followUpDetailHref(query, row.absenceId)}
                    className="align-top"
                  >
                    <td className="px-4 py-3">
                      {row.kind === "visibility" && row.visibility ? (
                        <p className="font-medium text-foreground">
                          {FOLLOW_UP_VISIBILITY_DUE_LABELS[row.visibility]}
                        </p>
                      ) : row.dueState && row.dueDate ? (
                        <>
                          <p className="font-medium text-foreground">
                            {FOLLOW_UP_DUE_LABELS[row.dueState]}
                          </p>
                          <p className="text-muted">
                            {formatLocalDateDisplay(row.dueDate)}
                          </p>
                        </>
                      ) : null}
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <p className="break-words font-medium text-foreground">
                        {formatStaffName(row.staff)}
                      </p>
                      <p className="text-muted">{row.staff.staffIdNumber}</p>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <AbsenceTypeBadge type={row.absenceType} />
                      <ul className="mt-2 space-y-1 break-words text-foreground">
                        {row.context.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="max-w-[20rem] px-4 py-3">
                      {row.kind === "follow-up" && row.visibility ? (
                        <p className="text-foreground">
                          {FOLLOW_UP_VISIBILITY_LABELS[row.visibility]}
                        </p>
                      ) : null}
                      {row.details ? (
                        <p className="whitespace-pre-wrap break-words text-foreground">
                          {row.details}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3" data-follow-up-separate>
                      <div className="flex flex-col items-start gap-2">
                        <Link
                          href={followUpDetailHref(query, row.absenceId)}
                          data-ledger-view={row.absenceId}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Open absence
                        </Link>
                        {row.kind === "follow-up" ? (
                          <CompleteFollowUpDialog
                            followUpId={row.id}
                            details={row.details}
                            expectedUpdatedAt={row.updatedAt.toISOString()}
                            staffName={formatStaffName(row.staff)}
                            staffIdNumber={row.staff.staffIdNumber}
                            typeLabel={ABSENCE_TYPE_LABELS[row.absenceType]}
                            context={row.context}
                            returnTo={rowReturnTo}
                          />
                        ) : null}
                      </div>
                    </td>
                  </FollowUpClickRow>
                ))}
              </tbody>
            </DataTable>

            <ul className="mt-3 space-y-3 xl:hidden">
              {list.rows.map((row) => (
                <li key={row.id}>
                  <FollowUpClickCard href={followUpDetailHref(query, row.absenceId)}>
                  <Card className="p-4 shadow-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <AbsenceTypeBadge type={row.absenceType} />
                      {row.kind === "visibility" && row.visibility ? (
                        <span className="text-sm font-medium text-foreground">
                          {FOLLOW_UP_VISIBILITY_DUE_LABELS[row.visibility]}
                        </span>
                      ) : row.dueState && row.dueDate ? (
                        <>
                          <span className="text-sm font-medium text-foreground">
                            {FOLLOW_UP_DUE_LABELS[row.dueState]}
                          </span>
                          <span className="text-sm text-muted">
                            {formatLocalDateDisplay(row.dueDate)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <p className="mt-3 break-words font-medium text-foreground">
                      {formatStaffName(row.staff)}
                    </p>
                    <p className="text-sm text-muted">
                      {row.staff.staffIdNumber}
                    </p>
                    <ul className="mt-2 space-y-1 break-words text-sm text-foreground">
                      {row.context.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {row.kind === "follow-up" && row.visibility ? (
                      <p className="mt-2 text-sm text-foreground">
                        {FOLLOW_UP_VISIBILITY_LABELS[row.visibility]}
                      </p>
                    ) : null}
                    {row.details ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                        {row.details}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2" data-follow-up-separate>
                      <Link
                        href={followUpDetailHref(query, row.absenceId)}
                        data-ledger-view={row.absenceId}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open absence
                      </Link>
                      {row.kind === "follow-up" ? (
                        <CompleteFollowUpDialog
                          followUpId={row.id}
                          details={row.details}
                          expectedUpdatedAt={row.updatedAt.toISOString()}
                          staffName={formatStaffName(row.staff)}
                          staffIdNumber={row.staff.staffIdNumber}
                          typeLabel={ABSENCE_TYPE_LABELS[row.absenceType]}
                          context={row.context}
                          returnTo={rowReturnTo}
                        />
                      ) : null}
                    </div>
                  </Card>
                  </FollowUpClickCard>
                </li>
              ))}
            </ul>

            <Pagination
              className="mt-6"
              page={list.page}
              pageCount={list.pageCount}
              total={list.total}
              from={(list.page - 1) * FOLLOW_UP_QUEUE_PAGE_SIZE + 1}
              to={Math.min(list.page * FOLLOW_UP_QUEUE_PAGE_SIZE, list.total)}
              itemLabel="items"
              hrefForPage={(nextPage) =>
                followUpQueueHref(query, { page: nextPage })
              }
            />
          </>
        )}
      </div>

      <LedgerDetailDrawer
        open={Boolean(detailAbsence)}
        titleId="follow-up-absence-detail-title"
        closeHref={followUpCloseDetailHref(query)}
        returnFocusId={detailAbsence?.id ?? ""}
      >
        {detailAbsence ? (
          <AbsenceDetailContent
            absence={detailAbsence}
            flash={{
              followUp: first(raw.followUp),
              evidence: first(raw.evidence),
              returnToWork: first(raw.returnToWork),
              shifts: first(raw.shifts),
            }}
            layout="drawer"
            titleId="follow-up-absence-detail-title"
            followUpReturnTo={followUpActionReturnHref(
              followUpDetailHref(query, detailAbsence.id),
            )}
            evidenceReturnTo={evidenceActionReturnHref(
              followUpDetailHref(query, detailAbsence.id),
            )}
            returnToWorkReturnTo={returnToWorkActionReturnHref(
              followUpDetailHref(query, detailAbsence.id),
            )}
            shiftsReturnTo={missedShiftActionReturnHref(
              followUpDetailHref(query, detailAbsence.id),
            )}
            timeZone={timeZone || undefined}
            todayIso={todayIso || undefined}
          />
        ) : null}
      </LedgerDetailDrawer>
    </div>
  );
}
