import type {
  StaffProbationCycleStatus,
  StaffProbationTaskState,
} from "@prisma/client";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";
import type { PROBATION_LIFECYCLES } from "@/lib/staff/catalog";

export type ProbationLifecycle = (typeof PROBATION_LIFECYCLES)[number];

export type ProbationLifecycleInput = {
  status: StaffProbationCycleStatus | "NOT_APPLICABLE";
  completedAt: Date | null;
  reviewDueDate: Date | null;
  currentEndDate: Date | null;
  todayIso: string;
};

export function deriveProbationLifecycle(
  input: ProbationLifecycleInput,
): ProbationLifecycle | null {
  if (input.status === "NOT_APPLICABLE") {
    return null;
  }

  if (input.status === "NOT_CONTINUED") {
    return "NOT_CONTINUED";
  }
  if (input.status === "PASSED" || input.completedAt) {
    return "PASSED";
  }

  if (!input.currentEndDate || !input.reviewDueDate) {
    return "NEEDS_DATES";
  }

  const today = input.todayIso;
  const endIso = formatLocalDateIso(input.currentEndDate);
  const reviewIso = formatLocalDateIso(input.reviewDueDate);

  if (today > endIso) {
    return "OVERDUE";
  }
  if (today >= reviewIso && today <= endIso) {
    return "REVIEW_DUE";
  }
  return "UPCOMING";
}

export function calendarDaysOverdue(
  currentEndDate: Date,
  todayIso: string,
): number {
  const today = parseLocalDate(todayIso);
  if (!today) return 0;
  const ms = today.getTime() - currentEndDate.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function isClosedProbationLifecycle(
  lifecycle: ProbationLifecycle | null,
): boolean {
  return lifecycle === "PASSED" || lifecycle === "NOT_CONTINUED";
}

export function isUnresolvedCycleStatus(
  status: StaffProbationCycleStatus,
  completedAt: Date | null,
): boolean {
  if (completedAt) return false;
  return status === "IN_PROGRESS" || status === "EXTENDED";
}

export function isTaskActionable(
  state: StaffProbationTaskState,
  snoozedUntil: Date | null,
  todayIso: string,
): boolean {
  if (state === "RESOLVED" || state === "CANCELLED") {
    return false;
  }
  if (snoozedUntil && formatLocalDateIso(snoozedUntil) >= todayIso) {
    return false;
  }
  return true;
}
