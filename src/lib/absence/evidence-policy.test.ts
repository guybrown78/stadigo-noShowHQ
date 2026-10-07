import { describe, expect, it } from "vitest";
import { todayIsoInTimeZone } from "@/lib/absence/timezone";
import {
  chaseDueDateIso,
  evidenceRequirementView,
  inclusiveEndedDays,
  parseEvidenceDayCount,
  requirementDateIso,
  sicknessDayOneIso,
} from "@/lib/absence/evidence-policy";

describe("sickness evidence day counts", () => {
  it("rejects zero, negatives, fractions and blank values", () => {
    for (const value of ["0", "-1", "8.5", "1.0", "", " ", "eight", "730.1"]) {
      expect(parseEvidenceDayCount(value).ok).toBe(false);
    }
    expect(parseEvidenceDayCount("8")).toEqual({ ok: true, value: 8 });
    expect(parseEvidenceDayCount("730")).toEqual({ ok: true, value: 730 });
    expect(parseEvidenceDayCount("731").ok).toBe(false);
  });
});

describe("requirement and chase dates", () => {
  it("uses the earliest sickness calendar date as day 1", () => {
    expect(
      sicknessDayOneIso({
        sicknessStartedDateIso: "2026-10-03",
        firstWorkingDaySickIso: "2026-10-05",
      }),
    ).toBe("2026-10-03");
    expect(
      sicknessDayOneIso({
        sicknessStartedDateIso: null,
        firstWorkingDaySickIso: "2026-10-01",
      }),
    ).toBe("2026-10-01");
  });

  it("counts calendar days across weekends, months, years and leap day", () => {
    expect(requirementDateIso("2026-10-01", 8)).toBe("2026-10-08");
    expect(requirementDateIso("2026-10-03", 8)).toBe("2026-10-10");
    expect(requirementDateIso("2026-01-28", 8)).toBe("2026-02-04");
    expect(requirementDateIso("2026-12-28", 8)).toBe("2027-01-04");
    expect(requirementDateIso("2024-02-22", 8)).toBe("2024-02-29");
    expect(requirementDateIso("2024-02-27", 8)).toBe("2024-03-05");
    expect(chaseDueDateIso("2026-10-08", 5)).toBe("2026-10-13");
    expect(inclusiveEndedDays("2026-10-01", "2026-10-07")).toBe(7);
    expect(inclusiveEndedDays("2026-10-01", "2026-10-08")).toBe(8);
  });

  it("keeps ended day 7 below the threshold and day 8 on it", () => {
    const requirementDate = requirementDateIso("2026-10-01", 8);
    expect(
      evidenceRequirementView({
        episodeState: "ENDED",
        requiredFromDay: 8,
        requirementDate,
        todayIso: "2026-10-20",
        sicknessEndedDateIso: "2026-10-07",
      }).kind,
    ).toBe("not_reached");
    expect(
      evidenceRequirementView({
        episodeState: "ENDED",
        requiredFromDay: 8,
        requirementDate,
        todayIso: "2026-10-20",
        sicknessEndedDateIso: "2026-10-08",
      }).kind,
    ).toBe("reached");
  });

  it("does not invent a requirement for an unconfirmed episode", () => {
    expect(
      evidenceRequirementView({
        episodeState: "NOT_CONFIRMED",
        requiredFromDay: 8,
        requirementDate: "2026-10-08",
        todayIso: "2026-10-20",
        sicknessEndedDateIso: null,
      }).kind,
    ).toBe("confirmation_needed");
    expect(
      evidenceRequirementView({
        episodeState: "ONGOING",
        requiredFromDay: null,
        requirementDate: null,
        todayIso: "2026-10-20",
        sicknessEndedDateIso: null,
      }).kind,
    ).toBe("inactive");
  });

  it("uses the tenant timezone around the London DST change", () => {
    expect(todayIsoInTimeZone("Europe/London", new Date("2026-10-24T22:30:00.000Z"))).toBe(
      "2026-10-24",
    );
    expect(todayIsoInTimeZone("Europe/London", new Date("2026-10-24T23:30:00.000Z"))).toBe(
      "2026-10-25",
    );
    expect(todayIsoInTimeZone("Europe/London", new Date("2026-10-25T00:30:00.000Z"))).toBe(
      "2026-10-25",
    );
    const view = evidenceRequirementView({
      episodeState: "ONGOING",
      requiredFromDay: 8,
      requirementDate: "2026-10-25",
      todayIso: todayIsoInTimeZone(
        "Europe/London",
        new Date("2026-10-24T23:30:00.000Z"),
      ),
      sicknessEndedDateIso: null,
    });
    expect(view.kind).toBe("reached");
  });
});
