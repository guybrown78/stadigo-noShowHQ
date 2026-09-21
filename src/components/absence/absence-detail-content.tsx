import Link from "next/link";
import { ArchiveAwolDialog } from "@/components/absence/archive-awol-dialog";
import { ArchiveCancellationDialog } from "@/components/absence/archive-cancellation-dialog";
import { ArchiveSicknessDialog } from "@/components/absence/archive-sickness-dialog";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  ABSENCE_DETAIL_LABEL,
  ABSENCE_TYPE_LABELS,
  RECORD_STATUS_LABELS,
  absenceAllowsCorrectAndArchive,
  absenceCorrectActionLabel,
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
import type { AbsenceDetail } from "@/lib/absence/queries";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  formatLondonDateTime,
} from "@/lib/events/dates";
import {
  NO_SICKNESS_STARTED_RECORDED,
  SICKNESS_INITIAL_STATUS_LABEL,
} from "@/lib/absence/sickness";
import { formatStaffName } from "@/lib/staff/display";
import { EmploymentStatusBadge } from "@/components/staff/staff-status-badge";
import { cn } from "@/lib/cn";

export type AbsenceDetailFlash = {
  created?: string;
  updated?: string;
  archived?: string;
};

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
    <Detail label={ABSENCE_DETAIL_LABEL.internalNotes} className="sm:col-span-2">
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

