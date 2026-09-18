import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveAwolDialog } from "@/components/absence/archive-awol-dialog";
import { ArchiveCancellationDialog } from "@/components/absence/archive-cancellation-dialog";
import { ArchiveSicknessDialog } from "@/components/absence/archive-sickness-dialog";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { AbsenceAccessError } from "@/lib/absence/errors";
import {
  formatCalendarNotice,
  formatDurationMinutes,
  formatHistoryValue,
  formatInternalNotes,
  formatIssueSummary,
  historyActionLabel,
  historyFieldLabel,
  NOTICE_BASIS_LABELS,
} from "@/lib/absence/display";
import { parseHistoryChanges } from "@/lib/absence/history";
import { getAbsenceForTenant, type AbsenceDetail } from "@/lib/absence/queries";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
} from "@/lib/events/dates";
import {
  NO_SICKNESS_STARTED_RECORDED,
  SICKNESS_INITIAL_STATUS_LABEL,
} from "@/lib/absence/sickness";
import { formatStaffName } from "@/lib/staff/display";
import { EmploymentStatusBadge } from "@/components/staff/staff-status-badge";
import { cn } from "@/lib/cn";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireTenant();
  const { id } = await params;
  try {
    const absence = await getAbsenceForTenant(prisma, user.tenantId, id);
    return { title: absence.type === "AWOL" ? "AWOL" : absence.type === "SICKNESS" ? "Sickness" : "Cancellation" };
  } catch {
    return { title: "Absence" };
  }
}

function Detail({
  label,
  children,
  className,
  valueClassName,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className={cn("mt-1 min-w-0 text-slate-900", valueClassName)}>
        {children}
      </dd>
    </div>
  );
}

function InternalNotesDetail({ notes }: { notes: string | null }) {
  return (
    <Detail label="Internal notes" className="sm:col-span-2">
      <p className="whitespace-pre-wrap break-words">
        {formatInternalNotes(notes)}
      </p>
    </Detail>
  );
}

function actorName(user: { firstName: string; lastName: string } | null) {
  if (!user) {
    return "Unknown";
  }
  return `${user.firstName} ${user.lastName}`;
}

