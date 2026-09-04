import { formatLocalDateIso, parseLocalDate, parseLocalTime } from "@/lib/events/dates";
import {
  OPERATING_TIMEZONE,
  SHORT_NOTICE_MINUTES,
} from "@/lib/absence/catalog";

export type NoticeBasis = "EXACT_TIME" | "CALENDAR_DATE";

export type NoticeCalculation = {
  noticeCalendarDays: number;
  noticeMinutes: number | null;
  noticeBasis: NoticeBasis;
  isShortNotice: boolean;
  isRetrospective: boolean;
};

/**
 * Coerce a Date or date-like string to YYYY-MM-DD.
 * Accepts plain calendar dates and ISO datetimes (uses the calendar date prefix).
 * Returns null instead of throwing so UI preview can stay mounted.
 */
export function coerceLocalDateIso(value: Date | string): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed =
      parseLocalDate(trimmed) ??
      // Server-action / JSON Date revival sometimes yields a full ISO datetime.
      (trimmed.length >= 10 ? parseLocalDate(trimmed.slice(0, 10)) : null);
    return parsed ? formatLocalDateIso(parsed) : null;
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  return formatLocalDateIso(value);
}

function dateIso(value: Date | string): string {
  const iso = coerceLocalDateIso(value);
  if (!iso) {
    throw new Error("Invalid calendar date");
  }
  return iso;
}

function calendarDaysBetweenIso(fromIso: string, toIso: string): number {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) {
    throw new Error("Invalid calendar date");
  }
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Convert a Europe/London wall-clock date+time to a UTC instant. */
export function londonWallClockToUtc(dateIso: string, timeHHmm: string): Date {
  const date = parseLocalDate(dateIso);
  const time = parseLocalTime(timeHHmm);
  if (!date || !time) {
    throw new Error("Invalid London date or time");
  }
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = timeZoneOffsetMs(new Date(utcGuess), OPERATING_TIMEZONE);
  let result = utcGuess - offsetMs;
  const adjustedOffset = timeZoneOffsetMs(new Date(result), OPERATING_TIMEZONE);
  if (adjustedOffset !== offsetMs) {
    result = utcGuess - adjustedOffset;
  }
  return new Date(result);
}

export function calculateNotice(params: {
  eventDate: Date | string;
  eventStartTime: string | null | undefined;
  reportedDate: Date | string;
  reportedTime: string | null | undefined;
}): NoticeCalculation {
  const eventDateIso = dateIso(params.eventDate);
  const reportedDateIso = dateIso(params.reportedDate);
  return calculateNoticeFromIso({
    eventDateIso,
    reportedDateIso,
    eventStartTime: params.eventStartTime,
    reportedTime: params.reportedTime,
  });
}

/**
 * Same rules as calculateNotice, but returns null for incomplete/invalid dates
 * instead of throwing. Use this from form preview so a bad intermediate date
 * cannot unmount the page.
 */
export function previewNotice(params: {
  eventDate: Date | string | null | undefined;
  eventStartTime: string | null | undefined;
  reportedDate: Date | string | null | undefined;
  reportedTime: string | null | undefined;
}): NoticeCalculation | null {
  if (params.eventDate == null || params.reportedDate == null) {
    return null;
  }
  if (typeof params.reportedDate === "string" && !params.reportedDate.trim()) {
    return null;
  }
  const eventDateIso = coerceLocalDateIso(params.eventDate);
  const reportedDateIso = coerceLocalDateIso(params.reportedDate);
  if (!eventDateIso || !reportedDateIso) {
    return null;
  }
  return calculateNoticeFromIso({
    eventDateIso,
    reportedDateIso,
    eventStartTime: params.eventStartTime,
    reportedTime: params.reportedTime,
  });
}

function calculateNoticeFromIso(params: {
  eventDateIso: string;
  reportedDateIso: string;
  eventStartTime: string | null | undefined;
  reportedTime: string | null | undefined;
}): NoticeCalculation {
  const noticeCalendarDays = calendarDaysBetweenIso(
    params.reportedDateIso,
    params.eventDateIso,
  );
  const eventStartTime = params.eventStartTime
    ? parseLocalTime(params.eventStartTime)
    : null;
  const reportedTime = params.reportedTime
    ? parseLocalTime(params.reportedTime)
    : null;

  if (eventStartTime && reportedTime) {
    const eventInstant = londonWallClockToUtc(params.eventDateIso, eventStartTime);
    const reportedInstant = londonWallClockToUtc(
      params.reportedDateIso,
      reportedTime,
    );
    const noticeMinutes = Math.round(
      (eventInstant.getTime() - reportedInstant.getTime()) / 60_000,
    );
    return {
      noticeCalendarDays,
      noticeMinutes,
      noticeBasis: "EXACT_TIME",
      isShortNotice: noticeMinutes < SHORT_NOTICE_MINUTES,
      isRetrospective: noticeMinutes < 0,
    };
  }

  return {
    noticeCalendarDays,
    noticeMinutes: null,
    noticeBasis: "CALENDAR_DATE",
    isShortNotice: noticeCalendarDays <= 0,
    isRetrospective: noticeCalendarDays < 0,
  };
}
