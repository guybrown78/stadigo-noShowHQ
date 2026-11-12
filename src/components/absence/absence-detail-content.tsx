import Link from "next/link";
import { ArchiveAwolDialog } from "@/components/absence/archive-awol-dialog";
import { ArchiveCancellationDialog } from "@/components/absence/archive-cancellation-dialog";
import { ArchiveSicknessDialog } from "@/components/absence/archive-sickness-dialog";
import { AbsenceNextPanel } from "@/components/absence/absence-next-panel";
import { AddFitNoteDialog, SelfCertificationDialog } from "@/components/absence/evidence-dialogs";
import { EvidenceSection } from "@/components/absence/evidence-section";
import { CompleteFollowUpDialog } from "@/components/absence/follow-up-dialogs";
import { ReturnToWorkSection } from "@/components/absence/return-to-work-section";
import { ReturnToWorkDialog } from "@/components/absence/return-to-work-dialogs";
import { FollowUpsSection } from "@/components/absence/follow-ups-section";
import { MissedShiftsSection } from "@/components/absence/missed-shifts-section";
import {
  AbsenceRecord,
  LogNewAbsenceLink,
} from "@/components/absence/log-new-absence-link";
import { PayPeriodAssignment } from "@/components/absence/pay-period-assignment";
import type { PayPeriodChoice } from "@/components/absence/pay-period-field";
import { UnauthorisedCancellationBox } from "@/components/absence/unauthorised-cancellation-box";
import { UpdateSicknessEpisodeDialog } from "@/components/absence/update-sickness-episode-dialog";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import { Banner } from "@/components/ui/banner";
import { ButtonLink, type ButtonVariant } from "@/components/ui/button";
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
import { buildNextWork, type NextWork } from "@/lib/absence/next-work";
import { followUpContextLines } from "@/lib/absence/follow-up";
import { returnToWorkDateApplies } from "@/lib/absence/return-to-work";
import type { AbsenceDetail } from "@/lib/absence/queries";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  formatLondonDateTime,
} from "@/lib/events/dates";
import {
  formatCalendarDaySpan,
  inclusiveCalendarDaySpan,
  NO_SICKNESS_STARTED_RECORDED,
  SICKNESS_CALENDAR_DAY_SPAN_HINT,
  sicknessEpisodeStateLabel,
} from "@/lib/absence/sickness";
import { EVENT_STATUS_LABELS } from "@/lib/events/display";
import { formatStaffName } from "@/lib/staff/display";
import { EmploymentStatusBadge } from "@/components/staff/staff-status-badge";
import { cn } from "@/lib/cn";

