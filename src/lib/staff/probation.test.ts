import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  calculatedProbationEndDate,
  calculatedReviewDueDate,
  resolveProbation,
} from "@/lib/staff/probation";
import { formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

describe("probation calculation", () => {
  it("adds calendar days on UTC dates without shifting the day", () => {
    const start = parseLocalDate("2026-01-01");
    expect(start).not.toBeNull();
    if (!start) return;
    expect(formatLocalDateIso(addCalendarDays(start, 90))).toBe("2026-04-01");
  });

  it("sets review due 28 days before the end date", () => {
    const end = parseLocalDate("2026-04-01");
    expect(end).not.toBeNull();
    if (!end) return;
    expect(formatLocalDateIso(calculatedReviewDueDate(end))).toBe("2026-03-04");
  });

  it("leaves probation empty when it is not applied", () => {
    const result = resolveProbation({
      applyProbation: false,
      startDate: "2026-01-01",
      durationOverride: 60,
      overrideEndDate: false,
      endDateOverride: null,
      requestedStatus: "IN_PROGRESS",
      tenantDefaultDays: 90,
      todayIso: "2026-08-27",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationStatus).toBe("NOT_APPLICABLE");
    expect(result.value.probationEndDate).toBeNull();
    expect(result.value.probationReviewDueDate).toBeNull();
  });

  it("uses the tenant default duration when no override is supplied", () => {
    const result = resolveProbation({
      applyProbation: true,
      startDate: "2026-01-01",
      durationOverride: null,
      overrideEndDate: false,
      endDateOverride: null,
      requestedStatus: "IN_PROGRESS",
      tenantDefaultDays: 90,
      todayIso: "2026-08-27",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationLengthDays).toBeNull();
    expect(formatLocalDateIso(result.value.probationEndDate!)).toBe("2026-04-01");
    expect(formatLocalDateIso(result.value.probationReviewDueDate!)).toBe(
      "2026-03-04",
    );
  });

  it("uses a per-staff duration override", () => {
    const start = parseLocalDate("2026-01-01")!;
    const result = resolveProbation({
      applyProbation: true,
      startDate: "2026-01-01",
      durationOverride: 30,
      overrideEndDate: false,
      endDateOverride: null,
      requestedStatus: "IN_PROGRESS",
      tenantDefaultDays: 90,
      todayIso: "2026-08-27",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationLengthDays).toBe(30);
    expect(formatLocalDateIso(result.value.probationEndDate!)).toBe(
      formatLocalDateIso(calculatedProbationEndDate(start, 30)),
    );
  });

  it("honours a deliberate end-date override and recalculates review due", () => {
    const result = resolveProbation({
      applyProbation: true,
      startDate: "2026-01-01",
      durationOverride: 90,
      overrideEndDate: true,
      endDateOverride: "2026-06-01",
      requestedStatus: "IN_PROGRESS",
      tenantDefaultDays: 90,
      todayIso: "2026-08-27",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationEndDateOverridden).toBe(true);
    expect(formatLocalDateIso(result.value.probationEndDate!)).toBe("2026-06-01");
    expect(formatLocalDateIso(result.value.probationReviewDueDate!)).toBe(
      "2026-05-04",
    );
  });

  it("clears review due when probation is passed", () => {
    const result = resolveProbation({
      applyProbation: true,
      startDate: "2026-01-01",
      durationOverride: null,
      overrideEndDate: false,
      endDateOverride: null,
      requestedStatus: "PASSED",
      tenantDefaultDays: 90,
      todayIso: "2026-08-27",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationStatus).toBe("PASSED");
    expect(result.value.probationReviewDueDate).toBeNull();
  });

  it("requires a future end date for extended probation", () => {
    const result = resolveProbation({
      applyProbation: true,
      startDate: "2026-01-01",
      durationOverride: null,
      overrideEndDate: true,
      endDateOverride: "2026-08-01",
      requestedStatus: "EXTENDED",
      tenantDefaultDays: 90,
      todayIso: "2026-08-27",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.probationEndDate?.[0]).toMatch(/future/i);
  });
});
