import { ISSUE_SUMMARY_MAX_CODE_POINTS, SICKNESS_ADVANCE_REPORT_MAX_DAYS } from "@/lib/absence/catalog";
import {
  TENANT_TIMEZONE_ERROR,
  requireIanaTimeZone,
  todayIsoInTimeZone,
} from "@/lib/absence/timezone";
import { parseLocalDate } from "@/lib/events/dates";
import { emptyToNull } from "@/lib/staff/normalize";

export const SICKNESS_REPORTED_FUTURE_MESSAGE =
  "Date sickness reported cannot be in the future.";
export const SICKNESS_STARTED_FUTURE_MESSAGE =
  "Sickness started cannot be in the future.";
export const SICKNESS_STARTED_AFTER_FIRST_DAY_MESSAGE =
  "Sickness started cannot be after the first day sick from work.";
export const SICKNESS_ADVANCE_UNCONFIRMED_MESSAGE =
  "Confirm that the staff member reported sickness before their next affected working day.";
export const SICKNESS_ADVANCE_BEYOND_LIMIT_MESSAGE =
  "First day sick from work cannot be more than 31 days after the date sickness was reported.";
export const SICKNESS_EVENT_FORBIDDEN_MESSAGE =
  "Sickness cannot be linked to an event.";
export const SICKNESS_OUT_OF_SCOPE_FIELDS_MESSAGE =
  "Sickness cannot include Cancellation, AWOL, or later sickness workflow fields.";
export const SICKNESS_NO_CHANGE_MESSAGE =
  "No changes were made. Update a field or cancel.";
export const DUPLICATE_SICKNESS_MESSAGE =
  "An active sickness report already exists for this staff member and first day sick from work. Open the existing record instead.";
export const ISSUE_SUMMARY_HELPER_TEXT =
  "Optional. Record only what is operationally necessary. Do not request a diagnosis or detailed medical information.";
export const NO_SICKNESS_STARTED_RECORDED = "Not recorded";
export const NO_ISSUE_SUMMARY_RECORDED = "No issue summary recorded";
export const ISSUE_SUMMARY_PRESENT_LABEL = "Issue summary recorded";
export const SICKNESS_INITIAL_STATUS_LABEL = "Initial report recorded";

export const SICKNESS_FORBIDDEN_FIELDS = [
  "eventId",
  "reportedTime",
  "reason",
  "notes",
  "retrospectiveConfirmed",
  "sameDayStartUnknownConfirmed",
  "eventDate",
  "eventStartTime",
  "sicknessEndedDate",
  "endDate",
  "selfCertification",
  "certificateRequired",
  "certificateReceived",
  "contactedDate",
  "followUp",
  "attachmentId",
  "firstDayBack",
  "returnToWork",
] as const;

export type SicknessDateEligibility =
  | {
      ok: true;
      reportedDate: Date;
      firstWorkingDaySick: Date;
      sicknessStartedDate: Date | null;
      requiresAdvanceConfirmation: boolean;
    }
  | { ok: false; field: string; message: string };

export function unicodeCodePointLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeIssueSummary(
  value: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const normalized = emptyToNull(value);
  if (normalized === null) {
    return { ok: true, value: null };
  }
  if (unicodeCodePointLength(normalized) > ISSUE_SUMMARY_MAX_CODE_POINTS) {
    return {
      ok: false,
      message: `Issue summary must be ${ISSUE_SUMMARY_MAX_CODE_POINTS.toLocaleString()} characters or fewer`,
    };
  }
  return { ok: true, value: normalized };
}

export function calendarDaysBetween(fromIso: string, toIso: string): number | null {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    return null;
  }
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function isFutureIsoDate(valueIso: string, todayIso: string): boolean {
  return valueIso > todayIso;
}

export function requiresAdvanceConfirmation(
  firstWorkingDaySickIso: string,
  todayIso: string,
): boolean {
  return isFutureIsoDate(firstWorkingDaySickIso, todayIso);
}

