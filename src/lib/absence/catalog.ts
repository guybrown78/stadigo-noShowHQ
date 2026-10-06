export const OPERATING_TIMEZONE = "Europe/London";
export const DEFAULT_TENANT_TIMEZONE = "Europe/London";

export const ABSENCE_TYPES = ["CANCELLATION", "AWOL", "SICKNESS"] as const;
export const CREATABLE_ABSENCE_TYPES = [
  "CANCELLATION",
  "AWOL",
  "SICKNESS",
] as const;
export const LEDGER_VIEWS = ["all", "cancellations", "awol", "sickness"] as const;
export const DEFAULT_LEDGER_VIEW = "all" as const;
export const AWOL_CREATE_IDEMPOTENCY_OPERATION = "AWOL_CREATE";
export const SICKNESS_CREATE_IDEMPOTENCY_OPERATION = "SICKNESS_CREATE";
export const SICKNESS_EPISODE_UPDATE_IDEMPOTENCY_OPERATION =
  "SICKNESS_EPISODE_UPDATE";
export const FOLLOW_UP_CREATE_IDEMPOTENCY_OPERATION = "FOLLOW_UP_CREATE";
export const FOLLOW_UP_UPDATE_IDEMPOTENCY_OPERATION = "FOLLOW_UP_UPDATE";
export const FOLLOW_UP_COMPLETE_IDEMPOTENCY_OPERATION = "FOLLOW_UP_COMPLETE";
export const FOLLOW_UP_CANCEL_IDEMPOTENCY_OPERATION = "FOLLOW_UP_CANCEL";
export const SICKNESS_SELF_CERT_UPDATE_IDEMPOTENCY_OPERATION =
  "SICKNESS_SELF_CERT_UPDATE";
export const SICKNESS_FIT_NOTE_CREATE_IDEMPOTENCY_OPERATION =
  "SICKNESS_FIT_NOTE_CREATE";
export const SICKNESS_FIT_NOTE_UPDATE_IDEMPOTENCY_OPERATION =
  "SICKNESS_FIT_NOTE_UPDATE";
export const SICKNESS_RETURN_TO_WORK_UPDATE_IDEMPOTENCY_OPERATION =
  "SICKNESS_RETURN_TO_WORK_UPDATE";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const NOTES_PREVIEW_MAX_LENGTH = 80;
export const ISSUE_SUMMARY_MAX_CODE_POINTS = 1000;
export const SICKNESS_ADVANCE_REPORT_MAX_DAYS = 31;

export const ABSENCE_FOLLOW_UP_TYPES = ["REVIEW"] as const;
export const ABSENCE_FOLLOW_UP_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "NOT_REQUIRED",
] as const;
export const ABSENCE_RECORD_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const ABSENCE_NOTICE_BASES = ["EXACT_TIME", "CALENDAR_DATE"] as const;
export const ABSENCE_HISTORY_ACTIONS = [
  "CREATED",
  "CORRECTED",
  "ARCHIVED",
  "EPISODE_UPDATED",
  "FOLLOW_UP_CREATED",
  "FOLLOW_UP_UPDATED",
  "FOLLOW_UP_COMPLETED",
  "FOLLOW_UP_CANCELLED",
  "EVIDENCE_RECORDED",
  "EVIDENCE_CORRECTED",
  "RETURN_TO_WORK_RECORDED",
  "RETURN_TO_WORK_CORRECTED",
] as const;
export const ABSENCE_FOLLOW_UP_STATES = [
  "OPEN",
  "COMPLETED",
  "CANCELLED",
] as const;
export const FOLLOW_UP_DUE_GROUPS = ["overdue", "dueToday", "upcoming"] as const;
export const FOLLOW_UP_DETAILS_MIN_LENGTH = 2;
export const FOLLOW_UP_DETAILS_MAX_LENGTH = 2000;
export const FOLLOW_UP_QUEUE_PAGE_SIZE = 25;
export const SICKNESS_EPISODE_STATES = [
  "NOT_CONFIRMED",
  "ONGOING",
  "ENDED",
] as const;
export const SICKNESS_EPISODE_UPDATE_STATES = ["ONGOING", "ENDED"] as const;
export const SELF_CERTIFICATION_STATUSES = [
  "NOT_RECORDED",
  "NOT_REQUIRED",
  "AWAITING",
  "RECEIVED",
] as const;
export const FIT_NOTE_STATUSES = [
  "NOT_RECORDED",
  "NOT_REQUIRED",
  "REQUIRED",
  "REQUESTED",
  "RECEIVED",
] as const;
export const RETURN_TO_WORK_STATUSES = [
  "NOT_RECORDED",
  "NOT_REQUIRED",
  "OUTSTANDING",
  "COMPLETED",
] as const;

export type SicknessEpisodeState = (typeof SICKNESS_EPISODE_STATES)[number];
export type SicknessEpisodeUpdateState =
  (typeof SICKNESS_EPISODE_UPDATE_STATES)[number];
