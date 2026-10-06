import { AddFollowUpDialog } from "@/components/absence/follow-up-dialogs";
import {
  AddFitNoteDialog,
  EditFitNoteDialog,
  SelfCertificationDialog,
} from "@/components/absence/evidence-dialogs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ABSENCE_TYPE_LABELS } from "@/lib/absence/display";
import {
  EVIDENCE_SECTION_DESCRIPTION,
  FIT_NOTE_STATUS_LABELS,
  SELF_CERTIFICATION_STATUS_LABELS,
  fitNoteShowsReceivedDate,
  fitNoteShowsRequestedDate,
} from "@/lib/absence/evidence";
import { followUpContextLines } from "@/lib/absence/follow-up";
import type { AbsenceDetail } from "@/lib/absence/queries";
import { sicknessEpisodeStateLabel } from "@/lib/absence/sickness";
import {
  formatLocalDateDisplay,
  formatLocalDateIso,
  formatLondonDateTime,
} from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export function EvidenceSection({
  absence,
  todayIso,
  followUpReturnTo,
  evidenceReturnTo,
  compact = false,
}: {
  absence: AbsenceDetail;
  todayIso?: string;
  followUpReturnTo?: string;
  evidenceReturnTo?: string;
  compact?: boolean;
}) {
  if (absence.type !== "SICKNESS" || !absence.sickness) {
    return null;
  }

  const canMutate = absence.recordStatus === "ACTIVE";
  const selfCert = absence.selfCertification;
  const selfStatus = selfCert?.status ?? "NOT_RECORDED";
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
        title="Evidence"
        description={EVIDENCE_SECTION_DESCRIPTION}
        action={
          canMutate ? (
            <div className="flex flex-wrap gap-2">
              <AddFitNoteDialog
                absenceId={absence.id}
                todayIso={todayIso}
                returnTo={evidenceReturnTo}
              />
              <AddFollowUpDialog
                absenceId={absence.id}
                staffName={staffName}
                staffIdNumber={absence.staff.staffIdNumber}
                typeLabel={ABSENCE_TYPE_LABELS.SICKNESS}
                context={context}
                returnTo={followUpReturnTo}
              />
            </div>
          ) : undefined
        }
      />
      <CardBody>
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-slate-500">
                Self-certification
              </h3>
              <p className="mt-1 text-sm text-slate-900">
                {SELF_CERTIFICATION_STATUS_LABELS[selfStatus]}
              </p>
              {selfCert ? (
                <p className="mt-1 text-sm text-slate-600">
                  Updated {formatLondonDateTime(selfCert.updatedAt)} ·{" "}
                  {formatStaffName(selfCert.updatedBy)}
                </p>
              ) : null}
            </div>
            {canMutate ? (
              <SelfCertificationDialog
                absenceId={absence.id}
                status={selfStatus}
                expectedUpdatedAt={selfCert ? selfCert.updatedAt.toISOString() : null}
                returnTo={evidenceReturnTo}
              />
            ) : null}
          </div>
        </div>

        <h3 className="mt-6 text-sm font-medium text-slate-500">Fit notes</h3>
        {absence.fitNotes.length === 0 ? (
          <p className="mt-2 text-sm text-slate-900">Not recorded</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {absence.fitNotes.map((fitNote) => {
              const requestedIso = fitNote.requestedDate
                ? formatLocalDateIso(fitNote.requestedDate)
                : null;
              const receivedIso = fitNote.receivedDate
                ? formatLocalDateIso(fitNote.receivedDate)
                : null;
              return (
                <li key={fitNote.id} className="min-w-0 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {FIT_NOTE_STATUS_LABELS[fitNote.status]}
                      </p>
                      {fitNoteShowsRequestedDate(fitNote.status, requestedIso) &&
                      requestedIso ? (
                        <p className="mt-1 text-sm text-slate-700">
                          Requested {formatLocalDateDisplay(fitNote.requestedDate!)}
                        </p>
                      ) : null}
                      {fitNoteShowsReceivedDate(fitNote.status) && receivedIso ? (
                        <p className="mt-1 text-sm text-slate-700">
                          Received {formatLocalDateDisplay(fitNote.receivedDate!)}
                        </p>
                      ) : null}
                      {fitNote.note ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                          {fitNote.note}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-slate-600">
                        Updated {formatLondonDateTime(fitNote.updatedAt)} ·{" "}
                        {formatStaffName(fitNote.updatedBy)}
                      </p>
                    </div>
                    {canMutate ? (
                      <EditFitNoteDialog
                        fitNoteId={fitNote.id}
                        status={fitNote.status}
                        requestedDate={requestedIso ?? ""}
                        receivedDate={receivedIso ?? ""}
                        note={fitNote.note ?? ""}
                        expectedUpdatedAt={fitNote.updatedAt.toISOString()}
                        todayIso={todayIso}
                        returnTo={evidenceReturnTo}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
