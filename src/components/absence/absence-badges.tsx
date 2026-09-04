import type { AbsenceFollowUpStatus, AbsenceType } from "@prisma/client";
import {
  ABSENCE_TYPE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_STYLES,
  noticeWarningFlags,
} from "@/lib/absence/display";

export function AbsenceTypeBadge({ type }: { type: AbsenceType }) {
  return (
    <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
      {ABSENCE_TYPE_LABELS[type]}
    </span>
  );
}

export function FollowUpStatusBadge({
  status,
}: {
  status: AbsenceFollowUpStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${FOLLOW_UP_STATUS_STYLES[status]}`}
    >
      {FOLLOW_UP_STATUS_LABELS[status]}
    </span>
  );
}

export function NoticeWarningBadges({
  detail,
}: {
  detail: {
    isShortNotice: boolean;
    noticeCalendarDays: number;
    noticeMinutes: number | null;
  };
}) {
  const flags = noticeWarningFlags(detail);
  if (!flags.shortNotice && !flags.retrospective) {
    return null;
  }
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {flags.shortNotice ? (
        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          Short notice
        </span>
      ) : null}
      {flags.retrospective ? (
        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          Retrospective / late
        </span>
      ) : null}
    </span>
  );
}
