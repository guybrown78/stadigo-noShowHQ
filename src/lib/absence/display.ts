import type {
  AbsenceFollowUpStatus,
  AbsenceHistoryAction,
  AbsenceNoticeBasis,
  AbsenceRecordStatus,
  AbsenceType,
} from "@prisma/client";
import { formatLocalDateDisplay } from "@/lib/events/dates";

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  CANCELLATION: "Cancellation",
  AWOL: "AWOL",
  SICKNESS: "Sickness",
};

export const FOLLOW_UP_STATUS_LABELS: Record<AbsenceFollowUpStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  NOT_REQUIRED: "Not required",
};

export const FOLLOW_UP_STATUS_STYLES: Record<AbsenceFollowUpStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  IN_PROGRESS: "bg-sky-100 text-sky-900",
  COMPLETED: "bg-emerald-100 text-emerald-900",
  NOT_REQUIRED: "bg-slate-100 text-slate-700",
};

export const RECORD_STATUS_LABELS: Record<AbsenceRecordStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const NOTICE_BASIS_LABELS: Record<AbsenceNoticeBasis, string> = {
  EXACT_TIME: "Exact time",
  CALENDAR_DATE: "Calendar date",
};

export const HISTORY_ACTION_LABELS: Record<AbsenceHistoryAction, string> = {
  CREATED: "Created",
  CORRECTED: "Corrected",
  ARCHIVED: "Archived",
};

export const HISTORY_FIELD_LABELS: Record<string, string> = {
  staffId: "Staff",
  eventId: "Event",
  reportedDate: "Reported date",
  reportedTime: "Reported time",
  reason: "Reason",
  notes: "Internal notes",
  noticeCalendarDays: "Notice (calendar days)",
  noticeMinutes: "Notice (minutes)",
  noticeBasis: "Notice basis",
  isShortNotice: "Short notice",
  eventNameSnapshot: "Event name snapshot",
  eventDateSnapshot: "Event date snapshot",
  eventStartTimeSnapshot: "Event start time snapshot",
  venueNameSnapshot: "Venue snapshot",
  recordStatus: "Record status",
};

export function formatCalendarNotice(days: number): string {
  const abs = Math.abs(days);
  const unit = abs === 1 ? "day" : "days";
  if (days < 0) {
    return `−${abs} ${unit}`;
  }
  return `${days} ${unit}`;
}

export function formatDurationMinutes(totalMinutes: number): string {
  const negative = totalMinutes < 0;
  let remaining = Math.abs(totalMinutes);
  const days = Math.floor(remaining / (24 * 60));
  remaining %= 24 * 60;
  const hours = Math.floor(remaining / 60);
  const minutes = remaining % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }
  const text = parts.join(" ");
  return negative ? `−${text}` : text;
}

export function formatNoticeSummary(detail: {
  noticeCalendarDays: number;
  noticeMinutes: number | null;
  noticeBasis: AbsenceNoticeBasis;
}): string {
  const calendar = formatCalendarNotice(detail.noticeCalendarDays);
  if (detail.noticeBasis === "EXACT_TIME" && detail.noticeMinutes != null) {
    return `${formatDurationMinutes(detail.noticeMinutes)} (${calendar} by date)`;
  }
  return calendar;
}

export function formatHistoryValue(field: string, value: string | null): string {
  if (value == null || value === "") {
    return "none";
  }
  if (field === "eventDateSnapshot" || field === "reportedDate") {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return formatLocalDateDisplay(date);
    }
  }
  if (field === "isShortNotice") {
    return value === "true" ? "Yes" : "No";
  }
  if (field === "noticeBasis") {
    return NOTICE_BASIS_LABELS[value as AbsenceNoticeBasis] ?? value;
  }
  return value;
}

export function truncateReason(reason: string, max = 80): string {
  const trimmed = reason.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}
