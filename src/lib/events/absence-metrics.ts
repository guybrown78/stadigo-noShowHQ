export type EventAbsenceNoticeBasis = "EXACT_TIME" | "CALENDAR_DATE";

export type EventAbsenceNotice = {
  noticeCalendarDays: number;
  noticeMinutes: number | null;
  noticeBasis: EventAbsenceNoticeBasis;
};

export type EventAbsenceFact = {
  type: "CANCELLATION" | "AWOL";
  reason: string | null;
  notice: EventAbsenceNotice | null;
};

export type FillStatus = "healthy" | "warning" | "critical";

export type CancellationWindowKey =
  | "retrospective"
  | "sameDay"
  | "oneToThree"
  | "fourToSeven"
  | "sevenPlus";

export type NoticeHourKey =
  | "retrospective"
  | "under12h"
  | "twelveTo24h"
  | "over24h";

export type EventAbsenceReasonCount = {
  reason: string;
  count: number;
};

export type EventAbsenceSummary = {
  staffRequired: number;
  warningFillRate: number;
  criticalFillRate: number;
  absences: number;
  cancellations: number;
  awols: number;
  covered: number;
  fillRate: number;
  fillStatus: FillStatus;
  exceedsRequirement: boolean;
  averageNoticeMinutes: number | null;
  averageNoticeCalendarDays: number | null;
  window: Record<CancellationWindowKey, number>;
  noticeHours: Record<NoticeHourKey, number>;
  exactTimeCancellations: number;
  dateOnlyCancellations: number;
  reasons: EventAbsenceReasonCount[];
};

const TWELVE_HOURS = 12 * 60;
const TWENTY_FOUR_HOURS = 24 * 60;

export function summariseEventAbsences(params: {
  staffRequired: number;
  warningFillRate: number;
  criticalFillRate: number;
  absences: EventAbsenceFact[];
}): EventAbsenceSummary {
  const cancellations = params.absences.filter(
    (absence) => absence.type === "CANCELLATION",
  );
  const awols = params.absences.length - cancellations.length;
  const staffRequired = params.staffRequired;
  const covered = Math.max(0, staffRequired - params.absences.length);
  const fillRate = fillRatePercent(staffRequired, covered);
  const window = emptyWindow();
  const noticeHours = emptyNoticeHours();
  const minuteValues: number[] = [];
  const dayValues: number[] = [];
  const reasonCounts = new Map<string, number>();
  let exactTimeCancellations = 0;
  let dateOnlyCancellations = 0;

  for (const absence of cancellations) {
    const notice = absence.notice;
    if (!notice) {
      dateOnlyCancellations += 1;
      continue;
    }
    window[cancellationWindow(notice.noticeCalendarDays)] += 1;
    dayValues.push(notice.noticeCalendarDays);
    if (notice.noticeBasis === "EXACT_TIME" && notice.noticeMinutes != null) {
      exactTimeCancellations += 1;
      minuteValues.push(notice.noticeMinutes);
      noticeHours[noticeHourBucket(notice.noticeMinutes)] += 1;
    } else {
      dateOnlyCancellations += 1;
    }
    const reason = absence.reason?.trim();
    if (reason) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  return {
    staffRequired,
    warningFillRate: params.warningFillRate,
    criticalFillRate: params.criticalFillRate,
    absences: params.absences.length,
    cancellations: cancellations.length,
    awols,
    covered,
    fillRate,
    fillStatus: fillStatus(fillRate, params.warningFillRate, params.criticalFillRate),
    exceedsRequirement: params.absences.length > staffRequired,
    averageNoticeMinutes: meanRounded(minuteValues),
    averageNoticeCalendarDays: meanRounded(dayValues),
    window,
    noticeHours,
    exactTimeCancellations,
    dateOnlyCancellations,
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort(
        (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
      ),
  };
}

function fillRatePercent(staffRequired: number, covered: number): number {
  if (staffRequired <= 0) {
    return 0;
  }
  return Math.round((covered / staffRequired) * 100);
}

function fillStatus(
  fillRate: number,
  warningFillRate: number,
  criticalFillRate: number,
): FillStatus {
  if (fillRate < criticalFillRate) {
    return "critical";
  }
  if (fillRate < warningFillRate) {
    return "warning";
  }
  return "healthy";
}

function cancellationWindow(days: number): CancellationWindowKey {
  if (days < 0) {
    return "retrospective";
  }
  if (days === 0) {
    return "sameDay";
  }
  if (days <= 3) {
    return "oneToThree";
  }
  if (days <= 7) {
    return "fourToSeven";
  }
  return "sevenPlus";
}

function noticeHourBucket(minutes: number): NoticeHourKey {
  if (minutes < 0) {
    return "retrospective";
  }
  if (minutes < TWELVE_HOURS) {
    return "under12h";
  }
  if (minutes <= TWENTY_FOUR_HOURS) {
    return "twelveTo24h";
  }
  return "over24h";
}

function meanRounded(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

function emptyWindow(): Record<CancellationWindowKey, number> {
  return {
    retrospective: 0,
    sameDay: 0,
    oneToThree: 0,
    fourToSeven: 0,
    sevenPlus: 0,
  };
}

function emptyNoticeHours(): Record<NoticeHourKey, number> {
  return {
    retrospective: 0,
    under12h: 0,
    twelveTo24h: 0,
    over24h: 0,
  };
}
