import Link from "next/link";
import { AbsenceTypeBadge } from "@/components/absence/absence-badges";
import {
  formatCalendarNotice,
  formatDurationMinutes,
  truncateNotes,
  truncateReason,
} from "@/lib/absence/display";
import {
  listActiveAbsencesForStaff,
  STAFF_ABSENCE_HISTORY_PAGE_SIZE,
} from "@/lib/absence/queries";
import { ISSUE_SUMMARY_PRESENT_LABEL, sicknessEpisodeStateLabel } from "@/lib/absence/sickness";
import { prisma } from "@/lib/db";
import { formatLocalDateDisplay } from "@/lib/events/dates";

function FollowUpRecorded({ recorded }: { recorded: boolean }) {
  if (!recorded) {
    return null;
  }
  return <p className="mt-1 text-sm text-muted">Follow-up recorded</p>;
}

function historyHref(page: number, archived: boolean) {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set("absencePage", String(page));
  }
  if (archived) {
    params.set("absenceArchived", "1");
  }
  const query = params.toString();
  return query ? `?${query}` : "?";
}

export async function StaffAbsenceHistory({
  tenantId,
  staffId,
  page,
  includeArchivedSickness = false,
}: {
  tenantId: string;
  staffId: string;
  page: number;
  includeArchivedSickness?: boolean;
}) {
  const { absences, total, pageCount, page: currentPage, archivedSicknessCount } =
    await listActiveAbsencesForStaff(prisma, tenantId, staffId, page, {
      includeArchivedSickness,
    });

  return (
    <section
      id="absence-history"
      className="mt-8 scroll-mt-8 rounded-lg border border-border bg-surface p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          Absence history
        </h2>
        <Link
          href={historyHref(1, !includeArchivedSickness)}
          className="text-sm underline"
        >
          {includeArchivedSickness
            ? "Hide archived sickness"
            : "Show archived"}
        </Link>
      </div>
      {includeArchivedSickness && archivedSicknessCount === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No archived sickness reports for this staff member.
        </p>
      ) : null}
      {total === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {includeArchivedSickness
            ? "No absences are recorded for this staff member."
            : "No active absences are recorded for this staff member."}
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-100">
            {absences.map((absence) => {
              if (absence.type === "SICKNESS" && absence.sickness) {
                return (
                  <li key={absence.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          <AbsenceTypeBadge type="SICKNESS" />
                          {absence.recordStatus === "ARCHIVED" ? (
                            <span className="text-xs font-medium text-muted">
                              Archived
                            </span>
                          ) : null}
                          <Link
                            href={`/absence/${absence.id}`}
                            className="underline"
                          >
                            First day sick{" "}
                            {formatLocalDateDisplay(
                              absence.sickness.firstWorkingDaySick,
                            )}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Reported{" "}
                          {formatLocalDateDisplay(absence.reportedDate)}
                          {` · ${sicknessEpisodeStateLabel(absence.sickness.episodeState)}`}
                          {absence.sickness.episodeState === "ENDED" &&
                          absence.sickness.sicknessEndedDate
                            ? ` · Ended ${formatLocalDateDisplay(absence.sickness.sicknessEndedDate)}`
                            : ""}
                          {absence.sickness.sicknessStartedDate
                            ? ` · Sickness started ${formatLocalDateDisplay(absence.sickness.sicknessStartedDate)}`
                            : ""}
                          {absence.sickness.issueSummaryPresent
                            ? ` · ${ISSUE_SUMMARY_PRESENT_LABEL}`
                            : ""}
                        </p>
                        <FollowUpRecorded recorded={absence.followUpRecorded} />
                      </div>
                    </div>
                  </li>
                );
              }

              if (absence.type === "AWOL" && absence.awol) {
                const notes = truncateNotes(absence.notes);
                return (
                  <li key={absence.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          <AbsenceTypeBadge type="AWOL" />
                          <Link
                            href={`/absence/${absence.id}`}
                            className="underline"
                          >
                            {absence.awol.eventNameSnapshot}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Event{" "}
                          {formatLocalDateDisplay(absence.awol.eventDateSnapshot)}
                          {absence.awol.venueNameSnapshot
                            ? ` · ${absence.awol.venueNameSnapshot}`
                            : ""}
                          {" · Date recorded "}
                          {formatLocalDateDisplay(absence.reportedDate)}
                        </p>
                        {notes ? (
                          <p className="mt-1 text-sm text-muted">{notes}</p>
                        ) : null}
                        <FollowUpRecorded recorded={absence.followUpRecorded} />
                      </div>
                    </div>
                  </li>
                );
              }

              const detail = absence.cancellation;
              const eventDate = detail?.eventDateSnapshot ?? absence.reportedDate;
              const eventName = detail?.eventNameSnapshot ?? "Event";
              const notice = detail
                ? detail.noticeBasis === "EXACT_TIME" &&
                  detail.noticeMinutes != null
                  ? formatDurationMinutes(detail.noticeMinutes)
                  : formatCalendarNotice(detail.noticeCalendarDays)
                : "—";
              return (
                <li key={absence.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <AbsenceTypeBadge type="CANCELLATION" />
                        <Link
                          href={`/absence/${absence.id}`}
                          className="underline"
                        >
                          {eventName}
                        </Link>
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        Event {formatLocalDateDisplay(eventDate)} · Cancelled{" "}
                        {formatLocalDateDisplay(absence.reportedDate)} · Notice{" "}
                        {notice}
                      </p>
                      {absence.reason ? (
                        <p className="mt-1 text-sm text-muted">
                          {truncateReason(absence.reason)}
                        </p>
                      ) : null}
                      <FollowUpRecorded recorded={absence.followUpRecorded} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <nav
              className="mt-4 flex flex-wrap items-center gap-3 text-sm"
              aria-label="Absence history pages"
            >
              {currentPage > 1 ? (
                <Link
                  href={historyHref(currentPage - 1, includeArchivedSickness)}
                  className="underline"
                >
                  Previous
                </Link>
              ) : null}
              <span className="text-muted">
                Page {currentPage} of {pageCount} ({total} records,{" "}
                {STAFF_ABSENCE_HISTORY_PAGE_SIZE} per page)
              </span>
              {currentPage < pageCount ? (
                <Link
                  href={historyHref(currentPage + 1, includeArchivedSickness)}
                  className="underline"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
