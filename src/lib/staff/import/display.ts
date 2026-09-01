import type { ProbationDurationSource } from "@prisma/client";
import {
  CLEARANCE_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS,
} from "@/lib/staff/display";
import type {
  ImportRowNormalized,
  ManagerOutcome,
  ProbationPreview,
} from "@/lib/staff/import/types";

export function managerMappingLabel(outcome: ManagerOutcome | null): string {
  if (!outcome || outcome.kind === "none") {
    return "None";
  }
  if (outcome.kind === "existing") {
    return `Matched existing manager: ${outcome.name} (${outcome.staffIdNumber})`;
  }
  return `Manager included in this import: row ${outcome.sourceRowNumber}, ${outcome.name} (${outcome.staffIdNumber})`;
}

export function probationSummaryLabel(
  preview: ProbationPreview | null,
  tenantDefaultDays: number,
): string {
  if (!preview?.applyProbation) {
    return "No probation";
  }
  if (preview.durationSource === "MANUAL_END_DATE") {
    return `Manual end date ${preview.endDate ?? "—"} (takes precedence over duration)`;
  }
  if (preview.durationSource === "INDIVIDUAL_OVERRIDE") {
    return `Individual duration ${preview.effectiveDurationDays ?? "—"} days, ends ${preview.endDate ?? "—"}`;
  }
  return `Tenant default (${tenantDefaultDays} days), ends ${preview.endDate ?? "—"}`;
}

export function durationSourceLabel(
  source: ProbationDurationSource | null | undefined,
): string {
  switch (source) {
    case "TENANT_DEFAULT":
      return "Tenant default";
    case "INDIVIDUAL_OVERRIDE":
      return "Individual duration override";
    case "MANUAL_END_DATE":
      return "Manual end-date override";
    default:
      return "None";
  }
}

export function employmentLabel(status: ImportRowNormalized["employmentStatus"]) {
  return EMPLOYMENT_STATUS_LABELS[status] ?? status;
}

export function clearanceLabel(
  status: ImportRowNormalized["securityClearanceStatus"],
) {
  return CLEARANCE_STATUS_LABELS[status] ?? status;
}

export const RAW_FIELD_HEADER: Record<string, keyof import("@/lib/staff/import/types").ImportRowRaw> = {
  staffIdNumber: "Staff ID",
  firstName: "First Name",
  lastName: "Last Name",
  roleTitle: "Role",
  email: "Email",
  phone: "Phone",
  department: "Department",
  managerStaffId: "Manager Staff ID",
  employmentStatus: "Employment Status",
  startDate: "Start Date",
  applyProbation: "Apply Probation",
  probationLengthDays: "Probation Length Days",
  probationEndDate: "Probation End Date",
  securityClearanceStatus: "Security Clearance Status",
  securityClearanceExpiryDate: "Security Clearance Expiry Date",
  notes: "Notes",
};
