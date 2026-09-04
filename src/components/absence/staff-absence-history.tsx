import Link from "next/link";
import { FollowUpStatusBadge } from "@/components/absence/absence-badges";
import {
  formatCalendarNotice,
  formatDurationMinutes,
  truncateReason,
} from "@/lib/absence/display";
import {
  listActiveAbsencesForStaff,
  STAFF_ABSENCE_HISTORY_PAGE_SIZE,
} from "@/lib/absence/queries";
import { prisma } from "@/lib/db";
import { formatLocalDateDisplay } from "@/lib/events/dates";

export async function StaffAbsenceHistory({
  tenantId,
  staffId,
  page,
}: {
  tenantId: string;
  staffId: string;
  page: number;
}) {
  const { absences, total, pageCount, page: currentPage } =
    await listActiveAbsencesForStaff(prisma, tenantId, staffId, page);

  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Absence history
        </h2>
        <Link
          href={`/absence/new?staffId=${staffId}`}
          className="text-sm font-medium text-slate-800 underline hover:text-slate-950"
        >
          Log cancellation
        </Link>
      </div>
      {total === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          No active absences are recorded for this staff member.
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-100">
            {absences.map((absence) => {
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
                      <p className="font-medium text-slate-900">
                        <Link
                          href={`/absence/${absence.id}`}
                          className="underline"
                        >
                          {eventName}
                        </Link>
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Event {formatLocalDateDisplay(eventDate)} · Cancelled{" "}
                        {formatLocalDateDisplay(absence.reportedDate)} · Notice{" "}
                        {notice}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {truncateReason(absence.reason)}
                      </p>
                    </div>
                    <FollowUpStatusBadge status={absence.followUpStatus} />
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
                  href={`?absencePage=${currentPage - 1}`}
                  className="underline"
                >
                  Previous
                </Link>
              ) : null}
              <span className="text-slate-600">
                Page {currentPage} of {pageCount} ({total} records,{" "}
                {STAFF_ABSENCE_HISTORY_PAGE_SIZE} per page)
              </span>
              {currentPage < pageCount ? (
                <Link
                  href={`?absencePage=${currentPage + 1}`}
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
