import type { FitNoteStatus, SelfCertificationStatus } from "@/lib/absence/catalog";
import {
  FIT_NOTE_STATUSES,
  SELF_CERTIFICATION_STATUSES,
} from "@/lib/absence/catalog";
import type { AbsenceHistoryChange } from "@/lib/absence/history";
import { diffValues } from "@/lib/absence/history";
import { isFutureIsoDate } from "@/lib/absence/sickness";
import { parseLocalDate } from "@/lib/events/dates";

export const SELF_CERTIFICATION_STATUS_LABELS: Record<
  SelfCertificationStatus,
  string
> = {
  NOT_RECORDED: "Not recorded",
  NOT_REQUIRED: "Not required",
  AWAITING: "Awaiting",
  RECEIVED: "Received",
};

export const FIT_NOTE_STATUS_LABELS: Record<FitNoteStatus, string> = {
  NOT_RECORDED: "Not recorded",
  NOT_REQUIRED: "Not required",
  REQUIRED: "Required",
  REQUESTED: "Requested",
  RECEIVED: "Received",
};

export const EVIDENCE_SECTION_DESCRIPTION =
  "Recorded separately from the sickness episode and from Active or Archived. Received means an administrator recorded receipt. It does not mean the document was validated. An ended episode does not mean evidence was received.";

export const EVIDENCE_ARCHIVED_MESSAGE =
  "Archived sickness records cannot have evidence added or changed.";
export const EVIDENCE_STALE_MESSAGE =
  "This evidence was changed by someone else. Reload and try again.";
export const EVIDENCE_NO_CHANGE_MESSAGE = "Change the evidence before saving.";
export const EVIDENCE_UNSUPPORTED_MESSAGE =
  "Evidence can only be recorded on a Sickness record.";
export const EVIDENCE_FUTURE_DATE_MESSAGE =
  "Enter a date that is not in the future.";
export const EVIDENCE_MARKUP_MESSAGE = "Enter plain text without HTML.";
export const EVIDENCE_MARKUP_PATTERN = /<[A-Za-z!/]/;

export function isSelfCertificationStatus(
  value: string,
): value is SelfCertificationStatus {
  return (SELF_CERTIFICATION_STATUSES as readonly string[]).includes(value);
}

export function isFitNoteStatus(value: string): value is FitNoteStatus {
  return (FIT_NOTE_STATUSES as readonly string[]).includes(value);
}

export function evidenceMutationsAllowed(
  recordStatus: "ACTIVE" | "ARCHIVED",
): boolean {
  return recordStatus === "ACTIVE";
}

export type FitNoteDateMode = "required" | "optional" | "forbidden";

export function fitNoteDateModes(status: FitNoteStatus): {
  requested: FitNoteDateMode;
  received: "required" | "forbidden";
} {
  if (status === "REQUESTED") {
    return { requested: "required", received: "forbidden" };
  }
  if (status === "RECEIVED") {
    return { requested: "optional", received: "required" };
  }
  return { requested: "forbidden", received: "forbidden" };
}

export function fitNoteShowsRequestedDate(
  status: FitNoteStatus,
  requestedDate: string | null | undefined,
): boolean {
  if (status === "REQUESTED" || status === "RECEIVED") {
    return status === "REQUESTED" || Boolean(requestedDate);
  }
  return false;
}

export function fitNoteShowsReceivedDate(status: FitNoteStatus): boolean {
  return status === "RECEIVED";
}

export type FitNoteDateInput = {
  status: FitNoteStatus;
  requestedDate: string;
  receivedDate: string;
  todayIso?: string;
};

export function fitNoteDateFieldErrors(
  input: FitNoteDateInput,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const modes = fitNoteDateModes(input.status);
  const requested = input.requestedDate.trim();
  const received = input.receivedDate.trim();

  function checkDate(
    field: "requestedDate" | "receivedDate",
    value: string,
    mode: FitNoteDateMode,
    requiredMessage: string,
    forbiddenMessage: string,
  ) {
    if (mode === "forbidden") {
      if (value) {
        errors[field] = [forbiddenMessage];
      }
      return;
    }
    if (!value) {
      if (mode === "required") {
        errors[field] = [requiredMessage];
      }
      return;
    }
    if (!parseLocalDate(value)) {
      errors[field] = ["Enter a valid date"];
      return;
    }
    if (input.todayIso && isFutureIsoDate(value, input.todayIso)) {
      errors[field] = [EVIDENCE_FUTURE_DATE_MESSAGE];
    }
  }

  checkDate(
    "requestedDate",
    requested,
    modes.requested,
    "Date requested is required",
    "Date requested does not apply to this fit note status",
  );
  checkDate(
    "receivedDate",
    received,
    modes.received,
    "Date received is required",
    "Date received does not apply to this fit note status",
  );
  return errors;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function selfCertificationIsNoChange(
  current: SelfCertificationStatus | null,
  next: SelfCertificationStatus,
): boolean {
  return (current ?? "NOT_RECORDED") === next;
}

export function fitNoteCreateIsNoChange(input: {
  status: FitNoteStatus;
  requestedDate: string | null;
  receivedDate: string | null;
  note: string | null;
}): boolean {
  return (
    input.status === "NOT_RECORDED" &&
    input.requestedDate == null &&
    input.receivedDate == null &&
    input.note == null
  );
}

export type FitNoteSnapshot = {
  status: FitNoteStatus;
  requestedDate: string | null;
  receivedDate: string | null;
  note: string | null;
};

export function fitNoteEditIsNoChange(
  current: FitNoteSnapshot,
  next: FitNoteSnapshot,
): boolean {
  return (
    current.status === next.status &&
    current.requestedDate === next.requestedDate &&
    current.receivedDate === next.receivedDate &&
    current.note === next.note
  );
}

export function selfCertificationChanges(
  previous: SelfCertificationStatus | null,
  next: SelfCertificationStatus,
): AbsenceHistoryChange[] {
  const diff = diffValues(previous, next);
  if (!diff) {
    return [];
  }
  return [{ field: "selfCertificationStatus", ...diff }];
}

export function fitNoteChanges(input: {
  fitNoteId: string;
  previous: FitNoteSnapshot | null;
  next: FitNoteSnapshot;
}): AbsenceHistoryChange[] {
  const changes: AbsenceHistoryChange[] = [
    {
      field: "fitNoteId",
      previous: input.previous ? input.fitNoteId : null,
      next: input.fitNoteId,
    },
  ];
  const status = diffValues(input.previous?.status ?? null, input.next.status);
  if (status) {
    changes.push({ field: "fitNoteStatus", ...status });
  }
  const requested = diffValues(
    input.previous?.requestedDate ?? null,
    input.next.requestedDate,
  );
  if (requested) {
    changes.push({ field: "fitNoteRequestedDate", ...requested });
  }
  const received = diffValues(
    input.previous?.receivedDate ?? null,
    input.next.receivedDate,
  );
  if (received) {
    changes.push({ field: "fitNoteReceivedDate", ...received });
  }
  const note = diffValues(input.previous?.note ?? null, input.next.note);
  if (note) {
    changes.push({ field: "fitNoteNote", ...note });
  }
  return changes;
}
