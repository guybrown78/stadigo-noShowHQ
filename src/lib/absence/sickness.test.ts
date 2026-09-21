import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  correctionConflictsWithEndedEpisode,
  defaultSicknessEpisodeState,
  evaluateSicknessDates,
  evaluateSicknessEpisodeUpdate,
  formatCalendarDaySpan,
  inclusiveCalendarDaySpan,
  normalizeIssueSummary,
  requiresAdvanceConfirmation,
  requiresCorrectionAdvanceConfirmation,
  sicknessEpisodeHistoryChanges,
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

describe("sickness episode state", () => {
  it("defaults existing and new reports to NOT_CONFIRMED", () => {
    expect(defaultSicknessEpisodeState()).toBe("NOT_CONFIRMED");
  });

  it("calculates an inclusive calendar-day span only when an end date exists", () => {
    expect(inclusiveCalendarDaySpan("2026-09-15", "2026-09-15")).toBe(1);
    expect(inclusiveCalendarDaySpan("2026-09-15", "2026-09-17")).toBe(3);
    expect(formatCalendarDaySpan(1)).toBe("1 calendar day");
    expect(formatCalendarDaySpan(3)).toBe("3 calendar days");
    expect(inclusiveCalendarDaySpan("2026-09-15", null)).toBeNull();
    expect(inclusiveCalendarDaySpan(null, "2026-09-17")).toBeNull();
  });

  it("accepts same-day, multi-day and retrospective end dates", () => {
    const sameDay = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-14",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(sameDay.ok).toBe(true);

    const multiDay = evaluateSicknessEpisodeUpdate({
      currentState: "ONGOING",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-14",
      firstWorkingDaySick: "2026-09-12",
      sicknessStartedDate: "2026-09-11",
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(multiDay.ok).toBe(true);

    const retrospective = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-10",
      firstWorkingDaySick: "2026-09-10",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(retrospective.ok).toBe(true);
  });

  it("rejects future, pre-start and pre-first-working-day end dates", () => {
    const future = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-15",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.field).toBe("sicknessEndedDate");

    const beforeFirst = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-13",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(beforeFirst.ok).toBe(false);

    const beforeStarted = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-12",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: "2026-09-13",
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(beforeStarted.ok).toBe(false);
  });

  it("rejects invalid state and date combinations and no-change saves", () => {
    const ongoingWithDate = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ONGOING",
      nextEndedDateIso: "2026-09-14",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(ongoingWithDate.ok).toBe(false);

    const endedWithoutDate = evaluateSicknessEpisodeUpdate({
      currentState: "NOT_CONFIRMED",
      currentEndedDateIso: null,
      nextState: "ENDED",
      nextEndedDateIso: null,
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(endedWithoutDate.ok).toBe(false);

    const noChangeOngoing = evaluateSicknessEpisodeUpdate({
      currentState: "ONGOING",
      currentEndedDateIso: null,
      nextState: "ONGOING",
      nextEndedDateIso: null,
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(noChangeOngoing.ok).toBe(false);

    const sameEndedDate = evaluateSicknessEpisodeUpdate({
      currentState: "ENDED",
      currentEndedDateIso: "2026-09-14",
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-14",
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: "Still the same date",
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(sameEndedDate.ok).toBe(false);
  });

  it("requires a reason to correct an ended date and confirmation to clear it", () => {
    const missingReason = evaluateSicknessEpisodeUpdate({
      currentState: "ENDED",
      currentEndedDateIso: "2026-09-14",
      nextState: "ENDED",
      nextEndedDateIso: "2026-09-13",
      firstWorkingDaySick: "2026-09-12",
      sicknessStartedDate: null,
      correctionReason: null,
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(missingReason.ok).toBe(false);
    if (!missingReason.ok) expect(missingReason.field).toBe("correctionReason");

    const missingConfirm = evaluateSicknessEpisodeUpdate({
      currentState: "ENDED",
      currentEndedDateIso: "2026-09-14",
      nextState: "ONGOING",
      nextEndedDateIso: null,
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: "End date was wrong",
      confirmClearEndDate: false,
      timeZone,
      now,
    });
    expect(missingConfirm.ok).toBe(false);
    if (!missingConfirm.ok) {
      expect(missingConfirm.field).toBe("confirmClearEndDate");
    }

    const cleared = evaluateSicknessEpisodeUpdate({
      currentState: "ENDED",
      currentEndedDateIso: "2026-09-14",
      nextState: "ONGOING",
      nextEndedDateIso: null,
      firstWorkingDaySick: "2026-09-14",
      sicknessStartedDate: null,
      correctionReason: "End date was wrong",
      confirmClearEndDate: true,
      timeZone,
      now,
    });
    expect(cleared.ok).toBe(true);
  });

  it("audits old and new episode state and end date", () => {
    expect(
      sicknessEpisodeHistoryChanges({
        previousState: "NOT_CONFIRMED",
        nextState: "ENDED",
        previousEndedDateIso: null,
        nextEndedDateIso: "2026-09-14",
      }),
    ).toEqual([
      {
        field: "episodeState",
        previous: "NOT_CONFIRMED",
        next: "ENDED",
      },
      {
        field: "sicknessEndedDate",
        previous: null,
        next: "2026-09-14",
      },
    ]);
  });

  it("rejects a Part 1 correction that would put source dates after an existing end date", () => {
    expect(
      correctionConflictsWithEndedEpisode({
        firstWorkingDaySickIso: "2026-09-16",
        sicknessStartedDateIso: null,
        episodeState: "ENDED",
        sicknessEndedDateIso: "2026-09-15",
      })?.field,
    ).toBe("firstWorkingDaySick");
    expect(
      correctionConflictsWithEndedEpisode({
        firstWorkingDaySickIso: "2026-09-15",
        sicknessStartedDateIso: "2026-09-16",
        episodeState: "ENDED",
        sicknessEndedDateIso: "2026-09-15",
      })?.field,
    ).toBe("sicknessStartedDate");
    expect(
      correctionConflictsWithEndedEpisode({
        firstWorkingDaySickIso: "2026-09-15",
        sicknessStartedDateIso: null,
        episodeState: "ENDED",
        sicknessEndedDateIso: "2026-09-15",
      }),
    ).toBeNull();
  });
});
