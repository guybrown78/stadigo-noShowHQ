export const OPERATING_TIMEZONE = "Europe/London";
export const DEFAULT_TENANT_TIMEZONE = "Europe/London";

export const ABSENCE_TYPES = ["CANCELLATION", "AWOL", "SICKNESS"] as const;
export const CREATABLE_ABSENCE_TYPES = ["CANCELLATION", "AWOL"] as const;
export const LEDGER_VIEWS = ["cancellations", "awol"] as const;
export const DEFAULT_LEDGER_VIEW = "cancellations" as const;
export const AWOL_CREATE_IDEMPOTENCY_OPERATION = "AWOL_CREATE";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const NOTES_PREVIEW_MAX_LENGTH = 80;

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
] as const;

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

export const LEDGER_SORT_FIELDS = [
  "reported",
  "eventDate",
  "staff",
  "event",
  "notice",
] as const;
export const AWOL_LEDGER_SORT_FIELDS = [
  "reported",
  "eventDate",
  "staff",
  "event",
] as const;
export const LEDGER_SORT_DIRECTIONS = ["asc", "desc"] as const;
export const DEFAULT_LEDGER_SORT = "reported" as const;
export const DEFAULT_AWOL_LEDGER_SORT = "eventDate" as const;
export const DEFAULT_LEDGER_DIRECTION = "desc" as const;

export type LedgerView = (typeof LEDGER_VIEWS)[number];
export type LedgerSortField = (typeof LEDGER_SORT_FIELDS)[number];
export type LedgerSortDirection = (typeof LEDGER_SORT_DIRECTIONS)[number];
export type AwolLedgerSortField = (typeof AWOL_LEDGER_SORT_FIELDS)[number];
