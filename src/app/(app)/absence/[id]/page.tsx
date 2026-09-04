import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveCancellationDialog } from "@/components/absence/archive-cancellation-dialog";
import {
  AbsenceTypeBadge,
  FollowUpStatusBadge,
} from "@/components/absence/absence-badges";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  formatCalendarNotice,
  formatDurationMinutes,
  formatHistoryValue,
  HISTORY_ACTION_LABELS,
  HISTORY_FIELD_LABELS,
  NOTICE_BASIS_LABELS,
} from "@/lib/absence/display";
import { parseHistoryChanges } from "@/lib/absence/history";
import { getAbsenceForTenant } from "@/lib/absence/queries";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
} from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";
import { EmploymentStatusBadge } from "@/components/staff/staff-status-badge";

export const metadata = { title: "Cancellation" };

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

function actorName(user: { firstName: string; lastName: string } | null) {
  if (!user) {
    return "Unknown";
  }
  return `${user.firstName} ${user.lastName}`;
}

export default async function AbsenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    archived?: string;
  }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  const flash = await searchParams;

  let absence;
  try {
    absence = await getAbsenceForTenant(prisma, user.tenantId, id);
  } catch (error) {
    if (error instanceof AbsenceAccessError) {
      notFound();
    }
    throw error;
  }

  if (absence.type !== "CANCELLATION" || !absence.cancellation) {
    notFound();
  }

  const detail = absence.cancellation;
  const staffLive = !absence.staff.deletedAt;
  const eventLive = Boolean(absence.event && !absence.event.deletedAt);
  const eventName = detail.eventNameSnapshot;
  const staffName = formatStaffName(absence.staff);
  const archived = absence.recordStatus === "ARCHIVED";

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link href="/absence/new" className="hover:underline">
          Log Absence
        </Link>
        <span aria-hidden="true"> / </span>
        Cancellation
      </p>

      {flash.created === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Cancellation recorded.
        </p>
      ) : null}
      {flash.updated === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Cancellation corrected.
        </p>
      ) : null}
      {flash.archived === "1" ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          Cancellation archived.
        </p>
      ) : null}

      {archived ? (
        <p
          className="mt-4 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          role="status"
        >
          This cancellation is archived. It is hidden from active operational
          views and kept for audit.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Cancellation
            </h1>
            <AbsenceTypeBadge type={absence.type} />
            <FollowUpStatusBadge status={absence.followUpStatus} />
          </div>
          <p className="mt-2 text-slate-600">
            {staffName} · {eventName} ·{" "}
            {formatLocalDateDisplay(detail.eventDateSnapshot)}
          </p>
        </div>
        {!archived ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/absence/${absence.id}/edit`}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Correct cancellation
            </Link>
            <ArchiveCancellationDialog
              absenceId={absence.id}
              staffName={`${staffName} (${absence.staff.staffIdNumber})`}
              eventName={eventName}
            />
          </div>
        ) : null}
      </div>

      <dl className="mt-8 grid gap-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <Detail label="Staff">
          {staffLive ? (
            <Link href={`/staff/${absence.staff.id}`} className="underline">
              {staffName}
            </Link>
          ) : (
            staffName
          )}
          <span className="text-slate-600">
            {" "}
            · {absence.staff.staffIdNumber}
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">
              {absence.staff.roleTitle}
            </span>
            <EmploymentStatusBadge status={absence.staff.employmentStatus} />
          </div>
        </Detail>
        <Detail label="Event">
          {eventLive && absence.event ? (
            <Link href={`/events/${absence.event.id}`} className="underline">
              {eventName}
            </Link>
          ) : (
            eventName
          )}
          <p className="mt-1 text-sm text-slate-600">
            {absence.event?.reference ?? "No reference"}
            {" · "}
            {formatLocalDateDisplay(detail.eventDateSnapshot)}
            {detail.eventStartTimeSnapshot
              ? ` · ${detail.eventStartTimeSnapshot}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {detail.venueNameSnapshot ?? "No venue recorded"}
          </p>
        </Detail>
        <Detail label="Reported">
          {formatLocalDateDisplay(absence.reportedDate)}
          <span className="sr-only">
            {" "}
            {formatLocalDateIso(absence.reportedDate)}
          </span>
          {absence.reportedTime ? ` · ${absence.reportedTime}` : ""}
        </Detail>
        <Detail label="Notice given">
          {detail.noticeBasis === "EXACT_TIME" && detail.noticeMinutes != null
            ? `${formatDurationMinutes(detail.noticeMinutes)} (${formatCalendarNotice(detail.noticeCalendarDays)} by date)`
            : formatCalendarNotice(detail.noticeCalendarDays)}
          <p className="mt-1 text-sm text-slate-600">
            Calculated using {NOTICE_BASIS_LABELS[detail.noticeBasis].toLowerCase()}
          </p>
          {detail.isShortNotice ? (
            <p className="mt-1 text-sm font-medium text-amber-800">
              Short notice
            </p>
          ) : null}
          {detail.noticeCalendarDays < 0 ||
          (detail.noticeMinutes != null && detail.noticeMinutes < 0) ? (
            <p className="mt-1 text-sm font-medium text-amber-800">
              Retrospective / late record
            </p>
          ) : null}
        </Detail>
        <Detail label="Follow-up">
          <FollowUpStatusBadge status={absence.followUpStatus} />
        </Detail>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-slate-500">Reason</dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-900">
            {absence.reason}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-slate-500">Internal notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-900">
            {absence.notes ?? "—"}
          </dd>
        </div>
        <Detail label="Created">
          {absence.createdAt.toLocaleString("en-GB")} ·{" "}
          {actorName(absence.createdBy)}
        </Detail>
        <Detail label="Last updated">
          {absence.updatedAt.toLocaleString("en-GB")} ·{" "}
          {actorName(absence.updatedBy)}
        </Detail>
        {archived ? (
          <Detail label="Archived">
            {absence.archivedAt
              ? absence.archivedAt.toLocaleString("en-GB")
              : "—"}
            {absence.archivedBy ? ` · ${actorName(absence.archivedBy)}` : ""}
            {absence.archiveReason ? (
              <p className="mt-1 text-sm text-slate-600">
                {absence.archiveReason}
              </p>
            ) : null}
          </Detail>
        ) : null}
      </dl>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">History</h2>
        {absence.history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No history recorded.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {absence.history.map((entry) => {
              const changes = parseHistoryChanges(entry.changes);
              return (
                <li key={entry.id} className="py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">
                    {HISTORY_ACTION_LABELS[entry.action]}
                  </p>
                  <p className="mt-1 text-slate-600">
                    {entry.createdAt.toLocaleString("en-GB")}
                    {` · ${actorName(entry.actedBy)}`}
                  </p>
                  {entry.reason ? (
                    <p className="mt-1 text-slate-600">{entry.reason}</p>
                  ) : null}
                  {changes.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-slate-600">
                      {changes.map((change) => (
                        <li key={`${entry.id}-${change.field}`}>
                          {HISTORY_FIELD_LABELS[change.field] ?? change.field}:{" "}
                          {formatHistoryValue(change.field, change.previous)} →{" "}
                          {formatHistoryValue(change.field, change.next)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
