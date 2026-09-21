import {
  ISSUE_SUMMARY_MAX_CODE_POINTS,
  SICKNESS_ADVANCE_REPORT_MAX_DAYS,
  type SicknessEpisodeState,
  type SicknessEpisodeUpdateState,
} from "@/lib/absence/catalog";
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
export const SICKNESS_ENDED_FUTURE_MESSAGE =
  "Sickness ended cannot be in the future.";
export const SICKNESS_ENDED_BEFORE_FIRST_DAY_MESSAGE =
  "Sickness ended cannot be before the first day sick from work.";
export const SICKNESS_ENDED_BEFORE_STARTED_MESSAGE =
  "Sickness ended cannot be before Sickness started.";
export const SICKNESS_ENDED_REQUIRED_MESSAGE =
  "Enter the last calendar date this sickness episode affected the staff member.";
export const SICKNESS_ENDED_FORBIDDEN_WHEN_ONGOING_MESSAGE =
  "Ongoing episodes cannot have an end date.";
export const SICKNESS_EPISODE_CONFIRM_CLEAR_MESSAGE =
  "Confirm that the previously recorded end date was incorrect.";
export const SICKNESS_CORRECT_AFTER_END_DATE_MESSAGE =
  "This change would put the first day sick from work after the recorded sickness end date. Update the sickness episode first.";
export const SICKNESS_CORRECT_STARTED_AFTER_END_DATE_MESSAGE =
  "This change would put Sickness started after the recorded sickness end date. Update the sickness episode first.";
export const SICKNESS_ARCHIVED_CANNOT_UPDATE =
  "Archived records cannot be updated.";
export const SICKNESS_EPISODE_UPDATE_LABEL = "Update sickness episode";
export const SICKNESS_ENDED_DATE_HINT =
  "Enter a calendar date in the tenant timezone. This is the last date the episode affected the staff member, not the first day back.";
export const SICKNESS_CALENDAR_DAY_SPAN_HINT =
  "Inclusive calendar days from the first day sick from work to the sickness end date. This is not working days absent, payroll days or certification days.";
export const DUPLICATE_SICKNESS_MESSAGE =
  "An active sickness report already exists for this staff member and first day sick from work. Open the existing record instead.";
export const ISSUE_SUMMARY_HELPER_TEXT =
  "Optional. Record only what is operationally necessary. Do not request a diagnosis or detailed medical information.";
export const NO_SICKNESS_STARTED_RECORDED = "Not recorded";
export const NO_ISSUE_SUMMARY_RECORDED = "No issue summary recorded";
export const ISSUE_SUMMARY_PRESENT_LABEL = "Issue summary recorded";
export const SICKNESS_INITIAL_STATUS_LABEL = "Initial report recorded";
export const SICKNESS_LEDGER_SUPPORTING_COPY =
  "Review recorded Sickness reports. Episode status is shown in Context. The Status column remains Active or Archived only.";
export const SICKNESS_LEDGER_EMPTY_TITLE = "No Sickness reports recorded yet.";
export const SICKNESS_LEDGER_EMPTY_DESCRIPTION =
  "Sickness reports will appear here after they are recorded.";
export const SICKNESS_LEDGER_NO_ARCHIVED_TITLE =
  "No archived Sickness reports found.";
export const SICKNESS_LEDGER_NO_ARCHIVED_DESCRIPTION =
  "Turn off Show archived to return to active reports.";
export const SICKNESS_LEDGER_NO_MATCH_TITLE =
  "No Sickness reports match these filters.";
export const SICKNESS_LEDGER_NO_MATCH_DESCRIPTION =
  "Try a different search, or reset the filters to see all active Sickness reports.";

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

export const SICKNESS_EPISODE_FORBIDDEN_FIELDS =
  SICKNESS_FORBIDDEN_FIELDS.filter((field) => field !== "sicknessEndedDate");

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

function formDataHasPopulatedFields(
  formData: FormData,
  fields: readonly string[],
): boolean {
  return fields.some((field) => {
    const value = formData.get(field);
    if (typeof value !== "string") {
      return false;
    }
    return value.trim().length > 0;
  });
}

export function sicknessHasForbiddenFields(formData: FormData): boolean {
  return formDataHasPopulatedFields(formData, SICKNESS_FORBIDDEN_FIELDS);
}

