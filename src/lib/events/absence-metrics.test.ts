import { describe, expect, it } from "vitest";
import {
  summariseEventAbsences,
  type EventAbsenceFact,
} from "@/lib/events/absence-metrics";

const thresholds = {
  staffRequired: 10,
  warningFillRate: 90,
  criticalFillRate: 85,
};

function cancellation(
  days: number,
  options?: {
    minutes?: number | null;
    basis?: "EXACT_TIME" | "CALENDAR_DATE";
    reason?: string | null;
  },
): EventAbsenceFact {
  const basis = options?.basis ?? (options?.minutes == null ? "CALENDAR_DATE" : "EXACT_TIME");
  return {
    type: "CANCELLATION",
    reason: options?.reason ?? null,
    notice: {
      noticeCalendarDays: days,
      noticeMinutes: options?.minutes === undefined ? null : options.minutes,
      noticeBasis: basis,
    },
  };
}

function awol(): EventAbsenceFact {
  return { type: "AWOL", reason: null, notice: null };
}

describe("summariseEventAbsences", () => {
  it("reports a full fill rate when nothing is logged", () => {
    const summary = summariseEventAbsences({ ...thresholds, absences: [] });
    expect(summary.fillRate).toBe(100);
    expect(summary.fillStatus).toBe("healthy");
    expect(summary.covered).toBe(10);
    expect(summary.absences).toBe(0);
    expect(summary.averageNoticeMinutes).toBeNull();
    expect(summary.averageNoticeCalendarDays).toBeNull();
    expect(summary.exceedsRequirement).toBe(false);
  });

  it("stays healthy at the warning threshold and warns at the critical threshold", () => {
    const atWarning = summariseEventAbsences({
      ...thresholds,
      absences: [cancellation(2)],
    });
    expect(atWarning.fillRate).toBe(90);
    expect(atWarning.fillStatus).toBe("healthy");

    const atCritical = summariseEventAbsences({
      staffRequired: 20,
      warningFillRate: 90,
      criticalFillRate: 85,
      absences: Array.from({ length: 3 }, () => cancellation(1)),
    });
    expect(atCritical.fillRate).toBe(85);
    expect(atCritical.fillStatus).toBe("warning");

    const justUnderWarning = summariseEventAbsences({
      staffRequired: 100,
      warningFillRate: 90,
      criticalFillRate: 85,
      absences: Array.from({ length: 11 }, () => awol()),
    });
    expect(justUnderWarning.fillRate).toBe(89);
    expect(justUnderWarning.fillStatus).toBe("warning");
  });

  it("is critical below the critical threshold", () => {
    const summary = summariseEventAbsences({
      staffRequired: 100,
      warningFillRate: 90,
      criticalFillRate: 85,
      absences: Array.from({ length: 16 }, () => awol()),
    });
    expect(summary.fillRate).toBe(84);
    expect(summary.fillStatus).toBe("critical");
  });

  it("floors the fill rate at zero when absences exceed staff required", () => {
    const summary = summariseEventAbsences({
      staffRequired: 2,
      warningFillRate: 90,
      criticalFillRate: 85,
      absences: [cancellation(0), awol(), awol()],
    });
    expect(summary.covered).toBe(0);
    expect(summary.fillRate).toBe(0);
    expect(summary.fillStatus).toBe("critical");
    expect(summary.exceedsRequirement).toBe(true);
    expect(summary.cancellations).toBe(1);
    expect(summary.awols).toBe(2);
  });

  it("buckets cancellation windows by calendar days", () => {
    const summary = summariseEventAbsences({
      ...thresholds,
      absences: [
        cancellation(-1),
        cancellation(0),
        cancellation(1),
        cancellation(3),
        cancellation(4),
        cancellation(7),
        cancellation(8),
        awol(),
      ],
    });
    expect(summary.window).toEqual({
      retrospective: 1,
      sameDay: 1,
      oneToThree: 2,
      fourToSeven: 2,
      sevenPlus: 1,
    });
    expect(summary.awols).toBe(1);
  });

  it("buckets exact-time notice and leaves date-only cancellations out of the hour chart", () => {
    const summary = summariseEventAbsences({
      ...thresholds,
      absences: [
        cancellation(2, { minutes: 24 * 60 + 1, reason: "Transport" }),
        cancellation(1, { minutes: 24 * 60, reason: "Transport" }),
        cancellation(1, { minutes: 12 * 60, reason: "  Childcare  " }),
        cancellation(0, { minutes: 12 * 60 - 1 }),
        cancellation(0, { minutes: -30, reason: "   " }),
        cancellation(5),
        cancellation(4, { minutes: null, basis: "EXACT_TIME" }),
      ],
    });
    expect(summary.noticeHours).toEqual({
      over24h: 1,
      twelveTo24h: 2,
      under12h: 1,
      retrospective: 1,
    });
    expect(summary.exactTimeCancellations).toBe(5);
    expect(summary.dateOnlyCancellations).toBe(2);
    expect(summary.reasons).toEqual([
      { reason: "Transport", count: 2 },
      { reason: "Childcare", count: 1 },
    ]);
    expect(summary.averageNoticeMinutes).toBe(
      Math.round((1441 + 1440 + 720 + 719 + -30) / 5),
    );
    expect(summary.averageNoticeCalendarDays).toBe(
      Math.round((2 + 1 + 1 + 0 + 0 + 5 + 4) / 7),
    );
  });
});