export type AbsenceDetailFlash = {
  created?: string;
  updated?: string;
  archived?: string;
  episodeUpdated?: string;
  followUp?: string;
  evidence?: string;
  returnToWork?: string;
  shifts?: string;
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
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className={cn("mt-1 min-w-0 text-foreground", valueClassName)}>
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
      <p className="mt-2 text-sm text-muted">No history recorded.</p>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-slate-100">
      {absence.history.map((entry) => {
        const changes = parseHistoryChanges(entry.changes);
        return (
          <li key={entry.id} className="py-3 text-sm text-foreground">
            <p className="font-medium text-foreground">
              {historyActionLabel(entry.action, absence.type)}
            </p>
            <p className="mt-1 text-muted">
              {formatLondonDateTime(entry.createdAt)}
              {` · ${entry.systemActor ? "NoShowHQ" : actorName(entry.actedBy)}`}
            </p>
            {entry.reason ? (
              <p className="mt-1 text-muted">{entry.reason}</p>
            ) : null}
            {changes.length > 0 ? (
              <ul className="mt-2 space-y-1 break-words whitespace-pre-wrap text-muted">
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
  inset = false,
}: {
  absence: AbsenceDetail;
  compact: boolean;
  inset?: boolean;
}) {
  const long = absence.history.length > 3;
  if (compact && long) {
    return (
      <details className="mt-6 rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          History ({absence.history.length})
        </summary>
        <div className="border-t border-border px-4 pb-3">
          <HistoryList absence={absence} />
        </div>
      </details>
    );
  }
  return (
    <Card
      className={
        inset ? "shadow-none" : compact ? "mt-6 shadow-none" : "mt-8 shadow-none"
      }
    >
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
        <span className="text-muted">
          {" "}
          · {absence.staff.staffIdNumber}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">
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
        <p className="mt-1 text-sm text-muted">
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
            <p className="mt-1 text-sm text-muted">
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
      {flash.episodeUpdated === "1" ? (
        <Banner tone="success" className="mt-4">
          Sickness status updated.
        </Banner>
      ) : null}
      {flash.followUp === "1" ? (
        <Banner tone="success" className="mt-4">
          Follow-up saved.
        </Banner>
      ) : null}
      {flash.evidence === "1" ? (
        <Banner tone="success" className="mt-4">
          Evidence saved.
        </Banner>
      ) : null}
      {flash.returnToWork === "1" ? (
        <Banner tone="success" className="mt-4">
          Return to work saved.
        </Banner>
      ) : null}
      {flash.shifts === "1" ? (
        <Banner tone="success" className="mt-4">
          Missed shifts updated.
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
  episodeUpdateReturnTo,
  timeZone,
  todayIso,
  compact = false,
  omitEpisode = false,
  episodeVariant = "ghost",
}: {
  absence: AbsenceDetail;
  archiveReturnTo?: string;
  episodeUpdateReturnTo?: string;
  timeZone?: string;
  todayIso?: string;
  compact?: boolean;
  omitEpisode?: boolean;
  episodeVariant?: ButtonVariant;
}) {
  if (!absenceAllowsCorrectAndArchive(absence.recordStatus)) {
    return null;
  }
  const staffName = `${formatStaffName(absence.staff)} (${absence.staff.staffIdNumber})`;
  const size = compact ? "sm" : "md";
  if (absence.type === "AWOL" && absence.awol) {
    return (
      <>
        <ButtonLink href={`/absence/${absence.id}/edit`} size={size} variant="ghost">
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
  if (absence.type === "SICKNESS" && absence.sickness && timeZone && todayIso) {
    return (
      <>
        {omitEpisode ? null : (
          <UpdateSicknessEpisodeDialog
            absenceId={absence.id}
            staffName={staffName}
            reportedDateDisplay={formatLocalDateDisplay(absence.reportedDate)}
            firstWorkingDayDisplay={formatLocalDateDisplay(
              absence.sickness.firstWorkingDaySick,
            )}
            firstWorkingDaySick={formatLocalDateIso(
              absence.sickness.firstWorkingDaySick,
            )}
            sicknessStartedDate={
              absence.sickness.sicknessStartedDate
                ? formatLocalDateIso(absence.sickness.sicknessStartedDate)
                : ""
            }
            currentEpisodeState={absence.sickness.episodeState}
            currentSicknessEndedDate={
              absence.sickness.sicknessEndedDate
                ? formatLocalDateIso(absence.sickness.sicknessEndedDate)
                : ""
            }
            expectedUpdatedAt={absence.updatedAt.toISOString()}
            todayIso={todayIso}
            timeZone={timeZone}
            returnTo={episodeUpdateReturnTo}
            triggerVariant={episodeVariant}
          />
        )}
        <ButtonLink href={`/absence/${absence.id}/edit`} size={size} variant="ghost">
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
  if (absence.type === "SICKNESS") {
    return (
      <>
        <ButtonLink href={`/absence/${absence.id}/edit`} size={size} variant="ghost">
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
      <ButtonLink href={`/absence/${absence.id}/edit`} size={size} variant="ghost">
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

function EventOutcomeNote({ event }: { event: AbsenceDetail["event"] }) {
  if (!event || event.deletedAt) {
    return (
      <p className="mt-1 text-sm font-medium text-foreground">
        This event was removed. The date, venue, and this absence stay on the
        record.
      </p>
    );
  }
  if (event.status === "CANCELLED" || event.status === "POSTPONED") {
    return (
      <p className="mt-1 text-sm font-medium text-foreground">
        This event was {EVENT_STATUS_LABELS[event.status].toLowerCase()}. The
        date, venue, and this absence stay on the record.
      </p>
    );
  }
  return null;
}

function CancellationFields({
  absence,
  onUnauthorisedSaved,
}: {
  absence: AbsenceDetail;
  onUnauthorisedSaved?: () => void;
}) {
  const detail = absence.cancellation!;
  const archived = absence.recordStatus === "ARCHIVED";
  return (
    <div>
      <UnauthorisedCancellationBox
        absenceId={absence.id}
        unauthorised={detail.unauthorised}
        archived={archived}
        onSaved={onUnauthorisedSaved}
      />
      <dl className="mt-6 grid gap-6 sm:grid-cols-2">
      <StaffEventHeader
        absence={absence}
        eventName={detail.eventNameSnapshot}
        eventDate={detail.eventDateSnapshot}
      />
      <Detail label={ABSENCE_DETAIL_LABEL.venue}>
        {detail.venueNameSnapshot ?? "No venue recorded"}
        <EventOutcomeNote event={absence.event} />
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
        <p className="mt-1 text-sm text-muted">
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
        <dt className="text-sm font-medium text-muted">
          {ABSENCE_DETAIL_LABEL.reason}
        </dt>
        <dd className="mt-1 whitespace-pre-wrap text-foreground">
          {absence.reason}
        </dd>
      </div>
      <InternalNotesDetail notes={absence.notes} />
      <MetaDetails absence={absence} archived={archived} />
      </dl>
    </div>
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
        <p className="mt-1 text-sm text-muted">
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
        <p className="mt-1 text-sm text-muted">
          {detail.venueNameSnapshot ?? "No venue recorded"}
        </p>
        <EventOutcomeNote event={absence.event} />
        <p className="mt-1 text-sm text-muted">
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
  const ended = detail.episodeState === "ENDED" && detail.sicknessEndedDate;
  const calendarSpan = ended
    ? inclusiveCalendarDaySpan(
        formatLocalDateIso(detail.firstWorkingDaySick),
        formatLocalDateIso(detail.sicknessEndedDate!),
      )
    : null;
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
        <span className="text-muted">
          {" "}
          · {absence.staff.staffIdNumber}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">
            {absence.staff.roleTitle}
          </span>
          <EmploymentStatusBadge status={absence.staff.employmentStatus} />
        </div>
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.recordStatus}>
        {RECORD_STATUS_LABELS[absence.recordStatus]}
        {!archived ? (
          <p className="mt-1 text-sm text-muted">
            Active means this record is in operational views. It does not mean
            the staff member is still sick.
          </p>
        ) : null}
      </Detail>
      <Detail label={ABSENCE_DETAIL_LABEL.episodeStatus}>
        {sicknessEpisodeStateLabel(detail.episodeState)}
        {detail.episodeState === "ENDED" ? (
          <p className="mt-1 text-sm text-muted">
            Ended means an end date was recorded. It does not mean recovered,
            fit for work, returned to work or archived.
          </p>
        ) : null}
        {detail.episodeState === "ONGOING" ? (
          <p className="mt-1 text-sm text-muted">
            Ongoing means the organisation has confirmed that no end date has
            been recorded yet.
          </p>
        ) : null}
        {detail.episodeState === "NOT_CONFIRMED" ? (
          <p className="mt-1 text-sm text-muted">
            Sickness status not yet confirmed means no end date and no ongoing
            confirmation has been recorded.
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
      {ended ? (
        <Detail label={ABSENCE_DETAIL_LABEL.sicknessEnded}>
          {formatLocalDateDisplay(detail.sicknessEndedDate!)}
          <span className="sr-only">
            {" "}
            {formatLocalDateIso(detail.sicknessEndedDate!)}
          </span>
        </Detail>
      ) : null}
      {ended && calendarSpan != null ? (
        <Detail label={ABSENCE_DETAIL_LABEL.calendarDaySpan}>
          {formatCalendarDaySpan(calendarSpan)}
          <p className="mt-1 text-sm text-muted">
            {SICKNESS_CALENDAR_DAY_SPAN_HINT}
          </p>
        </Detail>
      ) : null}
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

function TypeFields({
  absence,
  onUnauthorisedSaved,
}: {
  absence: AbsenceDetail;
  onUnauthorisedSaved?: () => void;
}) {
  if (absence.type === "AWOL" && absence.awol) {
    return <AwolFields absence={absence} />;
  }
  if (absence.type === "SICKNESS" && absence.sickness) {
    return <SicknessFields absence={absence} />;
  }
  return (
    <CancellationFields
      absence={absence}
      onUnauthorisedSaved={onUnauthorisedSaved}
    />
  );
}

function recordFollowUpContext(absence: AbsenceDetail): string[] {
  return followUpContextLines(
    {
      type: absence.type,
      reportedDate: absence.reportedDate,
      cancellation: absence.cancellation,
      awol: absence.awol,
      sickness: absence.sickness
        ? {
            firstWorkingDaySick: absence.sickness.firstWorkingDaySick,
            episodeState: absence.sickness.episodeState,
          }
        : null,
    },
    sicknessEpisodeStateLabel,
  );
}

function NextWorkAction({
  absence,
  work,
  layout,
  timeZone,
  todayIso,
  payPeriods,
  episodeUpdateReturnTo,
  followUpReturnTo,
  evidenceReturnTo,
  returnToWorkReturnTo,
}: {
  absence: AbsenceDetail;
  work: NextWork;
  layout: "page" | "drawer";
  timeZone?: string;
  todayIso?: string;
  payPeriods?: PayPeriodChoice[];
  episodeUpdateReturnTo?: string;
  followUpReturnTo?: string;
  evidenceReturnTo?: string;
  returnToWorkReturnTo?: string;
}) {
  const next = work.next;
  if (!next?.actionable) {
    return null;
  }
  if (next.kind === "confirm-episode" && absence.sickness && timeZone && todayIso) {
    return (
      <UpdateSicknessEpisodeDialog
        absenceId={absence.id}
        staffName={`${formatStaffName(absence.staff)} (${absence.staff.staffIdNumber})`}
        reportedDateDisplay={formatLocalDateDisplay(absence.reportedDate)}
        firstWorkingDayDisplay={formatLocalDateDisplay(
          absence.sickness.firstWorkingDaySick,
        )}
        firstWorkingDaySick={formatLocalDateIso(absence.sickness.firstWorkingDaySick)}
        sicknessStartedDate={
          absence.sickness.sicknessStartedDate
            ? formatLocalDateIso(absence.sickness.sicknessStartedDate)
            : ""
        }
        currentEpisodeState={absence.sickness.episodeState}
        currentSicknessEndedDate={
          absence.sickness.sicknessEndedDate
            ? formatLocalDateIso(absence.sickness.sicknessEndedDate)
            : ""
        }
        expectedUpdatedAt={absence.updatedAt.toISOString()}
        todayIso={todayIso}
        timeZone={timeZone}
        returnTo={episodeUpdateReturnTo}
        triggerVariant="primary"
      />
    );
  }
  if (next.kind === "overdue-follow-up" && next.followUpId) {
    const followUp = absence.followUps.find((item) => item.id === next.followUpId);
    if (!followUp) {
      return null;
    }
    return (
      <CompleteFollowUpDialog
        followUpId={followUp.id}
        details={followUp.details}
        expectedUpdatedAt={followUp.updatedAt.toISOString()}
        staffName={formatStaffName(absence.staff)}
        staffIdNumber={absence.staff.staffIdNumber}
        typeLabel={ABSENCE_TYPE_LABELS[absence.type]}
        context={recordFollowUpContext(absence)}
        returnTo={followUpReturnTo}
        triggerVariant="primary"
      />
    );
  }
  if (next.kind === "fit-note-due") {
    return (
      <AddFitNoteDialog
        absenceId={absence.id}
        todayIso={todayIso}
        returnTo={evidenceReturnTo}
        triggerVariant="primary"
      />
    );
  }
  if (next.kind === "self-certification" && absence.type === "SICKNESS") {
    return (
      <SelfCertificationDialog
        absenceId={absence.id}
        status={absence.selfCertification?.status ?? "NOT_RECORDED"}
        expectedUpdatedAt={
          absence.selfCertification
            ? absence.selfCertification.updatedAt.toISOString()
            : null
        }
        returnTo={evidenceReturnTo}
        triggerVariant="primary"
        presentation={layout === "page" ? "inline" : "dialog"}
      />
    );
  }
  if (next.kind === "return-to-work" && absence.sickness) {
    const record = absence.returnToWork;
    const status = record?.status ?? "NOT_RECORDED";
    return (
      <ReturnToWorkDialog
        absenceId={absence.id}
        status={status}
        completedOn={
          record?.completedOn && returnToWorkDateApplies(status)
            ? formatLocalDateIso(record.completedOn)
            : ""
        }
        note={record?.note ?? ""}
        expectedUpdatedAt={record ? record.updatedAt.toISOString() : null}
        todayIso={todayIso}
        returnTo={returnToWorkReturnTo}
        triggerVariant="primary"
      />
    );
  }
  if (next.kind === "pay-period") {
    return (
      <PayPeriodAssignment
        absenceId={absence.id}
        current={absence.payPeriod}
        periods={payPeriods}
        submitVariant="primary"
        showCurrent={false}
        embedded
      />
    );
  }
  return null;
}

function FiledPayPeriod({
  absence,
  payPeriods,
}: {
  absence: AbsenceDetail;
  payPeriods?: PayPeriodChoice[];
}) {
  if (!absence.payPeriod) {
    return null;
  }
  return (
    <PayPeriodAssignment
      absenceId={absence.id}
      current={absence.payPeriod}
      periods={payPeriods}
      submitVariant="secondary"
    />
  );
}

function UnfiledPayPeriod({
  absence,
  payPeriods,
  work,
}: {
  absence: AbsenceDetail;
  payPeriods?: PayPeriodChoice[];
  work: NextWork;
}) {
  if (absence.payPeriod || work.next?.kind === "pay-period") {
    return null;
  }
  return (
    <PayPeriodAssignment
      absenceId={absence.id}
      current={absence.payPeriod}
      periods={payPeriods}
      submitVariant="secondary"
      showCurrent={false}
    />
  );
}

function RecordActions({
  absence,
  work,
  compact,
  archiveReturnTo,
  episodeUpdateReturnTo,
  timeZone,
  todayIso,
}: {
  absence: AbsenceDetail;
  work: NextWork;
  compact: boolean;
  archiveReturnTo?: string;
  episodeUpdateReturnTo?: string;
  timeZone?: string;
  todayIso?: string;
}) {
  if (!absenceAllowsCorrectAndArchive(absence.recordStatus)) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <AbsenceActions
        absence={absence}
        archiveReturnTo={archiveReturnTo}
        episodeUpdateReturnTo={episodeUpdateReturnTo}
        timeZone={timeZone}
        todayIso={todayIso}
        compact={compact}
        omitEpisode={work.next?.kind === "confirm-episode"}
      />
    </div>
  );
}

function DrawerHeader({
  absence,
  titleId,
}: {
  absence: AbsenceDetail;
  titleId: string;
}) {
  const staffName = formatStaffName(absence.staff);
  const heading =
    absence.type === "SICKNESS" && absence.sickness
      ? sicknessEpisodeStateLabel(absence.sickness.episodeState)
      : ABSENCE_TYPE_LABELS[absence.type];
  return (
    <header className="border-b border-border pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AbsenceTypeBadge type={absence.type} />
            <span className="text-sm text-foreground">
              {RECORD_STATUS_LABELS[absence.recordStatus]}
            </span>
          </div>
          <h2 id={titleId} className="mt-2 text-lg font-semibold text-foreground">
            {heading}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {staffName} · {absence.staff.staffIdNumber}
          </p>
        </div>
        <LogNewAbsenceLink size="sm" />
      </div>
    </header>
  );
}

export function AbsenceDetailContent({
  absence,
  flash = {},
  layout,
  titleId,
  archiveReturnTo,
  episodeUpdateReturnTo,
  followUpReturnTo,
  evidenceReturnTo,
  returnToWorkReturnTo,
  shiftsReturnTo,
  onUnauthorisedSaved,
  timeZone,
  todayIso,
  payPeriods,
}: {
  absence: AbsenceDetail;
  flash?: AbsenceDetailFlash;
  layout: "page" | "drawer";
  titleId?: string;
  archiveReturnTo?: string;
  episodeUpdateReturnTo?: string;
  followUpReturnTo?: string;
  evidenceReturnTo?: string;
  returnToWorkReturnTo?: string;
  shiftsReturnTo?: string;
  onUnauthorisedSaved?: () => void;
  timeZone?: string;
  todayIso?: string;
  payPeriods?: PayPeriodChoice[];
}) {
  const archived = absence.recordStatus === "ARCHIVED";
  const staffName = formatStaffName(absence.staff);
  const work = buildNextWork(absence, {
    todayIso,
    canConfirmEpisode: Boolean(timeZone && todayIso),
    canFilePayPeriod: (payPeriods?.length ?? 0) > 0,
  });
  const nextAction = (
    <NextWorkAction
      absence={absence}
      work={work}
      layout={layout}
      timeZone={timeZone}
      todayIso={todayIso}
      payPeriods={payPeriods}
      episodeUpdateReturnTo={episodeUpdateReturnTo}
      followUpReturnTo={followUpReturnTo}
      evidenceReturnTo={evidenceReturnTo}
      returnToWorkReturnTo={returnToWorkReturnTo}
    />
  );
  const workSections = (
    <>
      <MissedShiftsSection absence={absence} returnTo={shiftsReturnTo} />
      <EvidenceSection
        absence={absence}
        todayIso={todayIso}
        followUpReturnTo={followUpReturnTo}
        evidenceReturnTo={evidenceReturnTo}
        compact
        hideSelfCertification={work.next?.kind === "self-certification"}
        hideAddFitNote={work.next?.kind === "fit-note-due"}
      />
      <ReturnToWorkSection
        absence={absence}
        todayIso={todayIso}
        followUpReturnTo={followUpReturnTo}
        returnToWorkReturnTo={returnToWorkReturnTo}
        compact
        hideRecord={work.next?.kind === "return-to-work"}
      />
      <FollowUpsSection
        absence={absence}
        todayIso={todayIso}
        returnTo={followUpReturnTo}
        compact
        promotedFollowUpId={
          work.next?.kind === "overdue-follow-up" ? work.next.followUpId : undefined
        }
      />
    </>
  );

  if (layout === "drawer") {
    return (
      <AbsenceRecord>
      <div>
        <DrawerHeader
          absence={absence}
          titleId={titleId ?? "absence-detail-title"}
        />
        <FlashBanners type={absence.type} flash={flash} archived={archived} />
        <div className="mt-4">
          <AbsenceNextPanel work={work} action={nextAction} />
          <UnfiledPayPeriod absence={absence} payPeriods={payPeriods} work={work} />
          <RecordActions
            absence={absence}
            work={work}
            compact
            archiveReturnTo={archiveReturnTo}
            episodeUpdateReturnTo={episodeUpdateReturnTo}
            timeZone={timeZone}
            todayIso={todayIso}
          />
          <details className="mt-4 rounded-xl border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
              Record
            </summary>
            <div className="border-t border-border px-4 py-4">
              <FiledPayPeriod absence={absence} payPeriods={payPeriods} />
              <TypeFields
                absence={absence}
                onUnauthorisedSaved={onUnauthorisedSaved}
              />
            </div>
          </details>
        </div>
        {workSections}
        <HistorySection absence={absence} compact />
      </div>
      </AbsenceRecord>
    );
  }

  const eventName =
    absence.cancellation?.eventNameSnapshot ??
    absence.awol?.eventNameSnapshot ??
    "";
  const eventDate =
    absence.cancellation?.eventDateSnapshot ??
    absence.awol?.eventDateSnapshot;
  const sicknessHeading =
    absence.type === "SICKNESS" && absence.sickness
      ? sicknessEpisodeStateLabel(absence.sickness.episodeState)
      : null;
  const description =
    absence.type === "SICKNESS" ? (
      <>
        <AbsenceTypeBadge type={absence.type} />
        <span className="ml-2">
          {sicknessHeading} · {staffName} · {absence.staff.staffIdNumber}
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
    <AbsenceRecord>
    <div>
      <PageHeader
        breadcrumbs={[
          { href: `/ledger?view=${ledgerView}`, label: "Ledger" },
          { label: title },
        ]}
        title={title}
        description={description}
        actions={<LogNewAbsenceLink size="md" />}
      />
      <FlashBanners type={absence.type} flash={flash} archived={archived} />
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <div className="rounded-xl border border-border bg-surface p-6">
            <FiledPayPeriod absence={absence} payPeriods={payPeriods} />
            <TypeFields
              absence={absence}
              onUnauthorisedSaved={onUnauthorisedSaved}
            />
          </div>
          <HistorySection absence={absence} compact={false} inset />
        </div>
        <div className="order-1 lg:order-2">
          <AbsenceNextPanel work={work} action={nextAction} />
          <UnfiledPayPeriod absence={absence} payPeriods={payPeriods} work={work} />
          {workSections}
          <RecordActions
            absence={absence}
            work={work}
            compact={false}
            archiveReturnTo={archiveReturnTo}
            episodeUpdateReturnTo={episodeUpdateReturnTo}
            timeZone={timeZone}
            todayIso={todayIso}
          />
        </div>
      </div>
    </div>
    </AbsenceRecord>
  );
}
