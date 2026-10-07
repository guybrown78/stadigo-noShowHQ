import type { ReturnToWorkStatus } from "@/lib/absence/catalog";
import { RETURN_TO_WORK_STATUSES } from "@/lib/absence/catalog";
import type { AbsenceHistoryChange } from "@/lib/absence/history";
import { diffValues } from "@/lib/absence/history";
import { blankToNull, EVIDENCE_MARKUP_PATTERN } from "@/lib/absence/evidence";
import { isFutureIsoDate } from "@/lib/absence/sickness";
import { parseLocalDate } from "@/lib/events/dates";

export const RETURN_TO_WORK_STATUS_LABELS: Record<ReturnToWorkStatus, string> =
  {
    NOT_RECORDED: "Not recorded",
    NOT_REQUIRED: "Not required",
    OUTSTANDING: "Outstanding",
    COMPLETED: "Completed",
  };

export const RETURN_TO_WORK_SECTION_DESCRIPTION =
  "Record the return-to-work position for this sickness. It is separate from the sickness status, evidence, and Active or Archived.";

export const RETURN_TO_WORK_ARCHIVED_MESSAGE =
  "Archived sickness records cannot have return to work added or changed.";
export const RETURN_TO_WORK_STALE_MESSAGE =
  "This return to work record was changed by someone else. Reload and try again.";
export const RETURN_TO_WORK_NO_CHANGE_MESSAGE =
  "Change the return to work position before saving.";
export const RETURN_TO_WORK_UNSUPPORTED_MESSAGE =
  "Return to work can only be recorded on a Sickness record.";
export const RETURN_TO_WORK_FUTURE_DATE_MESSAGE =
  "Enter a date that is not in the future.";
export const RETURN_TO_WORK_DATE_REQUIRED_MESSAGE = "Completion date is required";
export const RETURN_TO_WORK_DATE_FORBIDDEN_MESSAGE =
  "Completion date does not apply to this return-to-work status";
export const RETURN_TO_WORK_CLEAR_DATE_MESSAGE =
  "Saving this will clear the completion date. The previous date stays in History.";
export const RETURN_TO_WORK_NOTE_HELPER =
  "Optional. Record only what is operationally necessary. Do not request a diagnosis or detailed medical information.";

export { EVIDENCE_MARKUP_PATTERN as RETURN_TO_WORK_MARKUP_PATTERN };
export const RETURN_TO_WORK_MARKUP_MESSAGE = "Enter plain text without HTML.";

export function isReturnToWorkStatus(
  value: string,
): value is ReturnToWorkStatus {
  return (RETURN_TO_WORK_STATUSES as readonly string[]).includes(value);
}

export function returnToWorkMutationsAllowed(
  recordStatus: "ACTIVE" | "ARCHIVED",
): boolean {
  return recordStatus === "ACTIVE";
}

export function returnToWorkDateApplies(status: ReturnToWorkStatus): boolean {
  return status === "COMPLETED";
}

export function returnToWorkDateFieldErrors(input: {
  status: ReturnToWorkStatus;
  completedOn: string;
  todayIso?: string;
}): Record<string, string[]> {
  const value = input.completedOn.trim();
  if (!returnToWorkDateApplies(input.status)) {
    if (value) {
      return { completedOn: [RETURN_TO_WORK_DATE_FORBIDDEN_MESSAGE] };
    }
    return {};
  }
  if (!value) {
    return { completedOn: [RETURN_TO_WORK_DATE_REQUIRED_MESSAGE] };
  }
  if (!parseLocalDate(value)) {
    return { completedOn: ["Enter a valid date"] };
  }
  if (input.todayIso && isFutureIsoDate(value, input.todayIso)) {
    return { completedOn: [RETURN_TO_WORK_FUTURE_DATE_MESSAGE] };
  }
  return {};
}

export type ReturnToWorkSnapshot = {
  status: ReturnToWorkStatus;
  completedOn: string | null;
  note: string | null;
};

export function returnToWorkSnapshot(input: {
  status: ReturnToWorkStatus;
  completedOn: string;
  note: string;
}): ReturnToWorkSnapshot {
  return {
    status: input.status,
    completedOn: returnToWorkDateApplies(input.status)
      ? blankToNull(input.completedOn)
      : null,
    note: blankToNull(input.note),
  };
}

export function returnToWorkIsNoChange(
  current: ReturnToWorkSnapshot | null,
  next: ReturnToWorkSnapshot,
): boolean {
  const previous = current ?? {
    status: "NOT_RECORDED" as const,
    completedOn: null,
    note: null,
  };
  return (
    previous.status === next.status &&
    previous.completedOn === next.completedOn &&
    previous.note === next.note
  );
}

export function returnToWorkChanges(
  previous: ReturnToWorkSnapshot | null,
  next: ReturnToWorkSnapshot,
): AbsenceHistoryChange[] {
  const changes: AbsenceHistoryChange[] = [];
  const status = diffValues(previous?.status ?? null, next.status);
  if (status) {
    changes.push({ field: "returnToWorkStatus", ...status });
  }
  const completedOn = diffValues(
    previous?.completedOn ?? null,
    next.completedOn,
  );
  if (completedOn) {
    changes.push({ field: "returnToWorkCompletedOn", ...completedOn });
  }
  const note = diffValues(previous?.note ?? null, next.note);
  if (note) {
    changes.push({ field: "returnToWorkNote", ...note });
  }
  return changes;
}
