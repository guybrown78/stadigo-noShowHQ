import { AddFollowUpDialog } from "@/components/absence/follow-up-dialogs";
import { ReturnToWorkDialog } from "@/components/absence/return-to-work-dialogs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import { followUpContextLines } from "@/lib/absence/follow-up";
import type { AbsenceDetail } from "@/lib/absence/queries";
import {
  RETURN_TO_WORK_SECTION_DESCRIPTION,
  RETURN_TO_WORK_STATUS_LABELS,
  returnToWorkDateApplies,
} from "@/lib/absence/return-to-work";
import { sicknessEpisodeStateLabel } from "@/lib/absence/sickness";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  formatLondonDateTime,
} from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export function ReturnToWorkSection({
  absence,
  todayIso,
  followUpReturnTo,
  returnToWorkReturnTo,
  compact = false,
}: {
  absence: AbsenceDetail;
  todayIso?: string;
  followUpReturnTo?: string;
  returnToWorkReturnTo?: string;
  compact?: boolean;
}) {
  if (absence.type !== "SICKNESS" || !absence.sickness) {
    return null;
  }

  const canMutate = absence.recordStatus === "ACTIVE";
  const record = absence.returnToWork;
  const status = record?.status ?? "NOT_RECORDED";
  const completedIso =
    record?.completedOn && returnToWorkDateApplies(status)
      ? formatLocalDateIso(record.completedOn)
      : "";
  const staffName = formatStaffName(absence.staff);
  const context = followUpContextLines(
    {
      type: absence.type,
      reportedDate: absence.reportedDate,
      cancellation: absence.cancellation,
      awol: absence.awol,
      sickness: {
        firstWorkingDaySick: absence.sickness.firstWorkingDaySick,
        episodeState: absence.sickness.episodeState,
      },
    },
    sicknessEpisodeStateLabel,
  );

  return (
    <Card className={compact ? "mt-6 shadow-none" : "mt-8 shadow-none"}>
      <CardHeader
        title="Return to work"
        description={RETURN_TO_WORK_SECTION_DESCRIPTION}
        action={
          canMutate ? (
            <AddFollowUpDialog
              absenceId={absence.id}
              staffName={staffName}
              staffIdNumber={absence.staff.staffIdNumber}
              typeLabel={ABSENCE_TYPE_LABELS.SICKNESS}
              context={context}
              returnTo={followUpReturnTo}
            />
          ) : undefined
        }
      />
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-slate-500">Status</h3>
            <p className="mt-1 text-sm text-slate-900">
              {RETURN_TO_WORK_STATUS_LABELS[status]}
            </p>
            {completedIso && record?.completedOn ? (
              <p className="mt-2 text-sm text-slate-700">
                Completion date {formatLocalDateDisplay(record.completedOn)}
              </p>
            ) : null}
            {record?.note ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                {record.note}
              </p>
            ) : null}
            {record ? (
              <p className="mt-2 text-sm text-slate-600">
                Updated {formatLondonDateTime(record.updatedAt)} ·{" "}
                {formatStaffName(record.updatedBy)}
              </p>
            ) : null}
          </div>
          {canMutate ? (
            <ReturnToWorkDialog
              absenceId={absence.id}
              status={status}
              completedOn={completedIso}
              note={record?.note ?? ""}
              expectedUpdatedAt={record ? record.updatedAt.toISOString() : null}
              todayIso={todayIso}
              returnTo={returnToWorkReturnTo}
            />
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