function HistoryList({ absence }: { absence: AbsenceDetail }) {
  if (absence.history.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-600">No history recorded.</p>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-slate-100">
      {absence.history.map((entry) => {
        const changes = parseHistoryChanges(entry.changes);
        return (
          <li key={entry.id} className="py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">
              {historyActionLabel(entry.action, absence.type)}
            </p>
            <p className="mt-1 text-slate-600">
              {formatLondonDateTime(entry.createdAt)}
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
  );
}

function HistorySection({
  absence,
  compact,
}: {
  absence: AbsenceDetail;
  compact: boolean;
}) {
  const long = absence.history.length > 3;
  if (compact && long) {
    return (
      <details className="mt-6 rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
          History ({absence.history.length})
        </summary>
        <div className="border-t border-border px-4 pb-3">
          <HistoryList absence={absence} />
        </div>
      </details>
    );
  }
  return (
    <Card className={compact ? "mt-6 shadow-none" : "mt-8 shadow-none"}>
      <CardHeader title="History" />
      <CardBody>
        <HistoryList absence={absence} />
      </CardBody>
    </Card>
  );
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
      <Detail label={ABSENCE_DETAIL_LABEL.staff}>
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
      <Detail label={ABSENCE_DETAIL_LABEL.event}>
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
      <Detail label={ABSENCE_DETAIL_LABEL.created}>
        {formatLondonDateTime(absence.createdAt)} ·{" "}
        {actorName(absence.createdBy)}
      </Detail>
      {showUpdated ? (
        <Detail label={ABSENCE_DETAIL_LABEL.lastUpdated}>
          {formatLondonDateTime(absence.updatedAt)} ·{" "}
          {actorName(absence.updatedBy)}
        </Detail>
      ) : null}
      {archived ? (
        <Detail label={ABSENCE_DETAIL_LABEL.archived}>
          {absence.archivedAt
            ? formatLondonDateTime(absence.archivedAt)
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

function FlashBanners({
  type,
  flash,
  archived,
}: {
  type: AbsenceDetail["type"];
  flash: AbsenceDetailFlash;
  archived: boolean;
}) {
  const created =
    type === "SICKNESS"
      ? "Sickness report recorded."
      : type === "AWOL"
        ? "AWOL recorded."
        : "Cancellation recorded.";
  const updated =
    type === "SICKNESS"
      ? "Sickness report corrected."
      : type === "AWOL"
        ? "AWOL corrected."
        : "Cancellation corrected.";
  const archivedFlash =
    type === "SICKNESS"
      ? "Sickness report archived."
      : type === "AWOL"
        ? "AWOL archived."
        : "Cancellation archived.";
  const archivedHint =
    type === "SICKNESS"
      ? "This sickness report is archived. It is hidden from active Staff history and kept for audit. Archiving does not record recovery or return to work."
      : type === "AWOL"
        ? "This AWOL is archived. It is hidden from active Staff history and the active Ledger and kept for audit."
        : "This cancellation is archived. It is hidden from active operational views and kept for audit.";

  return (
    <>
      {flash.created === "1" ? (
        <Banner tone="success" className="mt-4">
          {created}
        </Banner>
      ) : null}
      {flash.updated === "1" ? (
        <Banner tone="success" className="mt-4">
          {updated}
        </Banner>
      ) : null}
      {flash.archived === "1" ? (
        <Banner tone="success" className="mt-4">
          {archivedFlash}
        </Banner>
      ) : null}
      {archived ? (
        <Banner tone="neutral" className="mt-4">
          {archivedHint}
        </Banner>
      ) : null}
    </>
  );
}

function AbsenceActions({
  absence,
  archiveReturnTo,
  compact = false,
}: {
  absence: AbsenceDetail;
  archiveReturnTo?: string;
  compact?: boolean;
}) {
  if (!absenceAllowsCorrectAndArchive(absence.recordStatus)) {
    return null;
  }
  const staffName = `${formatStaffName(absence.staff)} (${absence.staff.staffIdNumber})`;
  const size = compact ? "sm" : "md";
  if (absence.type === "AWOL" && absence.awol) {
    return (
      <>
        <ButtonLink href={`/absence/${absence.id}/edit`} size={size}>
          {absenceCorrectActionLabel(absence.type)}
        </ButtonLink>
        <ArchiveAwolDialog
          absenceId={absence.id}
          staffName={staffName}
          eventName={absence.awol.eventNameSnapshot}
          expectedUpdatedAt={absence.updatedAt.toISOString()}
          returnTo={archiveReturnTo}
        />
      </>
    );
  }
  if (absence.type === "SICKNESS") {
    return (
      <>
        <ButtonLink href={`/absence/${absence.id}/edit`} size={size}>
          {absenceCorrectActionLabel(absence.type)}
        </ButtonLink>
        <ArchiveSicknessDialog
          absenceId={absence.id}
          staffName={staffName}
          expectedUpdatedAt={absence.updatedAt.toISOString()}
          returnTo={archiveReturnTo}
        />
      </>
    );
  }
  return (
    <>
      <ButtonLink href={`/absence/${absence.id}/edit`} size={size}>
        {absenceCorrectActionLabel(absence.type)}
      </ButtonLink>
      <ArchiveCancellationDialog
        absenceId={absence.id}
        staffName={staffName}
        eventName={absence.cancellation?.eventNameSnapshot ?? ""}
        returnTo={archiveReturnTo}
      />
    </>
  );
}

function CancellationFields({ absence }: { absence: AbsenceDetail }) {
  const detail = absence.cancellation!;
  const archived = absence.recordStatus === "ARCHIVED";
  return (
    <dl className="grid gap-6 sm:grid-cols-2">
      <StaffEventHeader
        absence={absence}
        eventName={detail.eventNameSnapshot}
        eventDate={detail.eventDateSnapshot}
      />
      <Detail label={ABSENCE_DETAIL_LABEL.venue}>
        {detail.venueNameSnapshot ?? "No venue recorded"}
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.reported}>
        {formatLocalDateDisplay(absence.reportedDate)}
        <span className="sr-only">
          {" "}
          {formatLocalDateIso(absence.reportedDate)}
        </span>
        {absence.reportedTime ? ` · ${absence.reportedTime}` : ""}
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.noticeGiven}>
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
        <dt className="text-sm font-medium text-slate-500">
          {ABSENCE_DETAIL_LABEL.reason}
        </dt>
        <dd className="mt-1 whitespace-pre-wrap text-slate-900">
          {absence.reason}
        </dd>
      </div>
      <InternalNotesDetail notes={absence.notes} />
      <MetaDetails absence={absence} archived={archived} />
    </dl>
  );
}

function AwolFields({ absence }: { absence: AbsenceDetail }) {
  const detail = absence.awol!;
  const archived = absence.recordStatus === "ARCHIVED";
  const eventLive = Boolean(absence.event && !absence.event.deletedAt);
  const eventName = detail.eventNameSnapshot;
  return (
    <dl className="grid gap-6 sm:grid-cols-2">
      <StaffEventHeader
        absence={absence}
        eventName={eventName}
        eventDate={detail.eventDateSnapshot}
      />
      <Detail label={ABSENCE_DETAIL_LABEL.eventDetails}>
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
      <Detail label={ABSENCE_DETAIL_LABEL.dateRecorded}>
        {formatLocalDateDisplay(absence.reportedDate)}
        <span className="sr-only">
          {" "}
          {formatLocalDateIso(absence.reportedDate)}
        </span>
      </Detail>
      <InternalNotesDetail notes={absence.notes} />
      <MetaDetails absence={absence} archived={archived} />
    </dl>
  );
}

function SicknessFields({ absence }: { absence: AbsenceDetail }) {
  const detail = absence.sickness!;
  const archived = absence.recordStatus === "ARCHIVED";
  const staffLive = !absence.staff.deletedAt;
  const staffName = formatStaffName(absence.staff);
  const updatedDistinct =
    absence.updatedAt.getTime() !== absence.createdAt.getTime();
  return (
    <dl className="grid gap-6 sm:grid-cols-2">
      <Detail label={ABSENCE_DETAIL_LABEL.staff}>
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
      <Detail label={ABSENCE_DETAIL_LABEL.recordStatus}>
        {RECORD_STATUS_LABELS[absence.recordStatus]}
        {!archived ? (
          <p className="mt-1 text-sm text-slate-600">
            Active means this record is in operational views. It does not mean
            the staff member is still sick.
          </p>
        ) : null}
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.dateSicknessReported}>
        {formatLocalDateDisplay(absence.reportedDate)}
        <span className="sr-only">
          {" "}
          {formatLocalDateIso(absence.reportedDate)}
        </span>
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.firstDaySick}>
        {formatLocalDateDisplay(detail.firstWorkingDaySick)}
        <span className="sr-only">
          {" "}
          {formatLocalDateIso(detail.firstWorkingDaySick)}
        </span>
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.sicknessStarted}>
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
      <Detail label={ABSENCE_DETAIL_LABEL.issueSummary} className="sm:col-span-2">
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
  );
}

function TypeFields({ absence }: { absence: AbsenceDetail }) {
  if (absence.type === "AWOL" && absence.awol) {
    return <AwolFields absence={absence} />;
  }
  if (absence.type === "SICKNESS" && absence.sickness) {
    return <SicknessFields absence={absence} />;
  }
  return <CancellationFields absence={absence} />;
}

function DrawerHeader({
  absence,
  titleId,
  archiveReturnTo,
}: {
  absence: AbsenceDetail;
  titleId: string;
  archiveReturnTo?: string;
}) {
  const staffName = formatStaffName(absence.staff);
  const heading =
    absence.type === "SICKNESS"
      ? SICKNESS_INITIAL_STATUS_LABEL
      : ABSENCE_TYPE_LABELS[absence.type];
  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <AbsenceTypeBadge type={absence.type} />
        <span className="text-sm text-slate-700">
          {RECORD_STATUS_LABELS[absence.recordStatus]}
        </span>
      </div>
      <h2 id={titleId} className="mt-2 text-lg font-semibold text-slate-900">
        {heading}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {staffName} · {absence.staff.staffIdNumber}
      </p>
      {absenceAllowsCorrectAndArchive(absence.recordStatus) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <AbsenceActions
            absence={absence}
            archiveReturnTo={archiveReturnTo}
            compact
          />
        </div>
      ) : null}
    </header>
  );
}

export function AbsenceDetailContent({
  absence,
  flash = {},
  layout,
  titleId,
  archiveReturnTo,
}: {
  absence: AbsenceDetail;
  flash?: AbsenceDetailFlash;
  layout: "page" | "drawer";
  titleId?: string;
  archiveReturnTo?: string;
}) {
  const archived = absence.recordStatus === "ARCHIVED";
  const staffName = formatStaffName(absence.staff);
  const compact = layout === "drawer";

  if (layout === "drawer") {
    return (
      <div>
        <DrawerHeader
          absence={absence}
          titleId={titleId ?? "absence-detail-title"}
          archiveReturnTo={archiveReturnTo}
        />
        <FlashBanners type={absence.type} flash={flash} archived={archived} />
        <div className="mt-4">
          <TypeFields absence={absence} />
        </div>
        <HistorySection absence={absence} compact />
      </div>
    );
  }

  const eventName =
    absence.cancellation?.eventNameSnapshot ??
    absence.awol?.eventNameSnapshot ??
    "";
  const eventDate =
    absence.cancellation?.eventDateSnapshot ??
    absence.awol?.eventDateSnapshot;
  const description =
    absence.type === "SICKNESS" ? (
      <>
        <AbsenceTypeBadge type={absence.type} />
        <span className="ml-2">
          {SICKNESS_INITIAL_STATUS_LABEL} · {staffName} ·{" "}
          {absence.staff.staffIdNumber}
        </span>
      </>
    ) : absence.type === "AWOL" ? (
      <>
        <AbsenceTypeBadge type={absence.type} />
        <span className="ml-2">
          Did not attend with no prior notice · {staffName} · {eventName}
          {eventDate ? ` · ${formatLocalDateDisplay(eventDate)}` : ""}
        </span>
      </>
    ) : (
      <>
        <AbsenceTypeBadge type={absence.type} />
        <span className="ml-2">
          {staffName} · {eventName}
          {eventDate ? ` · ${formatLocalDateDisplay(eventDate)}` : ""}
        </span>
      </>
    );
  const ledgerView =
    absence.type === "AWOL"
      ? "awol"
      : absence.type === "SICKNESS"
        ? "sickness"
        : "cancellations";
  const title =
    absence.type === "AWOL"
      ? "AWOL"
      : absence.type === "SICKNESS"
        ? "Sickness"
        : "Cancellation";

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: `/ledger?view=${ledgerView}`, label: "Ledger" },
          { label: title },
        ]}
        title={title}
        description={description}
        actions={
          absenceAllowsCorrectAndArchive(absence.recordStatus) ? (
            <AbsenceActions
              absence={absence}
              archiveReturnTo={archiveReturnTo}
            />
          ) : undefined
        }
      />
      <FlashBanners type={absence.type} flash={flash} archived={archived} />
      <div className="mt-8 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <TypeFields absence={absence} />
      </div>
      <HistorySection absence={absence} compact={compact} />
    </div>
  );
}
