import type {
  EmploymentStatus,
  ProbationStatus,
  SecurityClearanceStatus,
  StaffProbationAction,
} from "@prisma/client";

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
};

export const PROBATION_STATUS_STYLES: Record<ProbationStatus, string> = {
  NOT_APPLICABLE: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-sky-100 text-sky-900",
  PASSED: "bg-emerald-100 text-emerald-900",
  EXTENDED: "bg-amber-100 text-amber-900",
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
  END_DATE_OVERRIDDEN: "End date overridden",
  EXTENDED: "Extended",
  PASSED: "Passed",
  STATUS_CHANGED: "Status changed",
};

export function formatStaffName(staff: {
  firstName: string;
  lastName: string;
}): string {
  return `${staff.firstName} ${staff.lastName}`;
}
