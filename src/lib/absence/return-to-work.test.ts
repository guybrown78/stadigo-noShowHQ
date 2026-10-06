import { describe, expect, it } from "vitest";
import { RETURN_TO_WORK_STATUSES } from "@/lib/absence/catalog";
import {
  RETURN_TO_WORK_STATUS_LABELS,
  returnToWorkChanges,
  returnToWorkDateApplies,
  returnToWorkDateFieldErrors,
  returnToWorkIsNoChange,
  returnToWorkSnapshot,
} from "@/lib/absence/return-to-work";
import { saveReturnToWorkSchema } from "@/lib/absence/return-to-work-schema";
import { redactHistoryChangesForPublicFeed } from "@/lib/absence/sensitive";

const today = "2026-09-14";
const key = "idempotency-key-1";

function input(overrides: Record<string, string> = {}) {
  return {
    absenceId: "absence-1",
    status: "OUTSTANDING",
    completedOn: "",
    note: "",
    correctionReason: "",
    expectedUpdatedAt: "",
    idempotencyKey: key,
    ...overrides,
  };
}

describe("return to work statuses", () => {
  it("uses the approved status list", () => {
    expect(RETURN_TO_WORK_STATUSES).toEqual([
      "NOT_RECORDED",
      "NOT_REQUIRED",
      "OUTSTANDING",
      "COMPLETED",
    ]);
    expect(Object.values(RETURN_TO_WORK_STATUS_LABELS)).toEqual([
      "Not recorded",
      "Not required",
      "Outstanding",
      "Completed",
    ]);
    expect(returnToWorkDateApplies("COMPLETED")).toBe(true);
    expect(returnToWorkDateApplies("OUTSTANDING")).toBe(false);
  });
});

describe("return to work dates", () => {
  it("requires a completion date only for Completed", () => {
    expect(
      returnToWorkDateFieldErrors({
        status: "COMPLETED",
        completedOn: "",
        todayIso: today,
      }).completedOn,
    ).toEqual(["Completion date is required"]);
    expect(
      returnToWorkDateFieldErrors({
        status: "OUTSTANDING",
        completedOn: "2026-09-01",
        todayIso: today,
      }).completedOn,
    ).toEqual(["Completion date does not apply to this return-to-work status"]);
    expect(
      returnToWorkDateFieldErrors({
        status: "NOT_REQUIRED",
        completedOn: "",
        todayIso: today,
      }),
    ).toEqual({});
  });

  it("accepts a retrospective date and rejects a future date", () => {
    expect(
      returnToWorkDateFieldErrors({
        status: "COMPLETED",
        completedOn: "2026-09-01",
        todayIso: today,
      }),
    ).toEqual({});
    expect(
      returnToWorkDateFieldErrors({
        status: "COMPLETED",
        completedOn: today,
        todayIso: today,
      }),
    ).toEqual({});
    expect(
      returnToWorkDateFieldErrors({
        status: "COMPLETED",
        completedOn: "2026-09-15",
        todayIso: today,
      }).completedOn,
    ).toEqual(["Enter a date that is not in the future."]);
  });
});

describe("return to work change rules", () => {
  it("treats a first Not recorded save with no date or note as no change", () => {
    const empty = returnToWorkSnapshot({
      status: "NOT_RECORDED",
      completedOn: "",
      note: "   ",
    });
    expect(returnToWorkIsNoChange(null, empty)).toBe(true);
    expect(
      returnToWorkIsNoChange(
        null,
        returnToWorkSnapshot({
          status: "OUTSTANDING",
          completedOn: "",
          note: "",
        }),
      ),
    ).toBe(false);
  });

  it("clears the completion date when leaving Completed and keeps it in the diff", () => {
    const previous = {
      status: "COMPLETED" as const,
      completedOn: "2026-09-01",
      note: "Held the meeting",
    };
    const next = returnToWorkSnapshot({
      status: "OUTSTANDING",
      completedOn: "2026-09-01",
      note: "Held the meeting",
    });
    expect(next.completedOn).toBeNull();
    expect(returnToWorkIsNoChange(previous, next)).toBe(false);
    expect(returnToWorkChanges(previous, next)).toEqual([
      {
        field: "returnToWorkStatus",
        previous: "COMPLETED",
        next: "OUTSTANDING",
      },
      {
        field: "returnToWorkCompletedOn",
        previous: "2026-09-01",
        next: null,
      },
    ]);
  });

  it("redacts the note for a public feed", () => {
    const changes = returnToWorkChanges(null, {
      status: "OUTSTANDING",
      completedOn: null,
      note: "Secret administrative note",
    });
    const redacted = redactHistoryChangesForPublicFeed(changes);
    expect(redacted.find((change) => change.field === "returnToWorkNote")).toEqual({
      field: "returnToWorkNote",
      previous: "Return to work note changed",
      next: "Return to work note changed",
    });
    expect(JSON.stringify(redacted)).not.toContain("Secret administrative note");
    expect(redacted.find((change) => change.field === "returnToWorkStatus")?.next).toBe(
      "OUTSTANDING",
    );
  });
});

describe("return to work schema", () => {
  it("does not require a correction reason on the first save", () => {
    expect(saveReturnToWorkSchema(today).safeParse(input()).success).toBe(true);
  });

  it("requires a correction reason when a row was already saved", () => {
    const parsed = saveReturnToWorkSchema(today).safeParse(
      input({
        status: "NOT_REQUIRED",
        correctionReason: "x",
        expectedUpdatedAt: "2026-09-14T12:00:00.000Z",
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a future completion date and a date on another status", () => {
    expect(
      saveReturnToWorkSchema(today).safeParse(
        input({ status: "COMPLETED", completedOn: "2026-09-15" }),
      ).success,
    ).toBe(false);
    expect(
      saveReturnToWorkSchema(today).safeParse(
        input({ status: "OUTSTANDING", completedOn: "2026-09-01" }),
      ).success,
    ).toBe(false);
    expect(
      saveReturnToWorkSchema(today).safeParse(
        input({ status: "COMPLETED", completedOn: "2026-08-01" }),
      ).success,
    ).toBe(true);
  });
});
