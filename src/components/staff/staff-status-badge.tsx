import type {
  EmploymentStatus,
  ProbationStatus,
  SecurityClearanceStatus,
} from "@prisma/client";
import {
  CLEARANCE_STATUS_LABELS,
  CLEARANCE_STATUS_STYLES,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_STYLES,
  PROBATION_LIFECYCLE_LABELS,
  PROBATION_LIFECYCLE_STYLES,
  PROBATION_STATUS_LABELS,
  PROBATION_STATUS_STYLES,
} from "@/lib/staff/display";
import type { ProbationLifecycle } from "@/lib/staff/lifecycle";

export function EmploymentStatusBadge({
  status,
}: {
  status: EmploymentStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${EMPLOYMENT_STATUS_STYLES[status]}`}
    >
      {EMPLOYMENT_STATUS_LABELS[status]}
    </span>
  );
}

export function ProbationStatusBadge({ status }: { status: ProbationStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PROBATION_STATUS_STYLES[status]}`}
    >
      {PROBATION_STATUS_LABELS[status]}
    </span>
  );
}

export function ProbationLifecycleBadge({
  lifecycle,
}: {
  lifecycle: ProbationLifecycle;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PROBATION_LIFECYCLE_STYLES[lifecycle]}`}
    >
      {PROBATION_LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}

export function ClearanceStatusBadge({
  status,
}: {
  status: SecurityClearanceStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CLEARANCE_STATUS_STYLES[status]}`}
    >
      {CLEARANCE_STATUS_LABELS[status]}
    </span>
  );
}
