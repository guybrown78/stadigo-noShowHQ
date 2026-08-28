export const EMPLOYMENT_STATUSES = [
  "ACTIVE",
  "MONITORING",
  "CONTACT_REQUIRED",
  "DISABLED",
  "INACTIVE",
] as const;

export const PROBATION_STATUSES = [
  "NOT_APPLICABLE",
  "IN_PROGRESS",
  "PASSED",
  "EXTENDED",
  "NOT_CONTINUED",
] as const;

export const SECURITY_CLEARANCE_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "VALID",
  "EXPIRED",
  "NOT_RECORDED",
] as const;

export function clearanceStatusRequiresExpiry(
  status: (typeof SECURITY_CLEARANCE_STATUSES)[number],
) {
  return status === "VALID" || status === "EXPIRED";
}

export const PROBATION_DURATION_SOURCES = [
  "TENANT_DEFAULT",
  "INDIVIDUAL_OVERRIDE",
  "MANUAL_END_DATE",
] as const;

export const PROBATION_LIFECYCLES = [
  "UPCOMING",
  "REVIEW_DUE",
  "OVERDUE",
  "PASSED",
  "NOT_CONTINUED",
  "NEEDS_DATES",
] as const;

export const PROBATION_REVIEW_OUTCOMES = [
  "PASSED",
  "EXTENDED",
  "NOT_CONTINUED",
] as const;

export const DEFAULT_PROBATION_DAYS = 90;
export const PROBATION_REVIEW_LEAD_DAYS = 28;
export const MAX_PROBATION_DAYS = 730;
export const PROBATION_CHASE_INTERVAL_DAYS = 7;
export const MAX_PROBATION_SNOOZE_DAYS = 7;
export const STAFF_PAGE_SIZE = 20;
export const MANAGER_SEARCH_LIMIT = 20;
export const PROBATION_QUEUE_PAGE_SIZE = 20;
