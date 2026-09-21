import type {
  AbsenceFollowUpStatus,
  AbsenceHistoryAction,
  AbsenceNoticeBasis,
  AbsenceRecordStatus,
  AbsenceType,
} from "@prisma/client";
import {
  NOTES_PREVIEW_MAX_LENGTH,
  type LedgerView,
} from "@/lib/absence/catalog";
import { formatLocalDateDisplay } from "@/lib/events/dates";

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  CANCELLATION: "Cancellation",
  AWOL: "AWOL",
  SICKNESS: "Sickness",
};

export function ledgerViewDetailsLabel(type: AbsenceType): string {
  if (type === "AWOL") {
    return "View AWOL details";
  }
  if (type === "SICKNESS") {
    return "View Sickness details";
  }
  return "View Cancellation details";
}

export function absenceAllowsCorrectAndArchive(
  recordStatus: AbsenceRecordStatus,
): boolean {
  return recordStatus === "ACTIVE";
}

export function absenceCorrectActionLabel(type: AbsenceType): string {
  if (type === "AWOL") {
    return "Correct AWOL";
  }
  if (type === "SICKNESS") {
    return "Correct sickness report";
  }
  return "Correct cancellation";
}

export function absenceArchiveActionLabel(type: AbsenceType): string {
  if (type === "AWOL") {
    return "Archive AWOL";
  }
  if (type === "SICKNESS") {
    return "Archive sickness report";
  }
  return "Archive cancellation";
}

export const ABSENCE_DETAIL_LABEL = {
  staff: "Staff",
  event: "Event",
  eventDetails: "Event details",
  venue: "Venue",
  reported: "Reported",
  noticeGiven: "Notice given",
  reason: "Reason",
  internalNotes: "Internal notes",
  dateRecorded: "Date recorded",
  recordStatus: "Record status",
  dateSicknessReported: "Date sickness reported",
  firstDaySick: "First day sick from work",
  sicknessStarted: "Sickness started",
  issueSummary: "Issue summary",
  created: "Created",
  lastUpdated: "Last updated",
  archived: "Archived",
} as const;

export function absenceDetailShowsEvent(type: AbsenceType): boolean {
  return type !== "SICKNESS";
}

export function absenceDetailShowsVenue(type: AbsenceType): boolean {
  return type !== "SICKNESS";
}

export function absenceDetailBodyLabels(type: AbsenceType): readonly string[] {
  if (type === "SICKNESS") {
    return [
      ABSENCE_DETAIL_LABEL.staff,
      ABSENCE_DETAIL_LABEL.recordStatus,
      ABSENCE_DETAIL_LABEL.dateSicknessReported,
      ABSENCE_DETAIL_LABEL.firstDaySick,
      ABSENCE_DETAIL_LABEL.sicknessStarted,
      ABSENCE_DETAIL_LABEL.issueSummary,
      ABSENCE_DETAIL_LABEL.created,
    ];
  }
  if (type === "AWOL") {
    return [
      ABSENCE_DETAIL_LABEL.staff,
      ABSENCE_DETAIL_LABEL.event,
      ABSENCE_DETAIL_LABEL.eventDetails,
      ABSENCE_DETAIL_LABEL.dateRecorded,
      ABSENCE_DETAIL_LABEL.internalNotes,
      ABSENCE_DETAIL_LABEL.created,
      ABSENCE_DETAIL_LABEL.lastUpdated,
    ];
  }
  return [
    ABSENCE_DETAIL_LABEL.staff,
    ABSENCE_DETAIL_LABEL.event,
    ABSENCE_DETAIL_LABEL.venue,
    ABSENCE_DETAIL_LABEL.reported,
    ABSENCE_DETAIL_LABEL.noticeGiven,
    ABSENCE_DETAIL_LABEL.reason,
    ABSENCE_DETAIL_LABEL.internalNotes,
    ABSENCE_DETAIL_LABEL.created,
    ABSENCE_DETAIL_LABEL.lastUpdated,
  ];
}

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

export const SICKNESS_HISTORY_ACTION_LABELS: Record<AbsenceHistoryAction, string> =
  {
    CREATED: "Sickness report created",
    CORRECTED: "Sickness report corrected",
    ARCHIVED: "Sickness report archived",
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
  eventEndTimeSnapshot: "Event end time snapshot",
  eventReferenceSnapshot: "Event reference snapshot",
  eventTypeSnapshot: "Event type snapshot",
  eventSubtypeSnapshot: "Event subtype snapshot",
  venueNameSnapshot: "Venue snapshot",
  sameDayStartUnknownConfirmed: "Same-day confirmation",
  recordStatus: "Record status",
  firstWorkingDaySick: "First day sick from work",
  sicknessStartedDate: "Sickness started",
  issueSummary: "Issue summary",
  futureFirstWorkingDayConfirmed: "Advance report confirmed",
};

export const AWOL_HISTORY_FIELD_LABELS: Record<string, string> = {
  reportedDate: "Date recorded",
};

export const SICKNESS_HISTORY_FIELD_LABELS: Record<string, string> = {
  reportedDate: "Date sickness reported",
};

export function historyActionLabel(
  action: AbsenceHistoryAction,
  type?: AbsenceType,
): string {
  if (type === "SICKNESS") {
    return SICKNESS_HISTORY_ACTION_LABELS[action];
  }
  return HISTORY_ACTION_LABELS[action];
}

export function historyFieldLabel(
  field: string,
  type?: AbsenceType,
): string {
  if (type === "AWOL" && AWOL_HISTORY_FIELD_LABELS[field]) {
    return AWOL_HISTORY_FIELD_LABELS[field];
  }
  if (type === "SICKNESS" && SICKNESS_HISTORY_FIELD_LABELS[field]) {
    return SICKNESS_HISTORY_FIELD_LABELS[field];
  }
  return HISTORY_FIELD_LABELS[field] ?? field;
}

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

