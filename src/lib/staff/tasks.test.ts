import { describe, expect, it } from "vitest";
import { parseLocalDate } from "@/lib/events/dates";
import { currentTaskSpec, expectedTaskSpecs } from "@/lib/staff/tasks";

describe("probation task cadence", () => {
  const reviewDue = parseLocalDate("2026-03-04")!;
  const end = parseLocalDate("2026-04-01")!;

  it("creates no tasks before the review due date", () => {
    expect(expectedTaskSpecs(reviewDue, end, "2026-03-03")).toEqual([]);
    expect(currentTaskSpec(reviewDue, end, "2026-03-03")).toBeNull();
  });

  it("creates a review-due task on the review due date", () => {
    const specs = expectedTaskSpecs(reviewDue, end, "2026-03-04");
    expect(specs.map((spec) => spec.cadenceKey)).toEqual(["review-due:2026-03-04"]);
    expect(currentTaskSpec(reviewDue, end, "2026-03-04")?.cadenceKey).toBe(
      "review-due:2026-03-04",
    );
  });

  it("adds weekly chase tasks while review due", () => {
    const specs = expectedTaskSpecs(reviewDue, end, "2026-03-18");
    expect(specs.map((spec) => spec.cadenceKey)).toEqual([
      "review-due:2026-03-04",
      "chase:2026-03-11",
      "chase:2026-03-18",
    ]);
    expect(currentTaskSpec(reviewDue, end, "2026-03-18")?.cadenceKey).toBe(
      "chase:2026-03-18",
    );
  });

  it("creates an overdue escalation the day after the end date", () => {
    const specs = expectedTaskSpecs(reviewDue, end, "2026-04-02");
    expect(specs.some((spec) => spec.type === "OVERDUE_ESCALATION")).toBe(true);
    expect(
      specs.find((spec) => spec.type === "OVERDUE_ESCALATION")?.cadenceKey,
    ).toBe("overdue-escalation:2026-04-02");
    expect(currentTaskSpec(reviewDue, end, "2026-04-02")?.type).toBe(
      "OVERDUE_ESCALATION",
    );
  });

  it("adds weekly overdue chases after escalation without replacing it as current", () => {
    const specs = expectedTaskSpecs(reviewDue, end, "2026-04-16");
    const keys = specs.map((spec) => spec.cadenceKey);
    expect(keys).toContain("overdue-escalation:2026-04-02");
    expect(keys).toContain("chase:2026-04-09");
    expect(keys).toContain("chase:2026-04-16");
    expect(currentTaskSpec(reviewDue, end, "2026-04-16")?.cadenceKey).toBe(
      "overdue-escalation:2026-04-02",
    );
  });
});
