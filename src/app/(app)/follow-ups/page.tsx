import Link from "next/link";
import { redirect } from "next/navigation";
import { AbsenceDetailContent } from "@/components/absence/absence-detail-content";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { CompleteFollowUpDialog } from "@/components/absence/follow-up-dialogs";
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
import { FOLLOW_UP_DUE_LABELS } from "@/lib/absence/follow-up";
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
        description="Open operational actions for this organisation, ordered by overdue, due today, then upcoming."
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
                : "Follow-ups you add on an active absence will appear here."
            }
            action={
              hasFilters ? (
                <ButtonLink href="/follow-ups" variant="secondary" size="sm">
                  Clear filters
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">
              {list.total === 1
                ? "1 open follow-up"
                : `${list.total} open follow-ups`}
            </p>
            <DataTable className="mt-3 hidden xl:block">
              <DataTableHead>
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
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {FOLLOW_UP_DUE_LABELS[row.dueState]}
                      </p>
                      <p className="text-slate-600">
                        {formatLocalDateDisplay(row.dueDate)}
                      </p>
                    </td>
                    <td className="max-w-[12rem] px-4 py-3">
                      <p className="break-words font-medium text-slate-900">
                        {formatStaffName(row.staff)}
                      </p>
                      <p className="text-slate-600">{row.staff.staffIdNumber}</p>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <AbsenceTypeBadge type={row.absenceType} />
                      <ul className="mt-2 space-y-1 break-words text-slate-700">
                        {row.context.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="max-w-[20rem] px-4 py-3">
                      <p className="whitespace-pre-wrap break-words text-slate-800">
                        {row.details}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-2">
                        <Link
                          href={followUpDetailHref(query, row.absenceId)}
                          data-ledger-view={row.absenceId}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Open absence
                        </Link>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            <ul className="mt-3 space-y-3 xl:hidden">
              {list.rows.map((row) => (
                <li key={row.id}>
                  <Card className="p-4 shadow-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <AbsenceTypeBadge type={row.absenceType} />
                      <span className="text-sm font-medium text-slate-900">
                        {FOLLOW_UP_DUE_LABELS[row.dueState]}
                      </span>
                      <span className="text-sm text-slate-600">
                        {formatLocalDateDisplay(row.dueDate)}
                      </span>
                    </div>
                    <p className="mt-3 break-words font-medium text-slate-900">
                      {formatStaffName(row.staff)}
                    </p>
                    <p className="text-sm text-slate-600">
                      {row.staff.staffIdNumber}
                    </p>
                    <ul className="mt-2 space-y-1 break-words text-sm text-slate-700">
                      {row.context.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                      {row.details}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={followUpDetailHref(query, row.absenceId)}
                        data-ledger-view={row.absenceId}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open absence
                      </Link>
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
                    </div>
                  </Card>
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
              itemLabel="follow-ups"
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
            timeZone={timeZone || undefined}
            todayIso={todayIso || undefined}
          />
        ) : null}
      </LedgerDetailDrawer>
    </div>
  );
}
