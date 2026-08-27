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
] as const;

export const SECURITY_CLEARANCE_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "VALID",
  "EXPIRED",
  "NOT_RECORDED",
] as const;

export const DEFAULT_PROBATION_DAYS = 90;
export const PROBATION_REVIEW_LEAD_DAYS = 28;
export const MAX_PROBATION_DAYS = 730;
export const STAFF_PAGE_SIZE = 20;
export const MANAGER_SEARCH_LIMIT = 20;
