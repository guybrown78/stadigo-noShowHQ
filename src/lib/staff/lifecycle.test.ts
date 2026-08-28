import { describe, expect, it } from "vitest";
import { parseLocalDate } from "@/lib/events/dates";
import { deriveProbationLifecycle } from "@/lib/staff/lifecycle";

describe("probation lifecycle", () => {
  const end = parseLocalDate("2026-04-01")!;
  const reviewDue = parseLocalDate("2026-03-04")!;

  it("is upcoming before the review due date", () => {
    expect(
      deriveProbationLifecycle({
        status: "IN_PROGRESS",
        completedAt: null,
        reviewDueDate: reviewDue,
        currentEndDate: end,
        todayIso: "2026-03-03",
      }),
    ).toBe("UPCOMING");
  });

  it("is review due on the review due date through the end date", () => {
    expect(
      deriveProbationLifecycle({
        status: "IN_PROGRESS",
        completedAt: null,
        reviewDueDate: reviewDue,
        currentEndDate: end,
        todayIso: "2026-03-04",
      }),
    ).toBe("REVIEW_DUE");
    expect(
      deriveProbationLifecycle({
        status: "EXTENDED",
        completedAt: null,
        reviewDueDate: reviewDue,
        currentEndDate: end,
        todayIso: "2026-04-01",
      }),
    ).toBe("REVIEW_DUE");
  });

  it("is overdue after the end date until a completion decision", () => {
    expect(
      deriveProbationLifecycle({
        status: "IN_PROGRESS",
        completedAt: null,
        reviewDueDate: reviewDue,
        currentEndDate: end,
        todayIso: "2026-04-02",
      }),
    ).toBe("OVERDUE");
  });

  it("shows passed and not continued as distinct closed states", () => {
    expect(
      deriveProbationLifecycle({
        status: "PASSED",
        completedAt: parseLocalDate("2026-03-20"),
        reviewDueDate: reviewDue,
        currentEndDate: end,
        todayIso: "2026-04-10",
      }),
    ).toBe("PASSED");
    expect(
      deriveProbationLifecycle({
        status: "NOT_CONTINUED",
        completedAt: parseLocalDate("2026-03-20"),
        reviewDueDate: reviewDue,
        currentEndDate: end,
        todayIso: "2026-04-10",
      }),
    ).toBe("NOT_CONTINUED");
  });

  it("surfaces missing dates instead of guessing", () => {
    expect(
      deriveProbationLifecycle({
        status: "IN_PROGRESS",
        completedAt: null,
        reviewDueDate: null,
        currentEndDate: null,
        todayIso: "2026-04-02",
      }),
    ).toBe("NEEDS_DATES");
  });
});
