import type { AbsenceFollowUpStatus, AbsenceType } from "@prisma/client";
import { Ban, Bed, UserX } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  ABSENCE_TYPE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  noticeWarningFlags,
} from "@/lib/absence/display";

const TYPE_TONE: Record<AbsenceType, BadgeTone> = {
  CANCELLATION: "cancel",
  AWOL: "awol",
  SICKNESS: "sickness",
};

const TYPE_ICON = {
  CANCELLATION: Ban,
  AWOL: UserX,
  SICKNESS: Bed,
} as const;

export function AbsenceTypeBadge({ type }: { type: AbsenceType }) {
  const Icon = TYPE_ICON[type];
  return (
    <Badge tone={TYPE_TONE[type]}>
      <Icon className="size-3" aria-hidden="true" />
      {ABSENCE_TYPE_LABELS[type]}
    </Badge>
  );
}

const FOLLOW_UP_TONE: Record<AbsenceFollowUpStatus, BadgeTone> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  NOT_REQUIRED: "neutral",
};

export function FollowUpStatusBadge({
  status,
}: {
  status: AbsenceFollowUpStatus;
}) {
  return (
    <Badge tone={FOLLOW_UP_TONE[status]}>{FOLLOW_UP_STATUS_LABELS[status]}</Badge>
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
      {flags.shortNotice ? <Badge tone="warning">Short notice</Badge> : null}
      {flags.retrospective ? (
        <Badge tone="warning">Retrospective / late</Badge>
      ) : null}
    </span>
  );
}
