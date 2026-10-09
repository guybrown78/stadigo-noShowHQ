import type { AbsenceType } from "@prisma/client";
import {
  ABSENCE_DETAIL_LABEL,
  ABSENCE_TYPE_LABELS,
  NOTICE_BASIS_LABELS,
  RECORD_STATUS_LABELS,
  formatNoticeSummary,
  ledgerFullPageLabel,
  noticeWarningFlags,
} from "@/lib/absence/display";
import { ledgerStaffDisplay, type LedgerAbsenceRow } from "@/lib/absence/ledger-query";
import {
  NO_SICKNESS_STARTED_RECORDED,
  SICKNESS_CALENDAR_DAY_SPAN_HINT,
  formatCalendarDaySpan,
  inclusiveCalendarDaySpan,
  sicknessEpisodeStateLabel,
} from "@/lib/absence/sickness";
import { formatLocalDateDisplay, formatLocalDateIso } from "@/lib/events/dates";
import { formatStaffName } from "@/lib/staff/display";

export type LedgerDrawerPreviewField = {
  label: string;
  lines: string[];
  href?: string;
  hints?: string[];
};

export type LedgerDrawerPreview = {
  id: string;
  type: AbsenceType;
  recordStatus: "ACTIVE" | "ARCHIVED";
  statusLabel: string;
  heading: string;
  fullPageLabel: string;
  staffName: string;
  staffIdNumber: string;
  staffHref: string | null;
  fields: LedgerDrawerPreviewField[];
  pendingLabels: string[];
  sectionSkeletons: string[];
};

const ACTIVE_RECORD_HINT =
  "Active means this record is in operational views. It does not mean the staff member is still sick.";

const EPISODE_HINT = {
  ENDED:
    "Ended means an end date was recorded. It does not mean recovered, fit for work, returned to work or archived.",
  ONGOING:
    "Ongoing means the organisation has confirmed that no end date has been recorded yet.",
  NOT_CONFIRMED:
    "Sickness status not yet confirmed means no end date and no ongoing confirmation has been recorded.",
} as const;

function eventHref(row: LedgerAbsenceRow): string | null {
  if (!row.event || row.event.deletedAt) {
    return null;
  }
  return `/events/${row.event.id}`;
}

function staffHref(row: LedgerAbsenceRow): string | null {
  const staff = ledgerStaffDisplay(row);
  if (staff.deletedAt) {
    return null;
  }
  return `/staff/${staff.id}`;
}

function archivedLabel(row: LedgerAbsenceRow): string[] {
  return row.recordStatus === "ARCHIVED" ? [ABSENCE_DETAIL_LABEL.archived] : [];
}

function sharedSections(type: AbsenceType): string[] {
  const sections = ["Follow-ups", "History"];
  if (type === "SICKNESS") {
    return ["Evidence", "Return to work", ...sections];
  }
  return sections;
}

function cancellationPreview(row: LedgerAbsenceRow): LedgerDrawerPreviewField[] {
  const detail = row.cancellation;
  if (!detail) {
    return [];
  }
  const warnings = noticeWarningFlags(detail);
  const noticeHints = [
    `Calculated using ${NOTICE_BASIS_LABELS[detail.noticeBasis].toLowerCase()}`,
  ];
  if (warnings.shortNotice) {
    noticeHints.push("Short notice");
  }
  if (warnings.retrospective) {
    noticeHints.push("Retrospective / late record");
  }
  const reported = formatLocalDateDisplay(row.reportedDate);
  return [
    {
      label: ABSENCE_DETAIL_LABEL.event,
      lines: [detail.eventNameSnapshot],
      href: eventHref(row) ?? undefined,
      hints: [formatLocalDateDisplay(detail.eventDateSnapshot)],
    },
    {
      label: ABSENCE_DETAIL_LABEL.venue,
      lines: [detail.venueNameSnapshot ?? "No venue recorded"],
    },
    {
      label: ABSENCE_DETAIL_LABEL.reported,
      lines: [row.reportedTime ? `${reported} · ${row.reportedTime}` : reported],
    },
    {
      label: ABSENCE_DETAIL_LABEL.noticeGiven,
      lines: [formatNoticeSummary(detail)],
      hints: noticeHints,
    },
  ];
}