function HistoryCard({ absence }: { absence: AbsenceDetail }) {
  return (
    <Card className="mt-8 shadow-none">
      <CardHeader title="History" />
      <CardBody>
        {absence.history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No history recorded.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {absence.history.map((entry) => {
              const changes = parseHistoryChanges(entry.changes);
              return (
                <li key={entry.id} className="py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">
                    {historyActionLabel(entry.action, absence.type)}
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
                          {historyFieldLabel(change.field, absence.type)}:{" "}
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
      </CardBody>
    </Card>
  );
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

  if (absence.type === "AWOL" && absence.awol) {
    return <AwolDetail absence={absence} flash={flash} />;
  }
  if (absence.type === "SICKNESS" && absence.sickness) {
    return <SicknessDetail absence={absence} flash={flash} />;
  }
  if (absence.type === "CANCELLATION" && absence.cancellation) {
    return <CancellationDetail absence={absence} flash={flash} />;
  }
  notFound();
}

function StaffEventHeader({
  absence,
  eventName,
  eventDate,
}: {
  absence: AbsenceDetail;
  eventName: string;
  eventDate: Date;
}) {
  const staffLive = !absence.staff.deletedAt;
  const eventLive = Boolean(absence.event && !absence.event.deletedAt);
  const staffName = formatStaffName(absence.staff);

  return (
    <>
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
          {formatLocalDateDisplay(eventDate)}
        </p>
      </Detail>
    </>
  );
}

function CancellationDetail({
  absence,
  flash,
}: {
  absence: AbsenceDetail;
  flash: { created?: string; updated?: string; archived?: string };
}) {
  const detail = absence.cancellation!;
  const eventName = detail.eventNameSnapshot;
  const staffName = formatStaffName(absence.staff);
  const archived = absence.recordStatus === "ARCHIVED";

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/ledger", label: "Ledger" },
          { label: "Cancellation" },
        ]}
        title="Cancellation"
        description={
          <>
            <AbsenceTypeBadge type={absence.type} />
            <span className="ml-2">
              {staffName} · {eventName} ·{" "}
              {formatLocalDateDisplay(detail.eventDateSnapshot)}
            </span>
          </>
        }
        actions={
          !archived ? (
            <>
              <ButtonLink href={`/absence/${absence.id}/edit`}>
                Correct cancellation
              </ButtonLink>
              <ArchiveCancellationDialog
                absenceId={absence.id}
                staffName={`${staffName} (${absence.staff.staffIdNumber})`}
                eventName={eventName}
              />
            </>
          ) : undefined
        }
      />

      {flash.created === "1" ? (
        <Banner tone="success" className="mt-4">
          Cancellation recorded.
        </Banner>
      ) : null}
      {flash.updated === "1" ? (
        <Banner tone="success" className="mt-4">
          Cancellation corrected.
        </Banner>
      ) : null}
      {flash.archived === "1" ? (
        <Banner tone="success" className="mt-4">
          Cancellation archived.
        </Banner>
      ) : null}

      {archived ? (
        <Banner tone="neutral" className="mt-4">
          This cancellation is archived. It is hidden from active operational
          views and kept for audit.
        </Banner>
      ) : null}

      <dl className="mt-8 grid gap-6 rounded-xl border border-border bg-surface p-6 shadow-sm sm:grid-cols-2">
        <StaffEventHeader
          absence={absence}
          eventName={eventName}
          eventDate={detail.eventDateSnapshot}
        />
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
        <MetaDetails absence={absence} archived={archived} />
      </dl>
      <HistoryCard absence={absence} />
    </div>
  );
}

function AwolDetail({
  absence,
  flash,
}: {
  absence: AbsenceDetail;
  flash: { created?: string; updated?: string; archived?: string };
}) {
  const detail = absence.awol!;
  const eventName = detail.eventNameSnapshot;
  const staffName = formatStaffName(absence.staff);
  const archived = absence.recordStatus === "ARCHIVED";
  const eventLive = Boolean(absence.event && !absence.event.deletedAt);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/ledger?view=awol", label: "Ledger" },
          { label: "AWOL" },
        ]}
        title="AWOL"
        description={
          <>
            <AbsenceTypeBadge type={absence.type} />
            <span className="ml-2">
              Did not attend with no prior notice · {staffName} · {eventName} ·{" "}
              {formatLocalDateDisplay(detail.eventDateSnapshot)}
            </span>
          </>
        }
        actions={
          !archived ? (
            <>
              <ButtonLink href={`/absence/${absence.id}/edit`}>
                Correct AWOL
              </ButtonLink>
              <ArchiveAwolDialog
                absenceId={absence.id}
                staffName={`${staffName} (${absence.staff.staffIdNumber})`}
                eventName={eventName}
                expectedUpdatedAt={absence.updatedAt.toISOString()}
              />
            </>
          ) : undefined
        }
      />

      {flash.created === "1" ? (
        <Banner tone="success" className="mt-4">
          AWOL recorded.
        </Banner>
      ) : null}
      {flash.updated === "1" ? (
        <Banner tone="success" className="mt-4">
          AWOL corrected.
        </Banner>
      ) : null}
      {flash.archived === "1" ? (
        <Banner tone="success" className="mt-4">
          AWOL archived.
        </Banner>
      ) : null}

      {archived ? (
        <Banner tone="neutral" className="mt-4">
          This AWOL is archived. It is hidden from active Staff history and the
          active Ledger and kept for audit.
        </Banner>
      ) : null}

      <dl className="mt-8 grid gap-6 rounded-xl border border-border bg-surface p-6 shadow-sm sm:grid-cols-2">
        <StaffEventHeader
          absence={absence}
          eventName={eventName}
          eventDate={detail.eventDateSnapshot}
        />
        <Detail label="Event details">
          {eventLive && absence.event ? (
            <Link href={`/events/${absence.event.id}`} className="underline">
              {eventName}
            </Link>
          ) : (
            eventName
          )}
          <p className="mt-1 text-sm text-slate-600">
            {detail.eventReferenceSnapshot ?? "No reference"}
            {" · "}
            {formatLocalDateDisplay(detail.eventDateSnapshot)}
            {detail.eventStartTimeSnapshot
              ? ` · ${detail.eventStartTimeSnapshot}`
              : ""}
            {detail.eventEndTimeSnapshot
              ? `–${detail.eventEndTimeSnapshot}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {detail.venueNameSnapshot ?? "No venue recorded"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {detail.eventTypeSnapshot ?? "Unspecified"}
            {detail.eventSubtypeSnapshot
              ? ` / ${detail.eventSubtypeSnapshot}`
              : ""}
          </p>
        </Detail>
        <Detail label="Date recorded">
          {formatLocalDateDisplay(absence.reportedDate)}
          <span className="sr-only">
            {" "}
            {formatLocalDateIso(absence.reportedDate)}
          </span>
        </Detail>
        <InternalNotesDetail notes={absence.notes} />
        <MetaDetails absence={absence} archived={archived} />
      </dl>
      <HistoryCard absence={absence} />
    </div>
  );
}

function SicknessDetail({
  absence,
  flash,
}: {
  absence: AbsenceDetail;
  flash: { created?: string; updated?: string; archived?: string };
}) {
  const detail = absence.sickness!;
  const staffName = formatStaffName(absence.staff);
  const archived = absence.recordStatus === "ARCHIVED";
  const staffLive = !absence.staff.deletedAt;
  const updatedDistinct =
    absence.updatedAt.getTime() !== absence.createdAt.getTime();

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/ledger?view=sickness", label: "Ledger" },
          { label: "Sickness" },
        ]}
        title="Sickness"
        description={
          <>
            <AbsenceTypeBadge type={absence.type} />
            <span className="ml-2">
              {SICKNESS_INITIAL_STATUS_LABEL} · {staffName} ·{" "}
              {absence.staff.staffIdNumber}
            </span>
          </>
        }
        actions={
          !archived ? (
            <>
              <ButtonLink href={`/absence/${absence.id}/edit`}>
                Correct sickness report
              </ButtonLink>
              <ArchiveSicknessDialog
                absenceId={absence.id}
                staffName={`${staffName} (${absence.staff.staffIdNumber})`}
                expectedUpdatedAt={absence.updatedAt.toISOString()}
              />
            </>
          ) : undefined
        }
      />

      {flash.created === "1" ? (
        <Banner tone="success" className="mt-4">
          Sickness report recorded.
        </Banner>
      ) : null}
      {flash.updated === "1" ? (
        <Banner tone="success" className="mt-4">
          Sickness report corrected.
        </Banner>
      ) : null}
      {flash.archived === "1" ? (
        <Banner tone="success" className="mt-4">
          Sickness report archived.
        </Banner>
      ) : null}

      {archived ? (
        <Banner tone="neutral" className="mt-4">
          This sickness report is archived. It is hidden from active Staff
          history and kept for audit. Archiving does not record recovery or
          return to work.
        </Banner>
      ) : null}

      <dl className="mt-8 grid gap-6 rounded-xl border border-border bg-surface p-6 shadow-sm sm:grid-cols-2">
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
        <Detail label="Record status">{archived ? "Archived" : "Active"}</Detail>
        <Detail label="Date sickness reported">
          {formatLocalDateDisplay(absence.reportedDate)}
          <span className="sr-only">
            {" "}
            {formatLocalDateIso(absence.reportedDate)}
          </span>
        </Detail>
        <Detail label="First day sick from work">
          {formatLocalDateDisplay(detail.firstWorkingDaySick)}
          <span className="sr-only">
            {" "}
            {formatLocalDateIso(detail.firstWorkingDaySick)}
          </span>
        </Detail>
        <Detail label="Sickness started">
          {detail.sicknessStartedDate
            ? formatLocalDateDisplay(detail.sicknessStartedDate)
            : NO_SICKNESS_STARTED_RECORDED}
          {detail.sicknessStartedDate ? (
            <span className="sr-only">
              {" "}
              {formatLocalDateIso(detail.sicknessStartedDate)}
            </span>
          ) : null}
        </Detail>
        <Detail label="Issue summary" className="sm:col-span-2">
          <p className="whitespace-pre-wrap break-words">
            {formatIssueSummary(detail.issueSummary)}
          </p>
        </Detail>
        <MetaDetails
          absence={absence}
          archived={archived}
          showUpdated={updatedDistinct}
        />
      </dl>
      <HistoryCard absence={absence} />
    </div>
  );
}

function MetaDetails({
  absence,
  archived,
  showUpdated = true,
}: {
  absence: AbsenceDetail;
  archived: boolean;
  showUpdated?: boolean;
}) {
  return (
    <>
      <Detail label="Created">
        {absence.createdAt.toLocaleString("en-GB")} ·{" "}
        {actorName(absence.createdBy)}
      </Detail>
      {showUpdated ? (
        <Detail label="Last updated">
          {absence.updatedAt.toLocaleString("en-GB")} ·{" "}
          {actorName(absence.updatedBy)}
        </Detail>
      ) : null}
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
    </>
  );
}