export function requiresCorrectionAdvanceConfirmation(params: {
  previousFirstWorkingDaySickIso: string;
  nextFirstWorkingDaySickIso: string;
  todayIso: string;
}): boolean {
  return (
    params.nextFirstWorkingDaySickIso !== params.previousFirstWorkingDaySickIso &&
    requiresAdvanceConfirmation(params.nextFirstWorkingDaySickIso, params.todayIso)
  );
}

export function sicknessHasForbiddenFields(formData: FormData): boolean {
  return SICKNESS_FORBIDDEN_FIELDS.some((field) => {
    const value = formData.get(field);
    if (typeof value !== "string") {
      return false;
    }
    return value.trim().length > 0;
  });
}

export function forbiddenSicknessFieldMessage(formData: FormData): string {
  const eventId = formData.get("eventId");
  if (typeof eventId === "string" && eventId.trim()) {
    return SICKNESS_EVENT_FORBIDDEN_MESSAGE;
  }
  return SICKNESS_OUT_OF_SCOPE_FIELDS_MESSAGE;
}

export function evaluateSicknessDates(params: {
  reportedDate: string;
  firstWorkingDaySick: string;
  sicknessStartedDate: string | null;
  futureFirstWorkingDayConfirmed: boolean;
  timeZone: string;
  now?: Date;
  requireAdvanceConfirmation: boolean;
}): SicknessDateEligibility {
  let timeZone: string;
  try {
    timeZone = requireIanaTimeZone(params.timeZone);
  } catch {
    return { ok: false, field: "timezone", message: TENANT_TIMEZONE_ERROR };
  }

  const reportedDate = parseLocalDate(params.reportedDate);
  if (!reportedDate) {
    return {
      ok: false,
      field: "reportedDate",
      message: "Enter a valid date",
    };
  }
  const firstWorkingDaySick = parseLocalDate(params.firstWorkingDaySick);
  if (!firstWorkingDaySick) {
    return {
      ok: false,
      field: "firstWorkingDaySick",
      message: "Enter a valid date",
    };
  }

  let sicknessStartedDate: Date | null = null;
  if (params.sicknessStartedDate) {
    sicknessStartedDate = parseLocalDate(params.sicknessStartedDate);
    if (!sicknessStartedDate) {
      return {
        ok: false,
        field: "sicknessStartedDate",
        message: "Enter a valid date",
      };
    }
  }

  const todayIso = todayIsoInTimeZone(timeZone, params.now);
  if (isFutureIsoDate(params.reportedDate, todayIso)) {
    return {
      ok: false,
      field: "reportedDate",
      message: SICKNESS_REPORTED_FUTURE_MESSAGE,
    };
  }
  if (
    params.sicknessStartedDate &&
    isFutureIsoDate(params.sicknessStartedDate, todayIso)
  ) {
    return {
      ok: false,
      field: "sicknessStartedDate",
      message: SICKNESS_STARTED_FUTURE_MESSAGE,
    };
  }
  if (
    params.sicknessStartedDate &&
    params.sicknessStartedDate > params.firstWorkingDaySick
  ) {
    return {
      ok: false,
      field: "sicknessStartedDate",
      message: SICKNESS_STARTED_AFTER_FIRST_DAY_MESSAGE,
    };
  }

  const advanceDays = calendarDaysBetween(
    params.reportedDate,
    params.firstWorkingDaySick,
  );
  if (
    advanceDays != null &&
    advanceDays > SICKNESS_ADVANCE_REPORT_MAX_DAYS
  ) {
    return {
      ok: false,
      field: "firstWorkingDaySick",
      message: SICKNESS_ADVANCE_BEYOND_LIMIT_MESSAGE,
    };
  }

  const needsConfirmation = requiresAdvanceConfirmation(
    params.firstWorkingDaySick,
    todayIso,
  );
  if (
    params.requireAdvanceConfirmation &&
    needsConfirmation &&
    !params.futureFirstWorkingDayConfirmed
  ) {
    return {
      ok: false,
      field: "futureFirstWorkingDayConfirmed",
      message: SICKNESS_ADVANCE_UNCONFIRMED_MESSAGE,
    };
  }

  return {
    ok: true,
    reportedDate,
    firstWorkingDaySick,
    sicknessStartedDate,
    requiresAdvanceConfirmation: needsConfirmation,
  };
}
