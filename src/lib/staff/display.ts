import type {
  EmploymentStatus,
  ProbationDurationSource,
  ProbationStatus,
  SecurityClearanceStatus,
  StaffProbationAction,
  StaffProbationTaskState,
  StaffProbationTaskType,
} from "@prisma/client";
import { formatLocalDateDisplay } from "@/lib/events/dates";
import type { ProbationLifecycle } from "@/lib/staff/lifecycle";
import { calendarDaysOverdue } from "@/lib/staff/lifecycle";

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: "Active",
  MONITORING: "Monitoring",
  CONTACT_REQUIRED: "Contact required",
  DISABLED: "Disabled",
  INACTIVE: "Inactive",
};

export const EMPLOYMENT_STATUS_STYLES: Record<EmploymentStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-900",
  MONITORING: "bg-amber-100 text-amber-900",
  CONTACT_REQUIRED: "bg-orange-100 text-orange-900",
  DISABLED: "bg-slate-200 text-slate-800",
  INACTIVE: "bg-slate-100 text-slate-700",
};

export const PROBATION_STATUS_LABELS: Record<ProbationStatus, string> = {
  NOT_APPLICABLE: "Not applicable",
  IN_PROGRESS: "In progress",
  PASSED: "Passed",
  EXTENDED: "Extended",
  NOT_CONTINUED: "Not continued",
};

export const PROBATION_STATUS_STYLES: Record<ProbationStatus, string> = {
  NOT_APPLICABLE: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-sky-100 text-sky-900",
  PASSED: "bg-emerald-100 text-emerald-900",
  EXTENDED: "bg-amber-100 text-amber-900",
  NOT_CONTINUED: "bg-slate-200 text-slate-800",
};

export const PROBATION_LIFECYCLE_LABELS: Record<ProbationLifecycle, string> = {
  UPCOMING: "Upcoming",
  REVIEW_DUE: "Review due",
  OVERDUE: "Overdue",
  PASSED: "Passed",
  NOT_CONTINUED: "Not continued",
  NEEDS_DATES: "Needs dates",
};

export const PROBATION_LIFECYCLE_STYLES: Record<ProbationLifecycle, string> = {
  UPCOMING: "bg-sky-100 text-sky-900",
  REVIEW_DUE: "bg-amber-100 text-amber-900",
  OVERDUE: "bg-red-100 text-red-800",
  PASSED: "bg-emerald-100 text-emerald-900",
  NOT_CONTINUED: "bg-slate-200 text-slate-800",
  NEEDS_DATES: "bg-slate-200 text-slate-800",
};

export const DURATION_SOURCE_LABELS: Record<ProbationDurationSource, string> = {
  TENANT_DEFAULT: "Tenant default",
  INDIVIDUAL_OVERRIDE: "Individual override",
  MANUAL_END_DATE: "Manual end date",
};

export const CLEARANCE_STATUS_LABELS: Record<SecurityClearanceStatus, string> = {
  NOT_REQUIRED: "Not required",
  PENDING: "Pending",
  VALID: "Valid",
  EXPIRED: "Expired",
  NOT_RECORDED: "Not recorded",
};

export const CLEARANCE_STATUS_STYLES: Record<SecurityClearanceStatus, string> = {
  NOT_REQUIRED: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-900",
  VALID: "bg-emerald-100 text-emerald-900",
  EXPIRED: "bg-red-100 text-red-800",
  NOT_RECORDED: "bg-slate-100 text-slate-700",
};

export const PROBATION_ACTION_LABELS: Record<StaffProbationAction, string> = {
  STARTED: "Started",
  DURATION_OVERRIDDEN: "Duration overridden",
  END_DATE_OVERRIDDEN: "End date overridden",
  REVIEW_DUE: "Review due reminder created",
  REMINDER_CREATED: "Chase reminder created",
  REMINDER_ACKNOWLEDGED: "Reminder acknowledged",
  REMINDER_SNOOZED: "Reminder snoozed",
  EXTENDED: "Extended",
  PASSED: "Passed",
  NOT_CONTINUED: "Not continued",
  OVERDUE_ESCALATED: "Overdue escalation created",
  LEGACY_RECONCILED: "Legacy record reconciled",
  STATUS_CHANGED: "Status changed",
};

export const TASK_TYPE_LABELS: Record<StaffProbationTaskType, string> = {
  REVIEW_DUE: "Review due",
  CHASE: "Chase",
  OVERDUE_ESCALATION: "Overdue escalation",
};

export const TASK_STATE_LABELS: Record<StaffProbationTaskState, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  SNOOZED: "Snoozed",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export const REVIEW_OUTCOME_LABELS = {
  PASSED: "Passed",
  EXTENDED: "Extended",
  NOT_CONTINUED: "Not continued",
} as const;

export function formatStaffName(staff: {
  firstName: string;
  lastName: string;
}): string {
  return `${staff.firstName} ${staff.lastName}`;
}

export function formatDurationSource(
  source: ProbationDurationSource,
  days: number | null,
): string {
  const label = DURATION_SOURCE_LABELS[source];
  if (days == null) {
    return label;
  }
  return `${label}, ${days} days`;
}

export function probationUrgencyCaption(
  lifecycle: ProbationLifecycle | null,
  reviewDueDate: Date | null,
  currentEndDate: Date | null,
  todayIso: string,
): string | null {
  if (
    !lifecycle ||
    lifecycle === "PASSED" ||
    lifecycle === "NOT_CONTINUED"
  ) {
    return null;
  }
  if (lifecycle === "REVIEW_DUE" && reviewDueDate) {
    return `Review due ${formatLocalDateDisplay(reviewDueDate)}`;
  }
  if (lifecycle === "OVERDUE" && currentEndDate) {
    const days = calendarDaysOverdue(currentEndDate, todayIso);
    return days === 1 ? "Overdue by 1 day" : `Overdue by ${days} days`;
  }
  if (lifecycle === "UPCOMING" && currentEndDate) {
    return `Ends ${formatLocalDateDisplay(currentEndDate)}`;
  }
  if (lifecycle === "NEEDS_DATES") {
    return "Dates need review";
  }
  return null;
}
