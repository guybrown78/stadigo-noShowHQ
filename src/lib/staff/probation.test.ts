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
      tenantDefaultDays: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationStatus).toBe("NOT_APPLICABLE");
    expect(result.value.probationEndDate).toBeNull();
    expect(result.value.durationSource).toBeNull();
  });

  it("snapshots the tenant default duration when no override is supplied", () => {
    const result = resolveProbation({
      applyProbation: true,
      startDate: "2026-01-01",
      durationOverride: null,
      overrideEndDate: false,
      endDateOverride: null,
      tenantDefaultDays: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationLengthDays).toBe(90);
    expect(result.value.durationSource).toBe("TENANT_DEFAULT");
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
      tenantDefaultDays: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationLengthDays).toBe(30);
    expect(result.value.durationSource).toBe("INDIVIDUAL_OVERRIDE");
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
      tenantDefaultDays: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.probationEndDateOverridden).toBe(true);
    expect(result.value.durationSource).toBe("MANUAL_END_DATE");
    expect(formatLocalDateIso(result.value.probationEndDate!)).toBe("2026-06-01");
    expect(formatLocalDateIso(result.value.probationReviewDueDate!)).toBe(
      "2026-05-04",
    );
  });

  it("requires a start date when probation is applied", () => {
    const result = resolveProbation({
      applyProbation: true,
      startDate: null,
      durationOverride: null,
      overrideEndDate: false,
      endDateOverride: null,
      tenantDefaultDays: 90,
    });
    expect(result.ok).toBe(false);
  });
});
