import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  evaluateSicknessDates,
  normalizeIssueSummary,
  requiresAdvanceConfirmation,
  requiresCorrectionAdvanceConfirmation,
  unicodeCodePointLength,
} from "@/lib/absence/sickness";
import {
  ISSUE_SUMMARY_CHANGED_MARKER,
  redactHistoryChangesForPublicFeed,
} from "@/lib/absence/sensitive";
import { formatIssueSummary } from "@/lib/absence/display";

const timeZone = "Europe/London";
const now = new Date("2026-09-14T12:00:00.000Z");

describe("sickness date rules", () => {
  it("accepts reported date before, equal to, or after the first working day", () => {
    for (const reportedDate of ["2026-09-13", "2026-09-14", "2026-09-14"]) {
      const result = evaluateSicknessDates({
        reportedDate,
        firstWorkingDaySick: "2026-09-14",
        sicknessStartedDate: null,
        futureFirstWorkingDayConfirmed: false,
        timeZone,
        now,
        requireAdvanceConfirmation: true,
      });
      expect(result.ok).toBe(true);
    }
    const retrospective = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-09-10",
      sicknessStartedDate: "2026-09-09",
      futureFirstWorkingDayConfirmed: false,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(retrospective.ok).toBe(true);
  });

  it("rejects a future reported date and a future sickness-started date", () => {
    const reported = evaluateSicknessDates({
      reportedDate: "2026-09-15",
      firstWorkingDaySick: "2026-09-15",
      sicknessStartedDate: null,
      futureFirstWorkingDayConfirmed: true,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(reported.ok).toBe(false);
    if (!reported.ok) expect(reported.field).toBe("reportedDate");

    const started = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-09-16",
      sicknessStartedDate: "2026-09-15",
      futureFirstWorkingDayConfirmed: true,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.field).toBe("sicknessStartedDate");
  });

  it("rejects sickness started after the first working day and accepts before", () => {
    const after = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: "2026-09-15",
      futureFirstWorkingDayConfirmed: false,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(after.ok).toBe(false);

    const before = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: "2026-09-13",
      futureFirstWorkingDayConfirmed: false,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(before.ok).toBe(true);
  });

  it("requires confirmation for a future first working day", () => {
    expect(requiresAdvanceConfirmation("2026-09-15", "2026-09-14")).toBe(true);
    const unconfirmed = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-09-15",
      sicknessStartedDate: null,
      futureFirstWorkingDayConfirmed: false,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(unconfirmed.ok).toBe(false);
    if (!unconfirmed.ok) {
      expect(unconfirmed.field).toBe("futureFirstWorkingDayConfirmed");
    }
  });

  it("accepts the 31-day boundary and rejects beyond it", () => {
    expect(calendarDaysBetween("2026-09-14", "2026-10-15")).toBe(31);
    const boundary = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-10-15",
      sicknessStartedDate: null,
      futureFirstWorkingDayConfirmed: true,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(boundary.ok).toBe(true);

    const beyond = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2026-10-16",
      sicknessStartedDate: null,
      futureFirstWorkingDayConfirmed: true,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(beyond.ok).toBe(false);

    const typoYear = evaluateSicknessDates({
      reportedDate: "2026-09-14",
      firstWorkingDaySick: "2027-09-14",
      sicknessStartedDate: null,
      futureFirstWorkingDayConfirmed: true,
      timeZone,
      now,
      requireAdvanceConfirmation: true,
    });
    expect(typoYear.ok).toBe(false);
  });

  it("requires a fresh correction confirmation only when the first working day changes to a future value", () => {
    expect(
      requiresCorrectionAdvanceConfirmation({
        previousFirstWorkingDaySickIso: "2026-09-15",
        nextFirstWorkingDaySickIso: "2026-09-15",
        todayIso: "2026-09-14",
      }),
    ).toBe(false);
    expect(
      requiresCorrectionAdvanceConfirmation({
        previousFirstWorkingDaySickIso: "2026-09-14",
        nextFirstWorkingDaySickIso: "2026-09-16",
        todayIso: "2026-09-14",
      }),
    ).toBe(true);
  });
});

describe("issue summary normalisation", () => {
  it("trims, blank-normalises, preserves line breaks and counts Unicode code points", () => {
    expect(normalizeIssueSummary("  \n  ")).toEqual({ ok: true, value: null });
    expect(normalizeIssueSummary("Unable to work\nNo cover")).toEqual({
      ok: true,
      value: "Unable to work\nNo cover",
    });
    expect(unicodeCodePointLength("😀".repeat(1000))).toBe(1000);
    expect(normalizeIssueSummary("😀".repeat(1000)).ok).toBe(true);
    expect(normalizeIssueSummary("😀".repeat(1001)).ok).toBe(false);
    expect(formatIssueSummary(null)).toBe("No issue summary recorded");
    expect(formatIssueSummary("Line one\nLine two")).toBe("Line one\nLine two");
  });

  it("redacts issue summary from a public history feed", () => {
    const redacted = redactHistoryChangesForPublicFeed([
      { field: "staffId", previous: "A", next: "B" },
      { field: "issueSummary", previous: "secret", next: "also secret" },
    ]);
    expect(redacted).toEqual([
      { field: "staffId", previous: "A", next: "B" },
      {
        field: "issueSummary",
        previous: ISSUE_SUMMARY_CHANGED_MARKER,
        next: ISSUE_SUMMARY_CHANGED_MARKER,
      },
    ]);
  });
});