export function sicknessEpisodeHasForbiddenFields(formData: FormData): boolean {
  return formDataHasPopulatedFields(formData, SICKNESS_EPISODE_FORBIDDEN_FIELDS);
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

export const SICKNESS_EPISODE_STATE_LABELS: Record<SicknessEpisodeState, string> =
  {
    NOT_CONFIRMED: "Episode status not confirmed",
    ONGOING: "Ongoing",
    ENDED: "Ended",
  };

export function sicknessEpisodeStateLabel(
  state: SicknessEpisodeState,
): string {
  return SICKNESS_EPISODE_STATE_LABELS[state];
}

export function inclusiveCalendarDaySpan(
  firstWorkingDaySickIso: string | null | undefined,
  sicknessEndedIso: string | null | undefined,
): number | null {
  if (!firstWorkingDaySickIso || !sicknessEndedIso) {
    return null;
  }
  const days = calendarDaysBetween(firstWorkingDaySickIso, sicknessEndedIso);
  if (days == null || days < 0) {
    return null;
  }
  return days + 1;
}

export function formatCalendarDaySpan(days: number): string {
  return days === 1 ? "1 calendar day" : `${days} calendar days`;
}

export function defaultSicknessEpisodeState(): SicknessEpisodeState {
  return "NOT_CONFIRMED";
}

export type SicknessEpisodeDateEligibility =
  | { ok: true; sicknessEndedDate: Date }
  | { ok: false; field: string; message: string };

export function evaluateSicknessEndedDate(params: {
  sicknessEndedDate: string | null;
  firstWorkingDaySick: string;
  sicknessStartedDate: string | null;
  timeZone: string;
  now?: Date;
}): SicknessEpisodeDateEligibility {
  if (!params.sicknessEndedDate) {
    return {
      ok: false,
      field: "sicknessEndedDate",
      message: SICKNESS_ENDED_REQUIRED_MESSAGE,
    };
  }

  let timeZone: string;
  try {
    timeZone = requireIanaTimeZone(params.timeZone);
  } catch {
    return { ok: false, field: "timezone", message: TENANT_TIMEZONE_ERROR };
  }

  const endedDate = parseLocalDate(params.sicknessEndedDate);
  if (!endedDate) {
    return {
      ok: false,
      field: "sicknessEndedDate",
      message: "Enter a valid date",
    };
  }
  if (!parseLocalDate(params.firstWorkingDaySick)) {
    return {
      ok: false,
      field: "firstWorkingDaySick",
      message: "Enter a valid date",
    };
  }
  if (
    params.sicknessStartedDate &&
    !parseLocalDate(params.sicknessStartedDate)
  ) {
    return {
      ok: false,
      field: "sicknessStartedDate",
      message: "Enter a valid date",
    };
  }

  const todayIso = todayIsoInTimeZone(timeZone, params.now);
  if (isFutureIsoDate(params.sicknessEndedDate, todayIso)) {
    return {
      ok: false,
      field: "sicknessEndedDate",
      message: SICKNESS_ENDED_FUTURE_MESSAGE,
    };
  }
  if (params.sicknessEndedDate < params.firstWorkingDaySick) {
    return {
      ok: false,
      field: "sicknessEndedDate",
      message: SICKNESS_ENDED_BEFORE_FIRST_DAY_MESSAGE,
    };
  }
  if (
    params.sicknessStartedDate &&
    params.sicknessEndedDate < params.sicknessStartedDate
  ) {
    return {
      ok: false,
      field: "sicknessEndedDate",
      message: SICKNESS_ENDED_BEFORE_STARTED_MESSAGE,
    };
  }

  return { ok: true, sicknessEndedDate: endedDate };
}

export function correctionConflictsWithEndedEpisode(params: {
  firstWorkingDaySickIso: string;
  sicknessStartedDateIso: string | null;
  episodeState: SicknessEpisodeState;
  sicknessEndedDateIso: string | null;
}): { field: "firstWorkingDaySick" | "sicknessStartedDate"; message: string } | null {
  if (params.episodeState !== "ENDED" || !params.sicknessEndedDateIso) {
    return null;
  }
  if (params.firstWorkingDaySickIso > params.sicknessEndedDateIso) {
    return {
      field: "firstWorkingDaySick",
      message: SICKNESS_CORRECT_AFTER_END_DATE_MESSAGE,
    };
  }
  if (
    params.sicknessStartedDateIso &&
    params.sicknessStartedDateIso > params.sicknessEndedDateIso
  ) {
    return {
      field: "sicknessStartedDate",
      message: SICKNESS_CORRECT_STARTED_AFTER_END_DATE_MESSAGE,
    };
  }
  return null;
}

export function episodeUpdateRequiresCorrectionReason(params: {
  currentState: SicknessEpisodeState;
  currentEndedDateIso: string | null;
  nextState: SicknessEpisodeUpdateState;
  nextEndedDateIso: string | null;
}): boolean {
  if (params.currentState !== "ENDED") {
    return false;
  }
  if (params.nextState === "ONGOING") {
    return true;
  }
  return params.nextEndedDateIso !== params.currentEndedDateIso;
}

export function episodeUpdateRequiresClearConfirmation(params: {
  currentState: SicknessEpisodeState;
  nextState: SicknessEpisodeUpdateState;
}): boolean {
  return params.currentState === "ENDED" && params.nextState === "ONGOING";
}

export type SicknessEpisodeUpdateEligibility =
  | {
      ok: true;
      episodeState: SicknessEpisodeUpdateState;
      sicknessEndedDate: Date | null;
      requiresCorrectionReason: boolean;
      requiresClearConfirmation: boolean;
    }
  | { ok: false; field: string; message: string };

export function evaluateSicknessEpisodeUpdate(params: {
  currentState: SicknessEpisodeState;
  currentEndedDateIso: string | null;
  nextState: SicknessEpisodeUpdateState;
  nextEndedDateIso: string | null;
  firstWorkingDaySick: string;
  sicknessStartedDate: string | null;
  correctionReason: string | null;
  confirmClearEndDate: boolean;
  timeZone: string;
  now?: Date;
}): SicknessEpisodeUpdateEligibility {
  if (params.nextState === "ONGOING" && params.nextEndedDateIso) {
    return {
      ok: false,
      field: "sicknessEndedDate",
      message: SICKNESS_ENDED_FORBIDDEN_WHEN_ONGOING_MESSAGE,
    };
  }

  let sicknessEndedDate: Date | null = null;
  if (params.nextState === "ENDED") {
    const dates = evaluateSicknessEndedDate({
      sicknessEndedDate: params.nextEndedDateIso,
      firstWorkingDaySick: params.firstWorkingDaySick,
      sicknessStartedDate: params.sicknessStartedDate,
      timeZone: params.timeZone,
      now: params.now,
    });
    if (!dates.ok) {
      return dates;
    }
    sicknessEndedDate = dates.sicknessEndedDate;
  }

  const nextEndedDateIso = sicknessEndedDate
    ? params.nextEndedDateIso
    : null;
  const unchanged =
    params.currentState === params.nextState &&
    (params.currentEndedDateIso ?? null) === (nextEndedDateIso ?? null);
  if (unchanged) {
    return {
      ok: false,
      field: "form",
      message: SICKNESS_NO_CHANGE_MESSAGE,
    };
  }

  const requiresCorrectionReason = episodeUpdateRequiresCorrectionReason({
    currentState: params.currentState,
    currentEndedDateIso: params.currentEndedDateIso,
    nextState: params.nextState,
    nextEndedDateIso: nextEndedDateIso,
  });
  if (requiresCorrectionReason && !params.correctionReason) {
    return {
      ok: false,
      field: "correctionReason",
      message: "Correction reason must be at least 2 characters",
    };
  }

  const requiresClearConfirmation = episodeUpdateRequiresClearConfirmation({
    currentState: params.currentState,
    nextState: params.nextState,
  });
  if (requiresClearConfirmation && !params.confirmClearEndDate) {
    return {
      ok: false,
      field: "confirmClearEndDate",
      message: SICKNESS_EPISODE_CONFIRM_CLEAR_MESSAGE,
    };
  }

  return {
    ok: true,
    episodeState: params.nextState,
    sicknessEndedDate,
    requiresCorrectionReason,
    requiresClearConfirmation,
  };
}

export function sicknessEpisodeHistoryChanges(params: {
  previousState: SicknessEpisodeState;
  nextState: SicknessEpisodeState;
  previousEndedDateIso: string | null;
  nextEndedDateIso: string | null;
}): { field: string; previous: string | null; next: string | null }[] {
  return [
    {
      field: "episodeState",
      previous: params.previousState,
      next: params.nextState,
    },
    {
      field: "sicknessEndedDate",
      previous: params.previousEndedDateIso,
      next: params.nextEndedDateIso,
    },
  ];
}
