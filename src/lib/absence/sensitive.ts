import type { AbsenceHistoryChange } from "@/lib/absence/history";

export const SENSITIVE_ABSENCE_FIELDS = ["issueSummary"] as const;

export const ISSUE_SUMMARY_CHANGED_MARKER = "Issue summary changed";

export function isSensitiveAbsenceField(field: string): boolean {
  return (SENSITIVE_ABSENCE_FIELDS as readonly string[]).includes(field);
}

export function redactHistoryChangesForPublicFeed(
  changes: AbsenceHistoryChange[],
): AbsenceHistoryChange[] {
  const hasIssueSummaryChange = changes.some(
    (change) => change.field === "issueSummary",
  );
  const redacted = changes.filter(
    (change) => !isSensitiveAbsenceField(change.field),
  );
  if (!hasIssueSummaryChange) {
    return redacted;
  }
  return [
    ...redacted,
    {
      field: "issueSummary",
      previous: ISSUE_SUMMARY_CHANGED_MARKER,
      next: ISSUE_SUMMARY_CHANGED_MARKER,
    },
  ];
}

export function issueSummaryPresent(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}
