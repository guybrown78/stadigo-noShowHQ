import type { ProbationStatus } from "@prisma/client";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";
import {
  DEFAULT_PROBATION_DAYS,
  PROBATION_REVIEW_LEAD_DAYS,
} from "@/lib/staff/catalog";

export { DEFAULT_PROBATION_DAYS, PROBATION_REVIEW_LEAD_DAYS };

export function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function calculatedProbationEndDate(
  startDate: Date,
  durationDays: number,
): Date {
  return addCalendarDays(startDate, durationDays);
}

export function calculatedReviewDueDate(endDate: Date): Date {
  return addCalendarDays(endDate, -PROBATION_REVIEW_LEAD_DAYS);
}

export function effectiveProbationDuration(
  durationOverride: number | null,
  tenantDefaultDays: number,
): number {
  return durationOverride ?? tenantDefaultDays;
}

export type ResolvedProbation = {
  probationLengthDays: number | null;
  probationEndDate: Date | null;
  probationEndDateOverridden: boolean;
  probationStatus: ProbationStatus;
  probationReviewDueDate: Date | null;
};

export type ResolveProbationInput = {
  applyProbation: boolean;
  startDate: string | null;
  durationOverride: number | null;
  overrideEndDate: boolean;
  endDateOverride: string | null;
  requestedStatus: ProbationStatus;
  tenantDefaultDays: number;
  todayIso: string;
};

export function resolveProbation(
  input: ResolveProbationInput,
):
  | { ok: true; value: ResolvedProbation }
  | { ok: false; fieldErrors: Record<string, string[]> } {
  if (!input.applyProbation) {
    return {
      ok: true,
      value: {
        probationLengthDays: null,
        probationEndDate: null,
        probationEndDateOverridden: false,
        probationStatus: "NOT_APPLICABLE",
        probationReviewDueDate: null,
      },
    };
  }

  const fieldErrors: Record<string, string[]> = {};
  const startDate = input.startDate ? parseLocalDate(input.startDate) : null;
  if (input.startDate && !startDate) {
    fieldErrors.startDate = ["Enter a valid start date"];
  }

  const duration =
    input.durationOverride ??
    (input.tenantDefaultDays > 0
      ? input.tenantDefaultDays
      : DEFAULT_PROBATION_DAYS);

  let endDate: Date | null = null;
  const overridden = input.overrideEndDate;

  if (overridden) {
    if (!input.endDateOverride) {
      fieldErrors.probationEndDate = ["Enter a probation end date"];
    } else {
      endDate = parseLocalDate(input.endDateOverride);
      if (!endDate) {
        fieldErrors.probationEndDate = ["Enter a valid probation end date"];
      }
    }
  } else if (startDate) {
    endDate = calculatedProbationEndDate(startDate, duration);
  } else {
    fieldErrors.startDate = [
      "Enter a start date, or set a probation end date",
    ];
  }

  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    fieldErrors.probationEndDate = [
      "Probation end date cannot be before the start date",
    ];
  }

  let status: ProbationStatus = input.requestedStatus;
  if (status === "NOT_APPLICABLE") {
    status = "IN_PROGRESS";
  }

  if (status === "EXTENDED") {
    if (!endDate) {
      fieldErrors.probationEndDate = [
        "Extended probation needs a future end date",
      ];
    } else if (formatLocalDateIso(endDate) <= input.todayIso) {
      fieldErrors.probationEndDate = [
        "Extended probation needs a future end date",
      ];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const reviewDue =
    status === "PASSED" || !endDate ? null : calculatedReviewDueDate(endDate);

  return {
    ok: true,
    value: {
      probationLengthDays: input.durationOverride,
      probationEndDate: endDate,
      probationEndDateOverridden: overridden,
      probationStatus: status,
      probationReviewDueDate: reviewDue,
    },
  };
}
