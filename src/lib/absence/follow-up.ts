import type { AbsenceFollowUpState, AbsenceType } from "@prisma/client";
import type { AbsenceHistoryChange } from "@/lib/absence/history";
import { diffValues } from "@/lib/absence/history";
import { formatLocalDateIso } from "@/lib/events/dates";

export const FOLLOW_UP_TYPES = ["CANCELLATION", "AWOL", "SICKNESS"] as const;

export type FollowUpDueState = "overdue" | "dueToday" | "upcoming";

export const FOLLOW_UP_DUE_LABELS: Record<FollowUpDueState, string> = {
  overdue: "Overdue",
  dueToday: "Due today",
  upcoming: "Upcoming",
};

export const FOLLOW_UP_STATE_LABELS: Record<AbsenceFollowUpState, string> = {
  OPEN: "Open",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const FOLLOW_UP_PROVENANCE_LABELS = {
  MANUAL: "Manual",
  SYSTEM: "Generated",
} as const;

export const FOLLOW_UP_PURPOSE_LABELS = {
  REQUEST_FIT_NOTE: "Request fit note",
  CHASE_FIT_NOTE: "Chase fit note",
} as const;

export const FOLLOW_UP_ARCHIVED_MESSAGE =
  "Archived absences cannot have follow-ups added or changed.";
export const FOLLOW_UP_TERMINAL_MESSAGE =
  "This follow-up is already completed or cancelled. Reload and try again.";
export const FOLLOW_UP_STALE_MESSAGE =
  "This follow-up was changed by someone else. Reload and try again.";
export const FOLLOW_UP_NO_CHANGE_MESSAGE =
  "Change the due date or details before saving.";
export const FOLLOW_UP_OUTCOME_REUSE_MESSAGE =
  "Describe what happened. Do not repeat the original follow-up details.";
export const FOLLOW_UP_UNSUPPORTED_MESSAGE =
  "Follow-ups can only be added to Cancellation, AWOL, or Sickness records.";
export const FOLLOW_UP_MARKUP_MESSAGE = "Enter plain text without HTML.";

export const FOLLOW_UP_MARKUP_PATTERN = /<[A-Za-z!/]/;

const DUE_RANK: Record<FollowUpDueState, number> = {
  overdue: 0,
  dueToday: 1,
  upcoming: 2,
};

export function followUpMutationsAllowed(
  recordStatus: "ACTIVE" | "ARCHIVED",
): boolean {
  return recordStatus === "ACTIVE";
}

export function isSupportedFollowUpAbsenceType(
  type: string,
): type is (typeof FOLLOW_UP_TYPES)[number] {
  return (FOLLOW_UP_TYPES as readonly string[]).includes(type);
}

export function followUpDueState(
  dueDateIso: string,
  todayIso: string,
  state: AbsenceFollowUpState,
): FollowUpDueState | null {
  if (state !== "OPEN") {
    return null;
  }
  if (dueDateIso < todayIso) {
    return "overdue";
  }
  if (dueDateIso === todayIso) {
    return "dueToday";
  }
  return "upcoming";
}

export type FollowUpOrderFields = {
  id: string;
  state: AbsenceFollowUpState;
  dueDateIso: string;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

export function compareOpenFollowUps(
  left: FollowUpOrderFields,
  right: FollowUpOrderFields,
  todayIso: string,
): number {
  const leftState = followUpDueState(left.dueDateIso, todayIso, "OPEN");
  const rightState = followUpDueState(right.dueDateIso, todayIso, "OPEN");
  const rank =
    DUE_RANK[leftState ?? "upcoming"] - DUE_RANK[rightState ?? "upcoming"];
  if (rank !== 0) {
    return rank;
  }
  if (leftState === "dueToday") {
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    if (created !== 0) {
      return created;
    }
  } else {
    const due = left.dueDateIso.localeCompare(right.dueDateIso);
    if (due !== 0) {
      return due;
    }
  }
  return left.id.localeCompare(right.id);
}

export function compareClosedFollowUps(
  left: FollowUpOrderFields,
  right: FollowUpOrderFields,
): number {
  const leftAt = left.completedAt ?? left.cancelledAt ?? left.createdAt;
  const rightAt = right.completedAt ?? right.cancelledAt ?? right.createdAt;
  const activity = rightAt.getTime() - leftAt.getTime();
  if (activity !== 0) {
    return activity;
  }
  return right.id.localeCompare(left.id);
}

export function sortFollowUpsForDetail<T extends FollowUpOrderFields>(
  items: T[],
  todayIso: string,
): T[] {
  const open = items
    .filter((item) => item.state === "OPEN")
    .sort((left, right) => compareOpenFollowUps(left, right, todayIso));
  const closed = items
    .filter((item) => item.state !== "OPEN")
    .sort(compareClosedFollowUps);
  return [...open, ...closed];
}

export function followUpEditIsNoChange(
  current: { dueDateIso: string; details: string },
  next: { dueDateIso: string; details: string },
): boolean {
  return (
    current.dueDateIso === next.dueDateIso && current.details === next.details
  );
}

export function completionNotesReuseDetails(
  details: string,
  notes: string,
): boolean {
  return details.trim() === notes.trim();
}

export type FollowUpStateShape = {
  state: AbsenceFollowUpState;
  completionNotes: string | null;
  completedAt: Date | null;
  completedById: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
};

export function followUpStateFieldsValid(row: FollowUpStateShape): boolean {
  const completionEmpty =
    row.completionNotes == null &&
    row.completedAt == null &&
    row.completedById == null;
  const cancellationEmpty =
    row.cancellationReason == null &&
    row.cancelledAt == null &&
    row.cancelledById == null;
  if (row.state === "OPEN") {
    return completionEmpty && cancellationEmpty;
  }
  if (row.state === "COMPLETED") {
    return (
      row.completionNotes != null &&
      row.completionNotes.trim().length > 0 &&
      row.completedAt != null &&
      row.completedById != null &&
      cancellationEmpty
    );
  }
  return (
    row.cancellationReason != null &&
    row.cancellationReason.trim().length > 0 &&
    row.cancelledAt != null &&
    row.cancelledById != null &&
    completionEmpty
  );
}

export function followUpUpdateChanges(input: {
  previousDueDate: string;
  nextDueDate: string;
  previousDetails: string;
  nextDetails: string;
}): AbsenceHistoryChange[] {
  const changes: AbsenceHistoryChange[] = [];
  const due = diffValues(input.previousDueDate, input.nextDueDate);
  if (due) {
    changes.push({ field: "followUpDueDate", ...due });
  }
  const details = diffValues(input.previousDetails, input.nextDetails);
  if (details) {
    changes.push({ field: "followUpDetails", ...details });
  }
  return changes;
}

export function dateOnlyIso(value: Date): string {
  return formatLocalDateIso(value);
}

export type FollowUpContextInput = {
  type: AbsenceType;
  reportedDate: Date;
  cancellation: {
    eventNameSnapshot: string;
    eventDateSnapshot: Date;
    venueNameSnapshot: string | null;
  } | null;
  awol: {
    eventNameSnapshot: string;
    eventDateSnapshot: Date;
    venueNameSnapshot: string | null;
  } | null;
  sickness: {
    firstWorkingDaySick: Date;
    episodeState: "NOT_CONFIRMED" | "ONGOING" | "ENDED";
  } | null;
};

export function followUpContextLines(
  absence: FollowUpContextInput,
  episodeLabel: (state: "NOT_CONFIRMED" | "ONGOING" | "ENDED") => string,
): string[] {
  if (absence.type === "CANCELLATION" && absence.cancellation) {
    return [
      absence.cancellation.eventNameSnapshot,
      absence.cancellation.venueNameSnapshot ?? "Venue not recorded",
      `Event date ${dateOnlyIso(absence.cancellation.eventDateSnapshot)}`,
      `Recorded ${dateOnlyIso(absence.reportedDate)}`,
    ];
  }
  if (absence.type === "AWOL" && absence.awol) {
    return [
      absence.awol.eventNameSnapshot,
      absence.awol.venueNameSnapshot ?? "Venue not recorded",
      `Affected date ${dateOnlyIso(absence.awol.eventDateSnapshot)}`,
    ];
  }
  if (absence.type === "SICKNESS" && absence.sickness) {
    return [
      `Reported ${dateOnlyIso(absence.reportedDate)}`,
      `First day sick ${dateOnlyIso(absence.sickness.firstWorkingDaySick)}`,
      episodeLabel(absence.sickness.episodeState),
    ];
  }
  return [`Recorded ${dateOnlyIso(absence.reportedDate)}`];
}
