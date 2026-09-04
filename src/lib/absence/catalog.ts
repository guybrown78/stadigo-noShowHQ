export const OPERATING_TIMEZONE = "Europe/London";

export const ABSENCE_TYPES = ["CANCELLATION", "AWOL", "SICKNESS"] as const;
export const CREATABLE_ABSENCE_TYPES = ["CANCELLATION"] as const;

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
export const LEDGER_SORT_DIRECTIONS = ["asc", "desc"] as const;
export const DEFAULT_LEDGER_SORT = "reported" as const;
export const DEFAULT_LEDGER_DIRECTION = "desc" as const;

export type LedgerSortField = (typeof LEDGER_SORT_FIELDS)[number];
export type LedgerSortDirection = (typeof LEDGER_SORT_DIRECTIONS)[number];