function awolPreview(row: LedgerAbsenceRow): LedgerDrawerPreviewField[] {
  const detail = row.awol;
  if (!detail) {
    return [];
  }
  const href = eventHref(row);
  const recorded = formatLocalDateDisplay(row.reportedDate);
  const eventDate = formatLocalDateDisplay(detail.eventDateSnapshot);
  return [
    {
      label: ABSENCE_DETAIL_LABEL.event,
      lines: [detail.eventNameSnapshot],
      href: href ?? undefined,
      hints: [eventDate],
    },
    {
      label: ABSENCE_DETAIL_LABEL.eventDetails,
      lines: [
        detail.eventNameSnapshot,
        `${detail.eventReferenceSnapshot ?? "No reference"} · ${eventDate}`,
        detail.venueNameSnapshot ?? "No venue recorded",
        detail.eventTypeSnapshot ?? "Unspecified",
      ],
      href: href ?? undefined,
    },
    {
      label: ABSENCE_DETAIL_LABEL.dateRecorded,
      lines: [recorded],
    },
  ];
}

function sicknessPreview(row: LedgerAbsenceRow): LedgerDrawerPreviewField[] {
  const detail = row.sickness;
  if (!detail) {
    return [];
  }
  const ended = detail.episodeState === "ENDED" && detail.sicknessEndedDate;
  const fields: LedgerDrawerPreviewField[] = [
    {
      label: ABSENCE_DETAIL_LABEL.recordStatus,
      lines: [RECORD_STATUS_LABELS[row.recordStatus]],
      hints:
        row.recordStatus === "ACTIVE" ? [ACTIVE_RECORD_HINT] : undefined,
    },
    {
      label: ABSENCE_DETAIL_LABEL.episodeStatus,
      lines: [sicknessEpisodeStateLabel(detail.episodeState)],
      hints: [EPISODE_HINT[detail.episodeState]],
    },
    {
      label: ABSENCE_DETAIL_LABEL.dateSicknessReported,
      lines: [formatLocalDateDisplay(row.reportedDate)],
    },
    {
      label: ABSENCE_DETAIL_LABEL.firstDaySick,
      lines: [formatLocalDateDisplay(detail.firstWorkingDaySick)],
    },
    {
      label: ABSENCE_DETAIL_LABEL.sicknessStarted,
      lines: [
        detail.sicknessStartedDate
          ? formatLocalDateDisplay(detail.sicknessStartedDate)
          : NO_SICKNESS_STARTED_RECORDED,
      ],
    },
  ];
  if (ended && detail.sicknessEndedDate) {
    fields.push({
      label: ABSENCE_DETAIL_LABEL.sicknessEnded,
      lines: [formatLocalDateDisplay(detail.sicknessEndedDate)],
    });
    const span = inclusiveCalendarDaySpan(
      formatLocalDateIso(detail.firstWorkingDaySick),
      formatLocalDateIso(detail.sicknessEndedDate),
    );
    if (span != null) {
      fields.push({
        label: ABSENCE_DETAIL_LABEL.calendarDaySpan,
        lines: [formatCalendarDaySpan(span)],
        hints: [SICKNESS_CALENDAR_DAY_SPAN_HINT],
      });
    }
  }
  return fields;
}

function pendingLabels(row: LedgerAbsenceRow): string[] {
  if (row.type === "SICKNESS") {
    return [
      ABSENCE_DETAIL_LABEL.issueSummary,
      ABSENCE_DETAIL_LABEL.created,
      ...archivedLabel(row),
    ];
  }
  if (row.type === "AWOL") {
    return [
      ABSENCE_DETAIL_LABEL.internalNotes,
      ABSENCE_DETAIL_LABEL.created,
      ABSENCE_DETAIL_LABEL.lastUpdated,
      ...archivedLabel(row),
    ];
  }
  return [
    ABSENCE_DETAIL_LABEL.reason,
    ABSENCE_DETAIL_LABEL.internalNotes,
    ABSENCE_DETAIL_LABEL.created,
    ABSENCE_DETAIL_LABEL.lastUpdated,
    ...archivedLabel(row),
  ];
}

export function toLedgerDrawerPreview(
  row: LedgerAbsenceRow,
): LedgerDrawerPreview {
  const staff = ledgerStaffDisplay(row);
  const heading =
    row.type === "SICKNESS" && row.sickness
      ? sicknessEpisodeStateLabel(row.sickness.episodeState)
      : ABSENCE_TYPE_LABELS[row.type];
  const fields =
    row.type === "AWOL"
      ? awolPreview(row)
      : row.type === "SICKNESS"
        ? sicknessPreview(row)
        : cancellationPreview(row);
  return {
    id: row.id,
    type: row.type,
    recordStatus: row.recordStatus,
    statusLabel: RECORD_STATUS_LABELS[row.recordStatus],
    heading,
    fullPageLabel: ledgerFullPageLabel(row.type),
    staffName: formatStaffName(staff),
    staffIdNumber: staff.staffIdNumber,
    staffHref: staffHref(row),
    fields,
    pendingLabels: pendingLabels(row),
    sectionSkeletons: sharedSections(row.type),
  };
}