export type SelfCertificationStatus =
  (typeof SELF_CERTIFICATION_STATUSES)[number];
export type FitNoteStatus = (typeof FIT_NOTE_STATUSES)[number];
export type ReturnToWorkStatus = (typeof RETURN_TO_WORK_STATUSES)[number];

export const SHORT_NOTICE_MINUTES = 24 * 60;
export const REASON_MIN_LENGTH = 2;
export const REASON_MAX_LENGTH = 1000;
export const NOTES_MAX_LENGTH = 2000;
export const CORRECTION_REASON_MIN_LENGTH = 2;
export const CORRECTION_REASON_MAX_LENGTH = 500;
export const ARCHIVE_REASON_MIN_LENGTH = 2;
export const ARCHIVE_REASON_MAX_LENGTH = 500;

export const ABSENCE_STAFF_SEARCH_LIMIT = 20;
export const ABSENCE_EVENT_SEARCH_LIMIT = 20;
export const STAFF_ABSENCE_HISTORY_PAGE_SIZE = 10;
export const LEDGER_PAGE_SIZE = 25;

export const UNIFIED_LEDGER_SORT_FIELDS = [
  "type",
  "staff",
  "reported",
  "affected",
  "created",
] as const;
export const LEDGER_SORT_FIELDS = [
  ...UNIFIED_LEDGER_SORT_FIELDS,
  "eventDate",
  "event",
  "notice",
] as const;
export const AWOL_LEDGER_SORT_FIELDS = [
  ...UNIFIED_LEDGER_SORT_FIELDS,
  "eventDate",
  "event",
] as const;
export const SICKNESS_LEDGER_SORT_FIELDS = [
  ...UNIFIED_LEDGER_SORT_FIELDS,
  "firstDay",
  "sicknessStarted",
] as const;
export const ALL_LEDGER_SORT_FIELDS = [
  "type",
  "staff",
  "reported",
  "affected",
  "created",
  "eventDate",
  "event",
  "notice",
  "firstDay",
  "sicknessStarted",
] as const;
export const LEDGER_SORT_DIRECTIONS = ["asc", "desc"] as const;
export const DEFAULT_LEDGER_SORT = "reported" as const;
export const DEFAULT_AWOL_LEDGER_SORT = "eventDate" as const;
export const DEFAULT_SICKNESS_LEDGER_SORT = "firstDay" as const;
export const DEFAULT_LEDGER_DIRECTION = "desc" as const;

export type LedgerView = (typeof LEDGER_VIEWS)[number];
export type LedgerSortField = (typeof ALL_LEDGER_SORT_FIELDS)[number];
export type LedgerSortDirection = (typeof LEDGER_SORT_DIRECTIONS)[number];
export type AwolLedgerSortField = (typeof AWOL_LEDGER_SORT_FIELDS)[number];
export type SicknessLedgerSortField = (typeof SICKNESS_LEDGER_SORT_FIELDS)[number];

export const LEDGER_ABSENCE_TYPES_BY_VIEW = {
  all: ["CANCELLATION", "AWOL", "SICKNESS"],
  cancellations: ["CANCELLATION"],
  awol: ["AWOL"],
  sickness: ["SICKNESS"],
} as const;

export function defaultLedgerSortForView(view: LedgerView): LedgerSortField {
  if (view === "awol") {
    return DEFAULT_AWOL_LEDGER_SORT;
  }
  if (view === "sickness") {
    return DEFAULT_SICKNESS_LEDGER_SORT;
  }
  return DEFAULT_LEDGER_SORT;
}

export function sortFieldsForLedgerView(view: LedgerView): readonly LedgerSortField[] {
  if (view === "awol") {
    return AWOL_LEDGER_SORT_FIELDS;
  }
  if (view === "sickness") {
    return SICKNESS_LEDGER_SORT_FIELDS;
  }
  if (view === "cancellations") {
    return LEDGER_SORT_FIELDS;
  }
  return [...UNIFIED_LEDGER_SORT_FIELDS, "eventDate", "firstDay"];
}

export function isLedgerSortAllowed(
  view: LedgerView,
  sort: string,
): sort is LedgerSortField {
  return (sortFieldsForLedgerView(view) as readonly string[]).includes(sort);
}

export function ledgerAbsenceTypesForView(
  view: LedgerView,
): readonly (typeof LEDGER_ABSENCE_TYPES_BY_VIEW)[LedgerView][number][] {
  return LEDGER_ABSENCE_TYPES_BY_VIEW[view];
}

export type LedgerEventFilterField = "venue" | "eventType";

export function ledgerFilterApplies(
  view: LedgerView,
  field: LedgerEventFilterField,
): boolean {
  switch (field) {
    case "venue":
    case "eventType":
      return view !== "sickness";
  }
}

export function ledgerShowsEventFilters(view: LedgerView): boolean {
  return (
    ledgerFilterApplies(view, "venue") &&
    ledgerFilterApplies(view, "eventType")
  );
}
