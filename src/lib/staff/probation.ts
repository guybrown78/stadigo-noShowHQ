import type { ProbationDurationSource, ProbationStatus } from "@prisma/client";
import { parseLocalDate } from "@/lib/events/dates";
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

export function calendarDaysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
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
  durationSource: ProbationDurationSource | null;
  effectiveDurationDays: number | null;
  startDate: Date | null;
};

export type ResolveProbationInput = {
  applyProbation: boolean;
  startDate: string | null;
  durationOverride: number | null;
  overrideEndDate: boolean;
  endDateOverride: string | null;
  tenantDefaultDays: number;
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
        durationSource: null,
        effectiveDurationDays: null,
        startDate: null,
      },
    };
  }

  const fieldErrors: Record<string, string[]> = {};
  const startDate = input.startDate ? parseLocalDate(input.startDate) : null;
  if (!input.startDate) {
    fieldErrors.startDate = ["Enter a start date"];
  } else if (!startDate) {
    fieldErrors.startDate = ["Enter a valid start date"];
  }

  const tenantDefault =
    input.tenantDefaultDays > 0
      ? input.tenantDefaultDays
      : DEFAULT_PROBATION_DAYS;
  const duration = input.durationOverride ?? tenantDefault;

  let endDate: Date | null = null;
  const overridden = input.overrideEndDate;
  let durationSource: ProbationDurationSource = "TENANT_DEFAULT";

  if (overridden) {
    durationSource = "MANUAL_END_DATE";
    if (!input.endDateOverride) {
      fieldErrors.probationEndDate = ["Enter a probation end date"];
    } else {
      endDate = parseLocalDate(input.endDateOverride);
      if (!endDate) {
        fieldErrors.probationEndDate = ["Enter a valid probation end date"];
      }
    }
  } else if (startDate) {
    durationSource =
      input.durationOverride != null
        ? "INDIVIDUAL_OVERRIDE"
        : "TENANT_DEFAULT";
    endDate = calculatedProbationEndDate(startDate, duration);
  }

  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    fieldErrors.probationEndDate = [
      "Probation end date cannot be before the start date",
    ];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const effectiveDurationDays =
    durationSource === "MANUAL_END_DATE" && startDate && endDate
      ? calendarDaysBetween(startDate, endDate)
      : duration;

  return {
    ok: true,
    value: {
      probationLengthDays: effectiveDurationDays,
      probationEndDate: endDate,
      probationEndDateOverridden: overridden,
      probationStatus: "IN_PROGRESS",
      probationReviewDueDate: endDate
        ? calculatedReviewDueDate(endDate)
        : null,
      durationSource,
      effectiveDurationDays,
      startDate,
    },
  };
}
