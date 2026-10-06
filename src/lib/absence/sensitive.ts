import type { AbsenceHistoryChange } from "@/lib/absence/history";

export const SENSITIVE_ABSENCE_FIELDS = [
  "issueSummary",
  "followUpDetails",
  "followUpCompletionNotes",
  "followUpCancellationReason",
  "fitNoteNote",
  "returnToWorkNote",
] as const;

export const ISSUE_SUMMARY_CHANGED_MARKER = "Issue summary changed";
export const FOLLOW_UP_DETAILS_CHANGED_MARKER = "Follow-up details changed";
export const FOLLOW_UP_OUTCOME_CHANGED_MARKER = "Follow-up outcome changed";
export const FOLLOW_UP_CANCELLATION_CHANGED_MARKER =
  "Follow-up cancellation changed";
export const FIT_NOTE_NOTE_CHANGED_MARKER = "Fit note note changed";
export const RETURN_TO_WORK_NOTE_CHANGED_MARKER = "Return to work note changed";

const SENSITIVE_FIELD_MARKERS: Record<string, string> = {
  issueSummary: ISSUE_SUMMARY_CHANGED_MARKER,
  followUpDetails: FOLLOW_UP_DETAILS_CHANGED_MARKER,
  followUpCompletionNotes: FOLLOW_UP_OUTCOME_CHANGED_MARKER,
  followUpCancellationReason: FOLLOW_UP_CANCELLATION_CHANGED_MARKER,
  fitNoteNote: FIT_NOTE_NOTE_CHANGED_MARKER,
  returnToWorkNote: RETURN_TO_WORK_NOTE_CHANGED_MARKER,
};

const FOLLOW_UP_REASON_ACTIONS = new Set([
  "FOLLOW_UP_UPDATED",
  "FOLLOW_UP_COMPLETED",
  "FOLLOW_UP_CANCELLED",
]);

export function isSensitiveAbsenceField(field: string): boolean {
  return (SENSITIVE_ABSENCE_FIELDS as readonly string[]).includes(field);
}

export function redactHistoryChangesForPublicFeed(
  changes: AbsenceHistoryChange[],
): AbsenceHistoryChange[] {
  const redacted = changes.filter(
    (change) => !isSensitiveAbsenceField(change.field),
  );
  const seen = new Set<string>();
  const markers: AbsenceHistoryChange[] = [];
  for (const change of changes) {
    if (!isSensitiveAbsenceField(change.field) || seen.has(change.field)) {
      continue;
    }
    seen.add(change.field);
    const marker = SENSITIVE_FIELD_MARKERS[change.field] ?? "Details changed";
    markers.push({ field: change.field, previous: marker, next: marker });
  }
  return [...redacted, ...markers];
}

export function redactHistoryReasonForPublicFeed(
  action: string,
  reason: string | null | undefined,
): string | null {
  if (!reason) {
    return null;
  }
  if (FOLLOW_UP_REASON_ACTIONS.has(action)) {
    return "Follow-up note changed";
  }
  return reason;
}

export function issueSummaryPresent(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}
