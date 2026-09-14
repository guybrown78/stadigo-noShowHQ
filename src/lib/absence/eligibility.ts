import { coerceLocalDateIso } from "@/lib/absence/notice";
import {
  TENANT_TIMEZONE_ERROR,
  requireIanaTimeZone,
  timeHHmmInTimeZone,
  todayIsoInTimeZone,
  wallClockToUtc,
} from "@/lib/absence/timezone";
import { parseLocalTime } from "@/lib/events/dates";

export const SAME_DAY_CONFIRMATION_MESSAGE =
  "Confirm that the staff member was expected and has failed to attend this Event.";
export const FUTURE_EVENT_MESSAGE =
  "AWOL can only be recorded for an Event that has started or has passed.";
export const EVENT_NOT_STARTED_MESSAGE =
  "This Event has not started yet. AWOL can be recorded at or after the Event start time.";
export const DATE_RECORDED_FUTURE_MESSAGE =
  "Date recorded cannot be in the future.";
export const DATE_RECORDED_BEFORE_EVENT_MESSAGE =
  "Date recorded cannot be earlier than the Event date.";

export type EventEligibility =
  | { ok: true; requiresSameDayConfirmation: boolean }
  | {
      ok: false;
      field: "eventId" | "sameDayStartUnknownConfirmed" | "timezone";
      message: string;
    };

export type ReportedDateEligibility =
  | { ok: true }
  | { ok: false; field: "reportedDate" | "timezone"; message: string };

export function evaluateAwolEventEligibility(params: {
  eventDate: Date | string;
  eventStartTime: string | null | undefined;
  sameDayStartUnknownConfirmed: boolean;
  timeZone: string;
  now?: Date;
}): EventEligibility {
  let timeZone: string;
  try {
    timeZone = requireIanaTimeZone(params.timeZone);
  } catch {
    return { ok: false, field: "timezone", message: TENANT_TIMEZONE_ERROR };
  }

  const eventDateIso = coerceLocalDateIso(params.eventDate);
  if (!eventDateIso) {
    return { ok: false, field: "eventId", message: "Select a valid event" };
  }

  const now = params.now ?? new Date();
  const todayIso = todayIsoInTimeZone(timeZone, now);

  if (eventDateIso > todayIso) {
    return { ok: false, field: "eventId", message: FUTURE_EVENT_MESSAGE };
  }

  if (eventDateIso < todayIso) {
    return { ok: true, requiresSameDayConfirmation: false };
  }

  const startTime = params.eventStartTime
    ? parseLocalTime(params.eventStartTime)
    : null;
  if (startTime) {
    const eventStart = wallClockToUtc(eventDateIso, startTime, timeZone);
    if (now.getTime() < eventStart.getTime()) {
      return { ok: false, field: "eventId", message: EVENT_NOT_STARTED_MESSAGE };
    }
    return { ok: true, requiresSameDayConfirmation: false };
  }

  if (!params.sameDayStartUnknownConfirmed) {
    return {
      ok: false,
      field: "sameDayStartUnknownConfirmed",
      message: SAME_DAY_CONFIRMATION_MESSAGE,
    };
  }
  return { ok: true, requiresSameDayConfirmation: true };
}

export function previewAwolEventEligibility(params: {
  eventDate: Date | string | null | undefined;
  eventStartTime: string | null | undefined;
  sameDayStartUnknownConfirmed: boolean;
  timeZone: string;
  now?: Date;
}): EventEligibility | null {
  if (params.eventDate == null) {
    return null;
  }
  if (typeof params.eventDate === "string" && !params.eventDate.trim()) {
    return null;
  }
  const eventDateIso = coerceLocalDateIso(params.eventDate);
  if (!eventDateIso) {
    return null;
  }
  return evaluateAwolEventEligibility({
    eventDate: eventDateIso,
    eventStartTime: params.eventStartTime,
    sameDayStartUnknownConfirmed: params.sameDayStartUnknownConfirmed,
    timeZone: params.timeZone,
    now: params.now,
  });
}

export function evaluateAwolReportedDate(params: {
  reportedDate: Date | string;
  eventDate: Date | string;
  timeZone: string;
  now?: Date;
}): ReportedDateEligibility {
  let timeZone: string;
  try {
    timeZone = requireIanaTimeZone(params.timeZone);
  } catch {
    return { ok: false, field: "timezone", message: TENANT_TIMEZONE_ERROR };
  }

  const reportedIso = coerceLocalDateIso(params.reportedDate);
  const eventIso = coerceLocalDateIso(params.eventDate);
  if (!reportedIso) {
    return { ok: false, field: "reportedDate", message: "Enter a valid date" };
  }
  if (!eventIso) {
    return { ok: false, field: "reportedDate", message: "Select a valid event" };
  }

  const todayIso = todayIsoInTimeZone(timeZone, params.now ?? new Date());
  if (reportedIso > todayIso) {
    return {
      ok: false,
      field: "reportedDate",
      message: DATE_RECORDED_FUTURE_MESSAGE,
    };
  }
  if (reportedIso < eventIso) {
    return {
      ok: false,
      field: "reportedDate",
      message: DATE_RECORDED_BEFORE_EVENT_MESSAGE,
    };
  }
  return { ok: true };
}

export function requiresSameDayUnknownStartConfirmation(params: {
  eventDate: Date | string;
  eventStartTime: string | null | undefined;
  timeZone: string;
  now?: Date;
}): boolean {
  const eventDateIso = coerceLocalDateIso(params.eventDate);
  if (!eventDateIso) {
    return false;
  }
  const timeZone = requireIanaTimeZone(params.timeZone);
  const todayIso = todayIsoInTimeZone(timeZone, params.now ?? new Date());
  if (eventDateIso !== todayIso) {
    return false;
  }
  return !parseLocalTime(params.eventStartTime ?? "");
}

export function tenantNowParts(timeZone: string, now: Date = new Date()) {
  return {
    todayIso: todayIsoInTimeZone(timeZone, now),
    timeHHmm: timeHHmmInTimeZone(timeZone, now),
  };
}
