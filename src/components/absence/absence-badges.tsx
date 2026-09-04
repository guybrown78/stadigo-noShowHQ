import type { AbsenceFollowUpStatus, AbsenceType } from "@prisma/client";
import {
  ABSENCE_TYPE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_STYLES,
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