export function noticeWarningFlags(detail: {
  isShortNotice: boolean;
  noticeCalendarDays: number;
  noticeMinutes: number | null;
}): { shortNotice: boolean; retrospective: boolean } {
  return {
    shortNotice: detail.isShortNotice,
    retrospective:
      detail.noticeCalendarDays < 0 ||
      (detail.noticeMinutes != null && detail.noticeMinutes < 0),
  };
}

export function formatHistoryValue(field: string, value: string | null): string {
  if (value == null || value === "") {
    return "none";
  }
  if (
    field === "eventDateSnapshot" ||
    field === "reportedDate" ||
    field === "firstWorkingDaySick" ||
    field === "sicknessStartedDate" ||
    field === "futureFirstWorkingDayConfirmed"
  ) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return formatLocalDateDisplay(date);
    }
  }
  if (field === "isShortNotice" || field === "sameDayStartUnknownConfirmed") {
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

export function truncateNotes(notes: string | null | undefined, max = NOTES_PREVIEW_MAX_LENGTH): string | null {
  if (!notes) {
    return null;
  }
  return truncateReason(notes, max);
}

export const NO_INTERNAL_NOTES_RECORDED = "No internal notes recorded";
export const NO_SICKNESS_STARTED_RECORDED = "Not recorded";
export const NO_ISSUE_SUMMARY_RECORDED = "No issue summary recorded";

export function formatInternalNotes(notes: string | null | undefined): string {
  const trimmed = notes?.trim() ?? "";
  if (!trimmed) {
    return NO_INTERNAL_NOTES_RECORDED;
  }
  return trimmed;
}

export function formatIssueSummary(
  issueSummary: string | null | undefined,
): string {
  const trimmed = issueSummary?.trim() ?? "";
  if (!trimmed) {
    return NO_ISSUE_SUMMARY_RECORDED;
  }
  return trimmed;
}

export const LEDGER_EVENT_FILTER_HELP =
  "Venue and Event type filters apply only to Cancellations and AWOLs. Sickness records are not linked to an Event, so they will not appear when these filters are applied.";

export const LEDGER_EVENT_LINKED_SEARCH_PLACEHOLDER =
  "Staff name, Staff ID, Event name or reference";
export const LEDGER_SICKNESS_SEARCH_PLACEHOLDER = "Staff name or Staff ID";

export function ledgerSearchPlaceholder(view: LedgerView): string {
  if (view === "sickness") {
    return LEDGER_SICKNESS_SEARCH_PLACEHOLDER;
  }
  return LEDGER_EVENT_LINKED_SEARCH_PLACEHOLDER;
}

export function ledgerItemLabel(view: LedgerView): string {
  if (view === "awol") return "AWOLs";
  if (view === "sickness") return "Sickness reports";
  if (view === "cancellations") return "Cancellations";
  return "absences";
}

export function ledgerSingularNoun(view: LedgerView): string {
  if (view === "awol") return "AWOL";
  if (view === "sickness") return "Sickness report";
  if (view === "cancellations") return "Cancellation";
  return "absence";
}

export function ledgerActiveCountPhrase(
  view: LedgerView,
  count: number,
): string {
  if (view === "awol") {
    return count === 1 ? "active AWOL" : "active AWOLs";
  }
  if (view === "sickness") {
    return count === 1
      ? "active Sickness report"
      : "active Sickness reports";
  }
  if (view === "cancellations") {
    return count === 1 ? "active Cancellation" : "active Cancellations";
  }
  return count === 1 ? "active absence" : "active absences";
}

export function formatLedgerTypeCounts(counts: {
  CANCELLATION: number;
  AWOL: number;
  SICKNESS: number;
}): string {
  return [
    `Cancellations ${counts.CANCELLATION}`,
    `AWOL ${counts.AWOL}`,
    `Sickness ${counts.SICKNESS}`,
  ].join(", ");
}

export function formatLedgerResultsSummary(input: {
  view: LedgerView;
  total: number;
  activeTotal: number;
  matchingTypeCounts: {
    CANCELLATION: number;
    AWOL: number;
    SICKNESS: number;
  };
  activeTypeCounts: {
    CANCELLATION: number;
    AWOL: number;
    SICKNESS: number;
  };
  hasFilters: boolean;
  includeArchived: boolean;
  page: number;
  pageCount: number;
}): string[] {
  const pageSuffix =
    input.pageCount > 1 ? ` · Page ${input.page} of ${input.pageCount}` : "";

  if (!input.hasFilters) {
    const compact = `${input.activeTotal} ${ledgerActiveCountPhrase(input.view, input.activeTotal)}`;
    if (input.view === "all") {
      return [
        `${compact} · ${formatLedgerTypeCounts(input.activeTypeCounts)}${pageSuffix}`,
      ];
    }
    return [`${compact}${pageSuffix}`];
  }

  const matchingNoun =
    input.total === 1
      ? ledgerSingularNoun(input.view)
      : ledgerItemLabel(input.view);
  const archived = input.includeArchived ? ", including archived" : "";
  const lines = [
    `Showing ${input.total} matching ${matchingNoun}${archived}${pageSuffix}`,
  ];
  if (input.view === "all") {
    lines.push(
      `Matching types: ${formatLedgerTypeCounts(input.matchingTypeCounts)}`,
    );
  }
  lines.push(`Overall active total: ${input.activeTotal}`);
  return lines;
}

export const SICKNESS_INITIAL_REPORT_LABEL = "Initial sickness report";
