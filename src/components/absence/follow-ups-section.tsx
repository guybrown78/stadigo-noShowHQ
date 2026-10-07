import {
  AddFollowUpDialog,
  CancelFollowUpDialog,
  CompleteFollowUpDialog,
  EditFollowUpDialog,
} from "@/components/absence/follow-up-dialogs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import {
  FOLLOW_UP_DUE_LABELS,
  FOLLOW_UP_PROVENANCE_LABELS,
  FOLLOW_UP_PURPOSE_LABELS,
  FOLLOW_UP_STATE_LABELS,
  followUpContextLines,
  followUpDueState,
  followUpMutationsAllowed,
  sortFollowUpsForDetail,
} from "@/lib/absence/follow-up";
import type { AbsenceDetail } from "@/lib/absence/queries";
import { sicknessEpisodeStateLabel } from "@/lib/absence/sickness";
import { formatLocalDateDisplay, formatLocalDateIso, formatLondonDateTime } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export function FollowUpsSection({
  absence,
  todayIso,
  returnTo,
  compact = false,
}: {
  absence: AbsenceDetail;
  todayIso?: string;
  returnTo?: string;
  compact?: boolean;
}) {
  const staffName = formatStaffName(absence.staff);
  const typeLabel = ABSENCE_TYPE_LABELS[absence.type];
  const context = followUpContextLines(
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
  const items = sortFollowUpsForDetail(
    absence.followUps.map((followUp) => ({
      ...followUp,
      dueDateIso: formatLocalDateIso(followUp.dueDate),
    })),
    todayIso ?? "9999-12-31",
  );
  const openCount = items.filter((item) => item.state === "OPEN").length;
  const canMutate = followUpMutationsAllowed(absence.recordStatus);
  const dialogContext = {
    staffName,
    staffIdNumber: absence.staff.staffIdNumber,
    typeLabel,
    context,
    returnTo,
  };

  return (
    <Card className={compact ? "mt-6 shadow-none" : "mt-8 shadow-none"}>
      <CardHeader
        title="Follow-ups"
        description={
          openCount === 1 ? "1 open follow-up" : `${openCount} open follow-ups`
        }
        action={
          canMutate ? (
            <AddFollowUpDialog absenceId={absence.id} {...dialogContext} />
          ) : undefined
        }
      />
      <CardBody>
        {items.length === 0 ? (
          <p className="text-sm text-slate-600">No follow-ups recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((followUp) => {
              const dueState = todayIso
                ? followUpDueState(followUp.dueDateIso, todayIso, followUp.state)
                : null;
              const provenance = followUp.provenance ?? "MANUAL";
              return (
                <li key={followUp.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">
                      {FOLLOW_UP_STATE_LABELS[followUp.state]}
                    </span>
                    <span className="text-slate-700">
                      {FOLLOW_UP_PROVENANCE_LABELS[provenance]}
                    </span>
                    {followUp.purpose ? (
                      <span className="text-slate-700">
                        {FOLLOW_UP_PURPOSE_LABELS[followUp.purpose]}
                      </span>
                    ) : null}
                    <span className="text-slate-700">
                      Due {formatLocalDateDisplay(followUp.dueDate)}
                    </span>
                    {dueState ? (
                      <span className="text-slate-700">
                        {FOLLOW_UP_DUE_LABELS[dueState]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                    {followUp.details}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Added {formatLondonDateTime(followUp.createdAt)} ·{" "}
                    {followUp.createdBy
                      ? formatStaffName(followUp.createdBy)
                      : "NoShowHQ"}
                  </p>
                  {followUp.state === "COMPLETED" && followUp.completionNotes ? (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-slate-700">Outcome</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                        {followUp.completionNotes}
                      </p>
                      {followUp.completedAt ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Completed {formatLondonDateTime(followUp.completedAt)}
                          {followUp.completedBy
                            ? ` · ${formatStaffName(followUp.completedBy)}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {followUp.state === "CANCELLED" && followUp.cancellationReason ? (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-slate-700">
                        Cancellation reason
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                        {followUp.cancellationReason}
                      </p>
                      {followUp.cancelledAt ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Cancelled {formatLondonDateTime(followUp.cancelledAt)}
                          {followUp.cancelledBy
                            ? ` · ${formatStaffName(followUp.cancelledBy)}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {canMutate && followUp.state === "OPEN" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {provenance === "MANUAL" ? (
                        <EditFollowUpDialog
                          followUpId={followUp.id}
                          dueDate={followUp.dueDateIso}
                          details={followUp.details}
                          expectedUpdatedAt={followUp.updatedAt.toISOString()}
                          {...dialogContext}
                        />
                      ) : null}
                      <CompleteFollowUpDialog
                        followUpId={followUp.id}
                        details={followUp.details}
                        expectedUpdatedAt={followUp.updatedAt.toISOString()}
                        {...dialogContext}
                      />
                      <CancelFollowUpDialog
                        followUpId={followUp.id}
                        expectedUpdatedAt={followUp.updatedAt.toISOString()}
                        {...dialogContext}
                      />
                    </div>
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
